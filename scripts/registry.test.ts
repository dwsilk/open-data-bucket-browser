import { describe, expect, it } from 'vitest';
import {
  cleanMarkdown,
  DESCRIPTION_LIMIT,
  keepListable,
  normalise,
  organisation,
  parseBucketArn,
  parseGitDates,
  plainText,
  RawEntry,
  shorten,
} from './registry';
import type { BucketAccess } from '../src/modules/registry/types';

function entry(overrides: Record<string, unknown> = {}): RawEntry {
  return RawEntry.parse({
    Name: 'Example dataset',
    Description: 'An **example** with a [link](https://example.org).',
    Documentation: 'https://example.org/docs',
    Contact: 'data@example.org',
    ManagedBy: '[Example Org](https://example.org)',
    UpdateFrequency: 'Daily',
    Tags: ['geospatial', 'cog '],
    License: 'CC BY 4.0',
    Resources: [
      {
        Description: 'Data',
        ARN: 'arn:aws:s3:::example-bucket',
        Region: 'us-west-2',
        Type: 'S3 Bucket',
      },
    ],
    ...overrides,
  });
}

describe('parseBucketArn', () => {
  it.each([
    ['arn:aws:s3:::sentinel-cogs', { bucket: 'sentinel-cogs', prefix: '' }],
    ['arn:aws:s3:::physionet-open/aami-ec13/', { bucket: 'physionet-open', prefix: 'aami-ec13/' }],
    ['arn:aws:s3:::bucket/a/b', { bucket: 'bucket', prefix: 'a/b/' }],
    ['arn:aws:s3:::bucket/data/*', { bucket: 'bucket', prefix: 'data/' }],
    ['arn:aws:s3:::bucket/*', { bucket: 'bucket', prefix: '' }],
    [
      'arn:aws:s3:::us-west-2.opendata.source.coop/tge-labs/aef',
      { bucket: 'us-west-2.opendata.source.coop', prefix: 'tge-labs/aef/' },
    ],
  ])('splits %s', (arn, expected) => {
    expect(parseBucketArn(arn)).toEqual(expected);
  });

  it('rejects access points and other services', () => {
    expect(parseBucketArn('arn:aws:s3:us-east-1:123:accesspoint/x/')).toBeNull();
    expect(parseBucketArn('arn:aws:sns:us-west-2:123:topic')).toBeNull();
  });
});

describe('RawEntry', () => {
  it('reads string booleans and trims values the way the registry spells them', () => {
    const parsed = entry({
      Resources: [
        {
          Description: 'x',
          ARN: 'arn:aws:s3:::b',
          Region: 'us-east-1',
          Type: 'S3 Bucket  ',
          RequesterPays: 'True',
        },
      ],
    });
    expect(parsed.Resources?.[0]?.Type).toBe('S3 Bucket');
    expect(parsed.Resources?.[0]?.RequesterPays).toBe(true);
    expect(parsed.Tags).toEqual(['geospatial', 'cog']);
  });

  it('accepts an entry with optional fields missing', () => {
    expect(() => RawEntry.parse({ Name: 'Minimal', Resources: [] })).not.toThrow();
  });
});

describe('normalise', () => {
  it('keeps anonymous buckets for browsing and everything else as other resources', () => {
    const result = normalise(
      'example',
      entry({
        Resources: [
          { Description: 'open', ARN: 'arn:aws:s3:::open', Region: 'eu-west-1', Type: 'S3 Bucket' },
          {
            Description: 'pays',
            ARN: 'arn:aws:s3:::pays',
            Region: 'us-east-1',
            Type: 'S3 Bucket',
            RequesterPays: true,
          },
          {
            Description: 'nasa',
            ARN: 'arn:aws:s3:::nasa',
            Region: 'us-west-2',
            Type: 'S3 Bucket',
            ControlledAccess: 'https://example.org/creds',
          },
          {
            Description: 'topic',
            ARN: 'arn:aws:sns:us-east-1:1:t',
            Region: 'us-east-1',
            Type: 'SNS Topic',
          },
        ],
      }),
    );
    expect(result?.summary.buckets.map(b => b.bucket)).toEqual(['open']);
    expect(result?.detail.otherResources.map(r => r.identifier)).toEqual([
      'arn:aws:s3:::pays',
      'arn:aws:s3:::nasa',
      'arn:aws:sns:us-east-1:1:t',
    ]);
    expect(result?.detail.otherResources[1]?.controlledAccess).toBe('https://example.org/creds');
  });

  it('drops deprecated entries and entries with no public bucket', () => {
    expect(normalise('x', entry({ Deprecated: true }))).toBeNull();
    expect(normalise('x', entry({ Resources: [] }))).toBeNull();
  });

  it('lists a bucket and prefix once even when the registry repeats it', () => {
    const resource = {
      Description: 'd',
      ARN: 'arn:aws:s3:::bkt/p',
      Region: 'r',
      Type: 'S3 Bucket',
    };
    const result = normalise('x', entry({ Resources: [resource, resource] }));
    expect(result?.summary.buckets).toHaveLength(1);
  });

  it('shares bucket objects between summary and detail, so the probe updates both', () => {
    const result = normalise('x', entry());
    expect(result?.summary.buckets[0]).toBe(result?.detail.buckets[0]);
  });

  it('takes dates from git history when the YAML has none', () => {
    const result = normalise('x', entry(), { added: '2019-01-02', modified: '2024-05-06' });
    expect(result?.detail.added).toBe('2019-01-02');
    expect(result?.summary.modified).toBe('2024-05-06');
  });

  it('shortens a very long description at a paragraph break', () => {
    const paragraph = `${'word '.repeat(200)}\n\n`;
    const long = paragraph.repeat(Math.ceil(DESCRIPTION_LIMIT / paragraph.length) + 5);
    const result = normalise('x', entry({ Description: long }));
    expect(result?.detail.descriptionTruncated).toBe(true);
    expect(result?.detail.description.length).toBeLessThanOrEqual(DESCRIPTION_LIMIT);
    expect(result?.detail.description.endsWith('word ')).toBe(true);
  });
});

describe('text helpers', () => {
  it('flattens Markdown to plain text', () => {
    expect(plainText('# Title\n\nSome **bold** [link](https://x.org) <br/> text')).toBe(
      'Title Some bold link text',
    );
  });

  it('shortens at a word boundary', () => {
    expect(shorten('alpha beta gamma delta', 13)).toBe('alpha beta…');
    expect(shorten('short', 10)).toBe('short');
  });

  it('rewrites formatting tags as Markdown and leaves placeholders alone', () => {
    expect(cleanMarkdown('a<br/>b <b>c</b> <a href="https://x.org">d</a> s3://b/<aqyear>/')).toBe(
      'a  \nb **c** [d](https://x.org) s3://b/<aqyear>/',
    );
  });
});

describe('organisation', () => {
  it.each([
    ['[Example Org](https://example.org)', 'Example Org'],
    [
      'U.S. Environmental Protection Agency (https://www.epa.gov)',
      'U.S. Environmental Protection Agency',
    ],
    ['NRCan https://a.example/x https://b.example/y', 'NRCan'],
    ['NOAA', 'NOAA'],
    ['"[NOAA](http://www.noaa.gov/)"', 'NOAA'],
    [
      '(Human Pangenome Reference Consortium)[https://humanpangenome.org/]',
      'Human Pangenome Reference Consortium',
    ],
    ['"[Group A](https://a.example)"\n"[Group B](https://b.example)"', 'Group A, Group B'],
  ])('reads %s as %s', (managedBy, expected) => {
    expect(organisation(managedBy)).toBe(expected);
  });
});

describe('parseGitDates', () => {
  it('takes the newest commit as modified and the oldest as added', () => {
    const log = [
      '\u00002024-03-01\n\ndatasets/a.yaml\n',
      '\u00002023-02-01\n\ndatasets/a.yaml\ndatasets/b.yaml\n',
      '\u00002022-01-01\n',
      '\u00002021-01-01\n\ndatasets/a.yaml\n',
    ].join('');
    const dates = parseGitDates(log);
    expect(dates.get('a')).toEqual({ added: '2021-01-01', modified: '2024-03-01' });
    expect(dates.get('b')).toEqual({ added: '2023-02-01', modified: '2023-02-01' });
  });
});

describe('keepListable', () => {
  function probed(accesses: BucketAccess[]) {
    const result = normalise(
      'x',
      entry({
        Resources: accesses.map((_, i) => ({
          Description: `bucket ${i}`,
          ARN: `arn:aws:s3:::bucket-${i}/data/`,
          Region: 'us-west-2',
          Type: 'S3 Bucket',
          Explore: [`[Explorer ${i}](https://example.org/${i})`],
        })),
      }),
    );
    if (!result) throw new Error('fixture has no public bucket');
    result.detail.buckets.forEach((bucket, i) => {
      bucket.access = accesses[i] ?? 'unchecked';
    });
    return result;
  }

  it('drops a dataset with no bucket that a web page can list', () => {
    expect(keepListable(probed(['no-cors', 'denied', 'missing']))).toBeNull();
  });

  it('keeps every bucket when the probe was skipped', () => {
    expect(keepListable(probed(['unchecked', 'unchecked']))?.summary.buckets).toHaveLength(2);
  });

  it('moves the unlistable buckets of a kept dataset to other resources', () => {
    const kept = keepListable(probed(['no-cors', 'browsable']));
    expect(kept?.summary.buckets.map(b => b.bucket)).toEqual(['bucket-1']);
    expect(kept?.detail.buckets).toBe(kept?.summary.buckets);
    expect(kept?.detail.otherResources).toContainEqual(
      expect.objectContaining({
        type: 'S3 Bucket',
        identifier: 'arn:aws:s3:::bucket-0/data/',
        access: 'no-cors',
      }),
    );
    expect(Object.keys(kept?.detail.explore ?? {})).toEqual(['bucket-1/data/']);
  });
});
