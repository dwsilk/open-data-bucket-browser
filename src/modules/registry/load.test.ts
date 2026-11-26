import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadDetail } from './load';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadDetail', () => {
  it('reports a missing file that the dev server answered with index.html', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<!doctype html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
      ),
    );
    await expect(loadDetail('missing-dataset')).rejects.toThrow(
      /metadata file for missing-dataset is missing/,
    );
  });

  it('reads a JSON file', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ slug: 'present' })));
    await expect(loadDetail('present')).resolves.toEqual({ slug: 'present' });
  });
});
