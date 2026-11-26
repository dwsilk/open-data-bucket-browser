import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPreviewText, isHtml, jsonOpenDepth, parseJson, previewKind } from './preview';

describe('previewKind', () => {
  it('previews JSON and Markdown by extension, ignoring case', () => {
    expect(previewKind('stac/catalog.json')).toBe('json');
    expect(previewKind('tiles/area.GeoJSON')).toBe('json');
    expect(previewKind('README.md')).toBe('markdown');
    expect(previewKind('docs/guide.markdown')).toBe('markdown');
  });

  it('previews text formats as text, and never HTML', () => {
    expect(previewKind('notes.txt')).toBe('text');
    expect(previewKind('scenes/index.CSV')).toBe('text');
    expect(previewKind('config.yml')).toBe('text');
    expect(previewKind('index.html')).toBeNull();
    expect(isHtml('index.html')).toBe(true);
    expect(isHtml('old/PAGE.HTM')).toBe(true);
    expect(isHtml('html/readme.txt')).toBe(false);
  });

  it('does not preview other files, dotfiles or names without an extension', () => {
    expect(previewKind('scene.tif')).toBeNull();
    expect(previewKind('data.json.gz')).toBeNull();
    expect(previewKind('folder.md/LICENSE')).toBeNull();
    expect(previewKind('.json')).toBeNull();
  });
});

describe('fetchPreviewText', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function serve(body: string, init?: ResponseInit) {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(body, init))),
    );
  }

  it('returns the text of a file within the limit', async () => {
    serve('{"a": "ā"}');
    await expect(fetchPreviewText('https://x/a.json', 100)).resolves.toEqual({
      text: '{"a": "ā"}',
    });
  });

  it('stops reading once the file passes the limit', async () => {
    serve('x'.repeat(101));
    await expect(fetchPreviewText('https://x/a.json', 100)).resolves.toEqual({ tooLarge: true });
  });

  it('reports an S3 error status', async () => {
    serve('<Error/>', { status: 403, statusText: 'Forbidden' });
    await expect(fetchPreviewText('https://x/a.json', 100)).rejects.toThrow(
      'S3 answered 403 Forbidden.',
    );
  });

  it('explains a request that the browser blocked', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );
    await expect(fetchPreviewText('https://x/a.json', 100)).rejects.toThrow(
      /may not let a web page read its files/,
    );
  });
});

describe('jsonOpenDepth', () => {
  it('opens every level of a tree that fits the budget', () => {
    expect(jsonOpenDepth({ a: { b: { c: [1, 2, { d: true }] } } }, 100)).toBe(
      Number.POSITIVE_INFINITY,
    );
    expect(jsonOpenDepth('just a string', 1)).toBe(Number.POSITIVE_INFINITY);
  });

  it('stops at the last level that fits', () => {
    // Root (1) + 3 children (4) + 9 grandchildren (13) + 27 leaves (40).
    const tree = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => [1, 2, 3]));
    expect(jsonOpenDepth(tree, 40)).toBe(Number.POSITIVE_INFINITY);
    expect(jsonOpenDepth(tree, 39)).toBe(2);
    expect(jsonOpenDepth(tree, 4)).toBe(1);
    expect(jsonOpenDepth(tree, 3)).toBe(0);
  });

  it('counts only the first 100 children of a long array, as the tree shows', () => {
    const long = Array.from({ length: 10_000 }, (_, i) => i);
    expect(jsonOpenDepth(long, 101)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('parseJson', () => {
  it('parses valid JSON and reports invalid JSON', () => {
    expect(parseJson('{"a": [1, null]}')).toEqual({ ok: true, value: { a: [1, null] } });
    expect(parseJson('{"a": ').ok).toBe(false);
  });
});
