import { describe, expect, it } from 'vitest';
import { bucketEndpoint, cliCopy, encodeKey, listUrl, objectUrl } from './urls';

describe('bucketEndpoint', () => {
  it('uses virtual-hosted addressing for a plain bucket name', () => {
    expect(bucketEndpoint('sentinel-cogs', 'us-west-2')).toBe(
      'https://sentinel-cogs.s3.us-west-2.amazonaws.com/',
    );
  });

  it('uses path-style addressing when the name has a dot, which the TLS wildcard cannot match', () => {
    expect(bucketEndpoint('us-west-2.opendata.source.coop', 'us-west-2')).toBe(
      'https://s3.us-west-2.amazonaws.com/us-west-2.opendata.source.coop/',
    );
  });
});

describe('listUrl', () => {
  it('asks for ListObjectsV2 grouped at /', () => {
    const url = new URL(listUrl({ bucket: 'b', region: 'us-east-1', prefix: 'a b/' }));
    expect(url.searchParams.get('list-type')).toBe('2');
    expect(url.searchParams.get('delimiter')).toBe('/');
    expect(url.searchParams.get('prefix')).toBe('a b/');
    expect(url.searchParams.has('continuation-token')).toBe(false);
  });

  it('carries the continuation token and leaves out an empty prefix', () => {
    const url = new URL(
      listUrl({ bucket: 'b', region: 'r', prefix: '', continuationToken: 'x+y/z=' }),
    );
    expect(url.searchParams.get('continuation-token')).toBe('x+y/z=');
    expect(url.searchParams.has('prefix')).toBe(false);
  });
});

describe('object addresses', () => {
  it('encodes each key segment but keeps the slashes', () => {
    expect(encodeKey('a b/c+d/e#f?.txt')).toBe('a%20b/c%2Bd/e%23f%3F.txt');
    expect(objectUrl('b', 'r', 'x/y z')).toBe('https://b.s3.r.amazonaws.com/x/y%20z');
  });

  it('quotes CLI arguments that a shell would split or expand', () => {
    expect(cliCopy('b', 'plain/a.txt')).toBe('aws s3 cp --no-sign-request s3://b/plain/a.txt .');
    expect(cliCopy('b', "it's $HOME.txt")).toBe(
      `aws s3 cp --no-sign-request 's3://b/it'\\''s $HOME.txt' .`,
    );
  });
});
