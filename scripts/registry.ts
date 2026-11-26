/**
 * Turns one awslabs/open-data-registry YAML entry into the app's index types.
 *
 * The registry is hand-edited by hundreds of contributors, and its own schema
 * check (schema.yaml) is looser than it looks: values arrive with trailing
 * spaces, booleans arrive as strings, and bucket ARNs carry key prefixes in
 * several spellings. The zod schema here accepts all of that and normalises
 * it; an entry that cannot be read is reported and skipped, not fatal.
 *
 * Only buckets that an anonymous caller can reach are "public" here. Requester
 * pays, account-required and controlled-access resources need credentials,
 * so they are kept for the metadata panel but never offered for browsing.
 */
import { z } from 'zod';
import type {
  BucketResource,
  DatasetDetail,
  DatasetSummary,
  OtherResource,
  UsageLink,
} from '../src/modules/registry/types.ts';
import { resourceKey } from '../src/modules/registry/types.ts';

const flag = z
  .unknown()
  .optional()
  .transform(v => v === true || /^\s*true\s*$/i.test(String(v ?? '')));
const text = z
  .unknown()
  .optional()
  .transform(v => (v == null ? '' : typeof v === 'string' ? v.trim() : JSON.stringify(v)));

const RawResource = z.looseObject({
  Description: text,
  ARN: text,
  Host: text,
  Region: text,
  Type: text,
  RequesterPays: flag,
  AccountRequired: flag,
  ControlledAccess: text,
  Explore: z.array(z.string()).nullish(),
});

const RawUsage = z.looseObject({
  Title: text,
  URL: text,
  AuthorName: text,
  AuthorURL: text,
});

const usageList = z
  .array(z.unknown())
  .nullish()
  .transform(list =>
    (list ?? []).flatMap(item => {
      const parsed = RawUsage.safeParse(item);
      return parsed.success && parsed.data.URL !== '' ? [parsed.data] : [];
    }),
  );

export const RawEntry = z.looseObject({
  Name: z.string().trim().min(1),
  Description: text,
  Documentation: text,
  Contact: text,
  ManagedBy: text,
  UpdateFrequency: text,
  Tags: z
    .array(z.unknown())
    .nullish()
    .transform(tags => (tags ?? []).map(t => String(t).trim()).filter(t => t !== '')),
  License: text,
  Citation: text,
  RegistryEntryAdded: text,
  RegistryEntryLastModified: text,
  Deprecated: flag,
  Resources: z.array(RawResource).nullish(),
  DataAtWork: z
    .looseObject({
      Tutorials: usageList,
      'Tools & Applications': usageList,
      Publications: usageList,
    })
    .nullish(),
});
export type RawEntry = z.infer<typeof RawEntry>;
type RawResource = z.infer<typeof RawResource>;

const S3_ARN = /^arn:aws:s3:::([a-z0-9][a-z0-9.-]{1,61}[a-z0-9])(?:\/(.*))?$/;

/**
 * Splits an S3 ARN into bucket and key prefix, or returns null for anything
 * that is not a plain bucket ARN (access points, other services).
 *
 * The prefix is normalised to end in `/`, because the registry spells the
 * same folder both ways and listing with a delimiter needs the slash. A
 * trailing `*` wildcard is dropped for the same reason.
 */
export function parseBucketArn(arn: string): { bucket: string; prefix: string } | null {
  const match = S3_ARN.exec(arn.trim());
  if (!match?.[1]) return null;
  let prefix = (match[2] ?? '').replace(/\*+$/, '').replace(/^\/+/, '');
  if (prefix !== '' && !prefix.endsWith('/')) prefix += '/';
  return { bucket: match[1], prefix };
}

function isPublicBucket(resource: RawResource): boolean {
  return (
    resource.Type === 'S3 Bucket' &&
    !resource.RequesterPays &&
    !resource.AccountRequired &&
    resource.ControlledAccess === ''
  );
}

/** Markdown to a single line of plain text, for search and list summaries. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Rewrites the HTML formatting tags contributors use as Markdown.
 *
 * The app renders Markdown without raw HTML, which shows a tag as literal
 * text. That is right for the angle-bracket placeholders some entries use in
 * paths (`<aqyear>`), so only known formatting tags are rewritten here.
 */
export function cleanMarkdown(markdown: string): string {
  return markdown
    .replace(/<br\s*\/?>/gi, '  \n')
    .replace(/<\/?(?:b|strong)>/gi, '**')
    .replace(/<\/?(?:i|em)>/gi, '_')
    .replace(/<\/?code>/gi, '`')
    .replace(/<a\s+[^>]*href\s*=\s*["']([^"']+)["'][^>]*>(.*?)<\/a>/gi, '[$2]($1)')
    .replace(/<\/?(?:span|sub|sup|p|div)(?:\s[^>]*)?>/gi, '');
}

/**
 * First and last commit date of every file under `datasets/`, from
 * `git log --no-renames --format=%x00%as --name-only`. The registry adds
 * RegistryEntryAdded and RegistryEntryLastModified from git history when it
 * deploys, so the YAML in the repository does not carry them.
 */
export function parseGitDates(log: string): Map<string, { added: string; modified: string }> {
  const dates = new Map<string, { added: string; modified: string }>();
  for (const commit of log.split('\0')) {
    const [date, ...files] = commit.split('\n').filter(line => line !== '');
    if (date == null) continue;
    for (const file of files) {
      const slug = file.replace(/^datasets\//, '').replace(/\.yaml$/, '');
      // Newest first: the first sighting is the last change, the final one the first.
      const seen = dates.get(slug);
      dates.set(slug, { added: date, modified: seen?.modified ?? date });
    }
  }
  return dates;
}

/**
 * The organisation name from a ManagedBy value, for the organisation filter.
 *
 * Contributors often add the organisation's web address to the name, as a
 * Markdown link (which plainText drops) or as bare text, sometimes in
 * brackets. The address is removed so the name groups datasets. Similar names
 * ("Amazon", "Amazon Web Services") are left apart: they are different values
 * in the registry, and merging them would be a guess.
 *
 * Some values are wrapped in quotes, list one organisation per line, or write
 * a link the wrong way round (`(name)[url]`). These are spelling, not
 * meaning, so they are normalised.
 */
export function organisation(managedBy: string): string {
  const tidied = managedBy
    .replace(/\(([^)]+)\)\[(https?:\/\/[^\]]+)\]/g, '[$1]($2)')
    .replace(/"/g, '')
    .split(/\n+/)
    .map(line => line.trim())
    .filter(line => line !== '')
    .join(', ');
  return plainText(tidied)
    .replace(/\(\s*https?:\/\/[^\s)]*\s*\)/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[\s,;:]+$/, '')
    .trim();
}

/** Cuts text at a word boundary and marks the cut. */
export function shorten(value: string, limit: number): string {
  if (value.length <= limit) return value;
  const cut = value.slice(0, limit);
  const space = cut.lastIndexOf(' ');
  return `${(space > limit * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:]+$/, '')}…`;
}

/**
 * A few NASA entries carry descriptions over 600 kB, almost all of it a list
 * of every product in the archive. The detail file keeps the first part, cut
 * at a paragraph break, and the panel links to the registry for the rest.
 */
export const DESCRIPTION_LIMIT = 20_000;
export const SUMMARY_LIMIT = 600;

function cutDescription(markdown: string): { text: string; truncated: boolean } {
  if (markdown.length <= DESCRIPTION_LIMIT) return { text: markdown, truncated: false };
  const head = markdown.slice(0, DESCRIPTION_LIMIT);
  const paragraph = head.lastIndexOf('\n\n');
  return { text: paragraph > 0 ? head.slice(0, paragraph) : head, truncated: true };
}

function usage(list: z.infer<typeof RawUsage>[] | undefined): UsageLink[] {
  return (list ?? []).map(item => ({
    title: item.Title || item.URL,
    url: item.URL,
    author: item.AuthorName || null,
    authorUrl: item.AuthorURL || null,
  }));
}

export interface Normalised {
  summary: DatasetSummary;
  detail: DatasetDetail;
}

/**
 * Normalises one entry, with every bucket marked `unchecked`. Returns null for
 * a deprecated entry or one with no anonymously readable bucket.
 */
export function normalise(
  slug: string,
  entry: RawEntry,
  dates: { added: string; modified: string } | null = null,
): Normalised | null {
  if (entry.Deprecated) return null;

  const buckets: BucketResource[] = [];
  const otherResources: OtherResource[] = [];
  const explore: Record<string, string[]> = {};
  const seen = new Set<string>();

  for (const resource of entry.Resources ?? []) {
    const arn = resource.Type === 'S3 Bucket' ? parseBucketArn(resource.ARN) : null;
    if (arn && isPublicBucket(resource)) {
      const bucket: BucketResource = {
        ...arn,
        region: resource.Region || 'us-east-1',
        description: cleanMarkdown(resource.Description),
        access: 'unchecked',
      };
      const key = resourceKey(bucket);
      if (seen.has(key)) continue;
      seen.add(key);
      buckets.push(bucket);
      if (resource.Explore?.length) explore[key] = resource.Explore;
    } else {
      otherResources.push({
        type: resource.Type,
        identifier: resource.ARN || resource.Host,
        region: resource.Region,
        description: cleanMarkdown(resource.Description),
        requesterPays: resource.RequesterPays,
        accountRequired: resource.AccountRequired,
        controlledAccess: resource.ControlledAccess || null,
        access: null,
      });
    }
  }
  if (buckets.length === 0) return null;

  const description = cutDescription(cleanMarkdown(entry.Description));
  const work = entry.DataAtWork;
  const added = entry.RegistryEntryAdded || dates?.added || '';
  const modified = entry.RegistryEntryLastModified || dates?.modified || '';

  return {
    summary: {
      slug,
      name: entry.Name,
      summary: shorten(plainText(entry.Description), SUMMARY_LIMIT),
      tags: entry.Tags,
      managedBy: organisation(entry.ManagedBy),
      modified,
      buckets,
    },
    detail: {
      slug,
      name: entry.Name,
      description: description.text,
      descriptionTruncated: description.truncated,
      documentation: entry.Documentation,
      contact: cleanMarkdown(entry.Contact),
      managedBy: cleanMarkdown(entry.ManagedBy),
      updateFrequency: cleanMarkdown(entry.UpdateFrequency),
      license: cleanMarkdown(entry.License),
      citation: entry.Citation ? cleanMarkdown(entry.Citation) : null,
      tags: entry.Tags,
      added,
      modified,
      explore,
      buckets,
      otherResources,
      tutorials: usage(work?.Tutorials),
      tools: usage(work?.['Tools & Applications']),
      publications: usage(work?.Publications),
    },
  };
}

/** Access that lets the app list a bucket. `unchecked` means the probe was skipped. */
export function isListable(bucket: BucketResource): boolean {
  return bucket.access === 'browsable' || bucket.access === 'unchecked';
}

/**
 * Keeps only the buckets a web page can list, after the probe has run.
 *
 * Returns null for a dataset with none: the app does not show datasets it
 * cannot browse. The other public buckets of a kept dataset move to
 * `otherResources`, so the metadata panel still lists them and says why
 * they cannot be browsed.
 */
export function keepListable(entry: Normalised): Normalised | null {
  const listable = entry.detail.buckets.filter(isListable);
  if (listable.length === 0) return null;

  const explore: Record<string, string[]> = {};
  const otherResources: OtherResource[] = [];
  for (const bucket of entry.detail.buckets) {
    const key = resourceKey(bucket);
    if (isListable(bucket)) {
      const links = entry.detail.explore[key];
      if (links) explore[key] = links;
      continue;
    }
    otherResources.push({
      type: 'S3 Bucket',
      identifier: `arn:aws:s3:::${bucket.bucket}${bucket.prefix === '' ? '' : `/${bucket.prefix}`}`,
      region: bucket.region,
      description: bucket.description,
      requesterPays: false,
      accountRequired: false,
      controlledAccess: null,
      access: bucket.access,
    });
  }

  return {
    summary: { ...entry.summary, buckets: listable },
    detail: {
      ...entry.detail,
      buckets: listable,
      explore,
      otherResources: [...otherResources, ...entry.detail.otherResources],
    },
  };
}
