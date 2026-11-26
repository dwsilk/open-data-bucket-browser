/**
 * Anonymous ListObjectsV2 and HeadObject from the browser.
 *
 * Both are CORS "simple" requests (GET and HEAD with no custom headers), so
 * there is no preflight, and a bucket whose CORS configuration allows GET is
 * enough. The size, type and date that HEAD returns are CORS-safelisted
 * response headers, so they are readable even when the bucket exposes none.
 *
 * A request that fails before any response arrives is almost always CORS:
 * the browser hides the reason from script, so the error says so plainly.
 */
import { listUrl, objectUrl, type ListParams } from './urls';

export interface S3Object {
  key: string;
  size: number;
  /** ISO timestamp. */
  lastModified: string;
  etag: string;
  storageClass: string;
}

export interface ListPage {
  folders: string[];
  objects: S3Object[];
  nextToken: string | null;
}

export class ListError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'ListError';
  }
}

function childText(parent: Element, tag: string): string {
  for (const child of Array.from(parent.children)) {
    if (child.localName === tag) return child.textContent;
  }
  return '';
}

function children(parent: Element, tag: string): Element[] {
  return Array.from(parent.children).filter(child => child.localName === tag);
}

/**
 * A key ending in `/` is a folder marker: an object, nearly always empty, that
 * the S3 console and some tools write to make a folder exist. It is not a
 * file to show or download, and the folder itself already shows up as a
 * common prefix of its parent.
 */
export function isFolderMarker(key: string): boolean {
  return key.endsWith('/');
}

/** Parses a ListBucketResult document, leaving out folder markers. */
export function parseListing(xml: string): ListPage {
  const root = new DOMParser().parseFromString(xml, 'application/xml').documentElement;
  if (root.localName !== 'ListBucketResult') {
    throw new ListError('S3 returned something other than a listing.', 'BadResponse');
  }
  const truncated = childText(root, 'IsTruncated') === 'true';
  return {
    folders: children(root, 'CommonPrefixes').map(p => childText(p, 'Prefix')),
    objects: children(root, 'Contents')
      .map(c => ({
        key: childText(c, 'Key'),
        size: Number(childText(c, 'Size')),
        lastModified: childText(c, 'LastModified'),
        etag: childText(c, 'ETag').replace(/"/g, ''),
        storageClass: childText(c, 'StorageClass') || 'STANDARD',
      }))
      .filter(o => !isFolderMarker(o.key)),
    nextToken: truncated ? childText(root, 'NextContinuationToken') || null : null,
  };
}

/** Reads `<Error><Code/><Message/></Error>` from a failed S3 response. */
export function parseError(xml: string, status: number): ListError {
  try {
    const root = new DOMParser().parseFromString(xml, 'application/xml').documentElement;
    if (root.localName === 'Error') {
      const code = childText(root, 'Code') || `HTTP${status}`;
      return new ListError(childText(root, 'Message') || code, code);
    }
  } catch {
    // Fall through to the status line.
  }
  return new ListError(`S3 answered HTTP ${status}.`, `HTTP${status}`);
}

const NETWORK_MESSAGE =
  'The request did not complete. Most often the bucket does not allow listing from a web ' +
  'page (no CORS configuration), or the network is down.';

export async function listPage(params: ListParams, signal?: AbortSignal): Promise<ListPage> {
  let response: Response;
  try {
    response = await fetch(listUrl(params), signal ? { signal } : {});
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ListError(NETWORK_MESSAGE, 'NetworkError');
  }
  const body = await response.text();
  if (!response.ok) throw parseError(body, response.status);
  return parseListing(body);
}

export interface ObjectHead {
  size: number | null;
  contentType: string | null;
  lastModified: string | null;
}

export async function headObject(
  bucket: string,
  region: string,
  key: string,
  signal?: AbortSignal,
): Promise<ObjectHead | null> {
  try {
    const response = await fetch(
      objectUrl(bucket, region, key),
      signal ? { method: 'HEAD', signal } : { method: 'HEAD' },
    );
    if (!response.ok) return null;
    const length = response.headers.get('content-length');
    return {
      size: length == null ? null : Number(length),
      contentType: response.headers.get('content-type'),
      lastModified: response.headers.get('last-modified'),
    };
  } catch {
    return null;
  }
}
