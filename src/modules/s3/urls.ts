/**
 * Anonymous S3 REST URLs.
 *
 * Everything here is unsigned: the app has no credentials and never will. The
 * indexer imports this file too, so the bucket it probes at build time is
 * addressed exactly as the browser will address it.
 */

/**
 * The bucket's REST endpoint, ending in `/`.
 *
 * A bucket name that contains a dot gets path-style addressing. The regional
 * certificate is a single-label wildcard, `*.s3.<region>.amazonaws.com`, so
 * `a.b.s3.<region>.amazonaws.com` fails TLS before S3 sees the request.
 */
export function bucketEndpoint(bucket: string, region: string): string {
  return bucket.includes('.')
    ? `https://s3.${region}.amazonaws.com/${bucket}/`
    : `https://${bucket}.s3.${region}.amazonaws.com/`;
}

/** Percent-encodes a key one path segment at a time, so `/` stays a separator. */
export function encodeKey(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/');
}

export interface ListParams {
  bucket: string;
  region: string;
  prefix: string;
  continuationToken?: string | undefined;
  maxKeys?: number | undefined;
}

/** A ListObjectsV2 URL that groups keys into folders at `/`. */
export function listUrl({
  bucket,
  region,
  prefix,
  continuationToken,
  maxKeys,
}: ListParams): string {
  const params = new URLSearchParams({ 'list-type': '2', delimiter: '/' });
  if (prefix !== '') params.set('prefix', prefix);
  if (continuationToken != null) params.set('continuation-token', continuationToken);
  if (maxKeys != null) params.set('max-keys', String(maxKeys));
  return `${bucketEndpoint(bucket, region)}?${params.toString()}`;
}

export function objectUrl(bucket: string, region: string, key: string): string {
  return `${bucketEndpoint(bucket, region)}${encodeKey(key)}`;
}

export function s3Uri(bucket: string, key: string): string {
  return `s3://${bucket}/${key}`;
}

/** Single-quotes a shell argument, so keys with spaces or `$` paste safely. */
function shellQuote(value: string): string {
  return /^[\w@%+=:,./-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`;
}

export function cliCopy(bucket: string, key: string): string {
  return `aws s3 cp --no-sign-request ${shellQuote(s3Uri(bucket, key))} .`;
}
