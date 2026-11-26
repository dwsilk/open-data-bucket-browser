/**
 * The app's whole state that is worth sharing, as URL query parameters.
 *
 * Query parameters rather than paths, because the app is one static page:
 * GitHub Pages has no rewrite rules, and an S3 key can contain anything a
 * path can, including `?` and `#`. URLSearchParams encodes all of it.
 *
 * `prefix` is a raw S3 key prefix. Ending in `/` it names a folder; without
 * the slash it is a "names starting with" search inside the folder before
 * the last `/`. The listing request is the same in both cases.
 */
import { isFolderMarker } from '../s3/list';

export interface Route {
  /** Search text. */
  q: string;
  tag: string | null;
  /** Organisation, matched exactly against a dataset's `managedBy`. */
  org: string | null;
  dataset: string | null;
  bucket: string | null;
  prefix: string;
  /** Key of the selected object. */
  object: string | null;
}

export const EMPTY_ROUTE: Route = {
  q: '',
  tag: null,
  org: null,
  dataset: null,
  bucket: null,
  prefix: '',
  object: null,
};

/** A parameter that is absent or empty is no value. */
function value(params: URLSearchParams, name: string): string | null {
  const found = params.get(name);
  return found === '' ? null : found;
}

/** Older links can name a folder marker as the object; there is nothing to show for one. */
function fileKey(key: string | null): string | null {
  return key == null || isFolderMarker(key) ? null : key;
}

export function parseRoute(search: string): Route {
  const params = new URLSearchParams(search);
  const dataset = value(params, 'dataset');
  const bucket = dataset != null ? value(params, 'bucket') : null;
  return {
    q: params.get('q') ?? '',
    tag: value(params, 'tag'),
    org: value(params, 'org'),
    dataset,
    bucket,
    prefix: bucket != null ? (params.get('prefix') ?? '') : '',
    object: bucket != null ? fileKey(value(params, 'object')) : null,
  };
}

/** Serialises a route to a query string, `''` or starting with `?`. */
export function toSearch(route: Route): string {
  const params = new URLSearchParams();
  if (route.q !== '') params.set('q', route.q);
  if (route.tag != null) params.set('tag', route.tag);
  if (route.org != null) params.set('org', route.org);
  if (route.dataset != null) {
    params.set('dataset', route.dataset);
    if (route.bucket != null) {
      params.set('bucket', route.bucket);
      if (route.prefix !== '') params.set('prefix', route.prefix);
      if (route.object != null) params.set('object', route.object);
    }
  }
  const search = params.toString();
  return search === '' ? '' : `?${search}`;
}

/** The folder a prefix lists: everything up to and including the last `/`. */
export function folderOf(prefix: string): string {
  return prefix.slice(0, prefix.lastIndexOf('/') + 1);
}

/** The part of the prefix after the folder: the "starts with" filter, if any. */
export function startsWithOf(prefix: string): string {
  return prefix.slice(folderOf(prefix).length);
}

export interface Crumb {
  label: string;
  prefix: string;
}

/** One crumb per folder level, starting at the bucket root. */
export function crumbs(bucket: string, prefix: string): Crumb[] {
  const result: Crumb[] = [{ label: bucket, prefix: '' }];
  const folder = folderOf(prefix);
  let path = '';
  for (const part of folder.split('/').slice(0, -1)) {
    path += `${part}/`;
    result.push({ label: part, prefix: path });
  }
  return result;
}
