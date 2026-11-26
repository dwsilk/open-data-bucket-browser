/**
 * The shape of the files `npm run index` writes to `public/data/`.
 *
 * Shared by the indexer (scripts/) and the app, so a change to the index
 * format is a type error on both sides at once. Optional values are `null`
 * rather than absent: the files are JSON, and `exactOptionalPropertyTypes`
 * keeps the two spellings from drifting apart.
 */

/**
 * What a web page can do with a bucket, measured at index time.
 *
 * - `browsable`: lists anonymously and answers with CORS headers.
 * - `no-cors`: lists anonymously but sends no CORS headers, so only a CLI or
 *   a proxy can list it. Objects still download through a plain link.
 * - `denied`: anonymous listing is refused. Objects may still be readable.
 * - `missing`: the bucket no longer exists.
 * - `unreachable`: the probe failed for another reason.
 * - `unchecked`: the index was built with `--no-probe`.
 */
export type BucketAccess =
  'browsable' | 'no-cors' | 'denied' | 'missing' | 'unreachable' | 'unchecked';

export interface BucketResource {
  bucket: string;
  /** Empty, or a key prefix that ends in `/`. */
  prefix: string;
  /** The bucket's real region. The registry is wrong for a few buckets. */
  region: string;
  /** Markdown. */
  description: string;
  access: BucketAccess;
}

export interface DatasetSummary {
  /** The registry file name, also the path on registry.opendata.aws. */
  slug: string;
  name: string;
  /** Plain text, shortened. The full Markdown is in the detail file. */
  summary: string;
  tags: string[];
  /** Organisation name: plain text, web addresses removed. The organisation filter matches it exactly. */
  managedBy: string;
  /** ISO date, `YYYY-MM-DD`. */
  modified: string;
  buckets: BucketResource[];
}

export interface DatasetIndex {
  /** ISO timestamp of the index build. */
  generated: string;
  /** Commit of awslabs/open-data-registry the index was built from. */
  registryCommit: string | null;
  datasets: DatasetSummary[];
}

/**
 * A resource the app does not offer for browsing: SNS topics, buckets that
 * need credentials, and public buckets that a web page cannot list.
 */
export interface OtherResource {
  type: string;
  /** ARN, or host name for resources that have no ARN. */
  identifier: string;
  region: string;
  /** Markdown. */
  description: string;
  requesterPays: boolean;
  accountRequired: boolean;
  /** URL of the access request page, when access is controlled. */
  controlledAccess: string | null;
  /** For an anonymous bucket, why a web page cannot list it. Null for anything else. */
  access: BucketAccess | null;
}

export interface UsageLink {
  title: string;
  url: string;
  author: string | null;
  authorUrl: string | null;
}

export interface DatasetDetail {
  slug: string;
  name: string;
  /** Markdown, possibly shortened (see `descriptionTruncated`). */
  description: string;
  descriptionTruncated: boolean;
  documentation: string;
  contact: string;
  /** Markdown. */
  managedBy: string;
  updateFrequency: string;
  /** Markdown. */
  license: string;
  /** Markdown. */
  citation: string | null;
  tags: string[];
  added: string;
  modified: string;
  /** Markdown links to external explorers, keyed by `resourceKey()`. */
  explore: Record<string, string[]>;
  buckets: BucketResource[];
  otherResources: OtherResource[];
  tutorials: UsageLink[];
  tools: UsageLink[];
  publications: UsageLink[];
}

export const REGISTRY_URL = 'https://registry.opendata.aws';

/** Identifies one bucket resource of a dataset: a bucket can appear once per prefix. */
export function resourceKey(resource: Pick<BucketResource, 'bucket' | 'prefix'>): string {
  return `${resource.bucket}/${resource.prefix}`;
}

/**
 * A dataset's distinct buckets, each as its first resource. The registry
 * often lists folders of one bucket as further resources; those are reached
 * by browsing the bucket, so they are not offered as buckets of their own.
 */
export function distinctBuckets(buckets: readonly BucketResource[]): BucketResource[] {
  const seen = new Set<string>();
  const result: BucketResource[] = [];
  for (const bucket of buckets) {
    if (seen.has(bucket.bucket)) continue;
    seen.add(bucket.bucket);
    result.push(bucket);
  }
  return result;
}

export function registryPage(slug: string): string {
  return `${REGISTRY_URL}/${encodeURIComponent(slug)}/`;
}
