import { describe, expect, it } from 'vitest';
import { crumbs, EMPTY_ROUTE, folderOf, parseRoute, startsWithOf, toSearch } from './route';

describe('parseRoute and toSearch', () => {
  it('round-trips a route whose prefix and key need escaping', () => {
    const route = {
      ...EMPTY_ROUTE,
      q: 'sentinel 2',
      tag: 'satellite imagery',
      org: 'U.S. Environmental Protection Agency',
      dataset: 'sentinel-2-l2a-cogs',
      bucket: 'sentinel-cogs',
      prefix: 'a b/c#d?e&f/',
      object: 'a b/c#d?e&f/x+y.tif',
    };
    expect(parseRoute(toSearch(route))).toEqual(route);
  });

  it('gives the empty route an empty query string', () => {
    expect(toSearch(EMPTY_ROUTE)).toBe('');
    expect(parseRoute('')).toEqual(EMPTY_ROUTE);
  });

  it('ignores a bucket without a dataset, and a prefix without a bucket', () => {
    expect(parseRoute('?bucket=b&prefix=p/')).toEqual(EMPTY_ROUTE);
    expect(parseRoute('?dataset=d&prefix=p/')).toMatchObject({ dataset: 'd', prefix: '' });
  });

  it('ignores an object that is a folder marker', () => {
    expect(parseRoute('?dataset=d&bucket=b&prefix=a/&object=a/')).toMatchObject({
      prefix: 'a/',
      object: null,
    });
  });

  it('treats an empty parameter as absent', () => {
    expect(parseRoute('?dataset=&tag=')).toEqual(EMPTY_ROUTE);
  });
});

describe('prefix helpers', () => {
  it('splits a prefix into folder and "starts with" part', () => {
    expect(folderOf('a/b/')).toBe('a/b/');
    expect(startsWithOf('a/b/')).toBe('');
    expect(folderOf('a/b/fo')).toBe('a/b/');
    expect(startsWithOf('a/b/fo')).toBe('fo');
    expect(folderOf('fo')).toBe('');
  });

  it('builds a crumb per folder level from the bucket root', () => {
    expect(crumbs('b', 'x/y/z')).toEqual([
      { label: 'b', prefix: '' },
      { label: 'x', prefix: 'x/' },
      { label: 'y', prefix: 'x/y/' },
    ]);
  });
});
