import { describe, expect, it } from 'vitest';
import type { DatasetSummary } from '../registry/types';
import { DatasetSearch } from './search';

function dataset(slug: string, name: string, extra: Partial<DatasetSummary> = {}): DatasetSummary {
  return {
    slug,
    name,
    summary: '',
    tags: [],
    managedBy: '',
    modified: '2024-01-01',
    buckets: [
      { bucket: slug, prefix: '', region: 'us-east-1', description: '', access: 'browsable' },
    ],
    ...extra,
  };
}

const DATASETS = [
  dataset('clay', 'Clay v1.5 Sentinel-2', { summary: 'Embeddings from Sentinel-2 imagery.' }),
  dataset('s2', 'Sentinel-2', { tags: ['satellite imagery'] }),
  dataset('goes', 'NOAA GOES', { managedBy: 'NOAA', tags: ['weather'] }),
  dataset('genomes', '1000 Genomes', { summary: 'Mentions sentinel once.' }),
];
const search = new DatasetSearch(DATASETS);
const slugs = (list: DatasetSummary[]) => list.map(d => d.slug);

describe('DatasetSearch', () => {
  it('requires every word to match somewhere', () => {
    expect(slugs(search.search({ query: 'noaa weather', tag: null, org: null }))).toEqual(['goes']);
    expect(search.search({ query: 'noaa genomes', tag: null, org: null })).toEqual([]);
  });

  it('puts the dataset whose name is the query first', () => {
    const result = search.search({ query: 'sentinel 2', tag: null, org: null });
    expect(slugs(result)[0]).toBe('s2');
  });

  it('ranks a name match above a description match', () => {
    const result = search.search({ query: 'sentinel', tag: null, org: null });
    expect(slugs(result).at(-1)).toBe('genomes');
  });

  it('filters by tag', () => {
    expect(slugs(search.search({ query: '', tag: 'weather', org: null }))).toEqual(['goes']);
  });

  it('lists alphabetically when there is no query', () => {
    expect(slugs(search.search({ query: '', tag: null, org: null }))).toEqual([
      'genomes',
      'clay',
      'goes',
      's2',
    ]);
  });

  it('matches bucket names', () => {
    expect(slugs(search.search({ query: 'goes', tag: null, org: null }))).toEqual(['goes']);
  });

  it('filters by organisation, matching the name exactly', () => {
    expect(slugs(search.search({ query: '', tag: null, org: 'NOAA' }))).toEqual(['goes']);
    expect(search.search({ query: '', tag: null, org: 'NOA' })).toEqual([]);
  });

  it('counts datasets per organisation and skips datasets without one', () => {
    expect(search.organisationCounts()).toEqual([['NOAA', 1]]);
  });

  it('counts tags, most used first', () => {
    expect(search.tagCounts()).toEqual([
      ['satellite imagery', 1],
      ['weather', 1],
    ]);
  });
});
