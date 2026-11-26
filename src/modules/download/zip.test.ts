import { afterEach, describe, expect, it, vi } from 'vitest';
import type { S3Object } from '../s3/list';
import { cliCommands, commonFolder, zipEntries, zipName, zipToFile } from './zip';

function object(key: string, size = 3): S3Object {
  return {
    key,
    size,
    lastModified: '2024-01-02T00:00:00.000Z',
    etag: 'x',
    storageClass: 'STANDARD',
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('commonFolder', () => {
  it.each([
    [['a/b/c.tif', 'a/b/d.tif'], 'a/b/'],
    [['a/b/c.tif', 'a/x/d.tif'], 'a/'],
    [['a/b/c.tif', 'z.tif'], ''],
    [['a/bc/d.tif', 'a/b/e.tif'], 'a/'],
    [['only/one.tif'], 'only/'],
    [[], ''],
  ])('finds the shared folder of %j', (keys, expected) => {
    expect(commonFolder(keys)).toBe(expected);
  });
});

describe('zipEntries', () => {
  it('names entries relative to the shared folder, keeping what tells them apart', () => {
    const entries = zipEntries([object('s/2024/b.tif'), object('s/2023/a.tif')]);
    expect(entries.map(e => e.name)).toEqual(['2023/a.tif', '2024/b.tif']);
  });
});

describe('zipName', () => {
  it('names the archive after the bucket and the shared folder', () => {
    expect(zipName('sentinel-cogs', ['x/S2B_1CCV/B04.tif', 'x/S2B_1CCV/B03.tif'])).toBe(
      'sentinel-cogs-S2B_1CCV.zip',
    );
    expect(zipName('b', ['a.tif', 'c/d.tif'])).toBe('b.zip');
  });
});

describe('cliCommands', () => {
  it('gives one copy command per file', () => {
    expect(cliCommands('b', [object('x/2.tif'), object('x/1.tif')])).toBe(
      'aws s3 cp --no-sign-request s3://b/x/1.tif .\naws s3 cp --no-sign-request s3://b/x/2.tif .',
    );
  });
});

/** A WritableStream that keeps what it receives, standing in for a file on disk. */
function memoryFile() {
  const chunks: Uint8Array[] = [];
  const stream = new WritableStream<Uint8Array>({ write: chunk => void chunks.push(chunk) });
  const bytes = () => new Uint8Array(chunks.flatMap(c => [...c]));
  return { stream: stream as unknown as FileSystemWritableFileStream, bytes };
}

describe('zipToFile', () => {
  it('fetches each object and writes a ZIP that contains it', async () => {
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve(new Response(`body of ${url.slice(-5)}`)),
    );
    vi.stubGlobal('fetch', fetchMock);
    const file = memoryFile();
    const progress: number[] = [];

    await zipToFile(file.stream, {
      bucket: 'b',
      region: 'us-west-2',
      objects: [object('d/one.txt', 13), object('d/two.txt', 13)],
      signal: new AbortController().signal,
      onProgress: p => progress.push(p.bytes),
    });

    const text = new TextDecoder('latin1').decode(file.bytes());
    expect(text.startsWith('PK')).toBe(true);
    expect(text).toContain('one.txt');
    expect(text).toContain('body of e.txt');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(progress.at(-1)).toBe(26);
  });

  it('fails with the key of the object that could not be fetched', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('denied', { status: 403 })));
    await expect(
      zipToFile(memoryFile().stream, {
        bucket: 'b',
        region: 'r',
        objects: [object('d/secret.txt')],
        signal: new AbortController().signal,
        onProgress: () => undefined,
      }),
    ).rejects.toThrow('Could not download d/secret.txt (HTTP 403).');
  });
});
