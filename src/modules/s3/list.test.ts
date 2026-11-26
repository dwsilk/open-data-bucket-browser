import { afterEach, describe, expect, it, vi } from 'vitest';
import { headObject, ListError, listPage, parseError, parseListing } from './list';

const LISTING = `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Name>b</Name><Prefix>data/</Prefix><KeyCount>3</KeyCount><MaxKeys>1000</MaxKeys>
  <Delimiter>/</Delimiter><IsTruncated>true</IsTruncated>
  <NextContinuationToken>token+1</NextContinuationToken>
  <Contents>
    <Key>data/</Key><LastModified>2024-01-02T03:04:05.000Z</LastModified>
    <ETag>"d41d8cd98f00b204e9800998ecf8427e"</ETag><Size>0</Size>
  </Contents>
  <Contents>
    <Key>data/a &amp; b.txt</Key><LastModified>2024-01-02T03:04:05.000Z</LastModified>
    <ETag>"abc"</ETag><Size>1234</Size><StorageClass>INTELLIGENT_TIERING</StorageClass>
  </Contents>
  <Contents>
    <Key>data/c.txt</Key><LastModified>2024-01-02T03:04:05.000Z</LastModified>
    <ETag>"def"</ETag><Size>0</Size>
  </Contents>
  <CommonPrefixes><Prefix>data/sub/</Prefix></CommonPrefixes>
</ListBucketResult>`;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseListing', () => {
  it('reads folders, objects and the continuation token, leaving out the folder marker', () => {
    const page = parseListing(LISTING);
    expect(page.folders).toEqual(['data/sub/']);
    expect(page.objects).toEqual([
      {
        key: 'data/a & b.txt',
        size: 1234,
        lastModified: '2024-01-02T03:04:05.000Z',
        etag: 'abc',
        storageClass: 'INTELLIGENT_TIERING',
      },
      {
        key: 'data/c.txt',
        size: 0,
        lastModified: '2024-01-02T03:04:05.000Z',
        etag: 'def',
        storageClass: 'STANDARD',
      },
    ]);
    expect(page.nextToken).toBe('token+1');
  });

  it('reports no next page when the listing is complete', () => {
    const page = parseListing(LISTING.replace('<IsTruncated>true', '<IsTruncated>false'));
    expect(page.nextToken).toBeNull();
  });

  it('refuses a document that is not a listing', () => {
    expect(() => parseListing('<Error><Code>X</Code></Error>')).toThrow(ListError);
  });
});

describe('parseError', () => {
  it('reads the S3 error code and message', () => {
    const error = parseError(
      '<Error><Code>AccessDenied</Code><Message>Access Denied</Message></Error>',
      403,
    );
    expect(error.code).toBe('AccessDenied');
    expect(error.message).toBe('Access Denied');
  });

  it('falls back to the status when the body is not S3 XML', () => {
    expect(parseError('<html>', 502).code).toBe('HTTP502');
  });
});

describe('listPage', () => {
  it('turns a failed fetch into an error that names CORS as the likely cause', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(listPage({ bucket: 'b', region: 'r', prefix: '' })).rejects.toMatchObject({
      code: 'NetworkError',
      message: expect.stringContaining('CORS') as unknown,
    });
  });

  it('passes the S3 error through', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<Error><Code>NoSuchBucket</Code><Message>gone</Message></Error>', {
          status: 404,
        }),
      ),
    );
    await expect(listPage({ bucket: 'b', region: 'r', prefix: '' })).rejects.toMatchObject({
      code: 'NoSuchBucket',
    });
  });
});

describe('headObject', () => {
  it('reads the safelisted headers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(null, {
          status: 200,
          headers: {
            'content-length': '42',
            'content-type': 'image/tiff',
            'last-modified': 'Tue, 02 Jan 2024 03:04:05 GMT',
          },
        }),
      ),
    );
    expect(await headObject('b', 'r', 'k')).toEqual({
      size: 42,
      contentType: 'image/tiff',
      lastModified: 'Tue, 02 Jan 2024 03:04:05 GMT',
    });
  });

  it('returns null rather than throwing when the object cannot be read', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 403 })));
    expect(await headObject('b', 'r', 'k')).toBeNull();
  });
});
