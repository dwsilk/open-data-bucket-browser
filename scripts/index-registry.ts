/**
 * Builds the dataset index from awslabs/open-data-registry.
 *
 *   npm run index                      clone the registry, probe every bucket
 *   npm run index -- --registry <dir>  read a local checkout instead
 *   npm run index -- --no-probe        skip the bucket probe (marks all `unchecked`)
 *   npm run index:ensure               do nothing if an index already exists
 *
 * Datasets with no bucket that a web page can list are left out, and so are
 * the unlistable buckets of the datasets that stay (they move to the detail
 * file's `otherResources`).
 *
 * Writes `public/data/index.json`, the summaries the search runs over, and
 * `public/data/datasets/<slug>.json`, one detail file per dataset, fetched
 * when the dataset is opened. The split exists because the full metadata is
 * about 15 MB and almost all of it is never looked at.
 *
 * SITE_ORIGIN sets the Origin the probe presents. Buckets that allow `*`
 * (nearly all of them) do not care; one that allows named origins only will
 * be marked `no-cors` unless the deployed origin is given here.
 */
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs, promisify } from 'node:util';
import { CORE_SCHEMA, load as loadYaml } from 'js-yaml';
import type { BucketAccess, DatasetIndex } from '../src/modules/registry/types.ts';
import { resourceKey } from '../src/modules/registry/types.ts';
import { pool, probeBucket } from './probe.ts';
import { keepListable, normalise, parseGitDates, RawEntry, type Normalised } from './registry.ts';

const REPO = 'awslabs/open-data-registry';
const BRANCH = 'main';
const OUT = resolve(import.meta.dirname, '../public/data');
const PROBE_CONCURRENCY = 32;

const { values: args } = parseArgs({
  options: {
    'if-missing': { type: 'boolean', default: false },
    'no-probe': { type: 'boolean', default: false },
    registry: { type: 'string' },
  },
});

const run = promisify(execFile);

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await run('git', args, { cwd, maxBuffer: 256 * 1024 * 1024 });
  return stdout;
}

interface Registry {
  /** The checkout's root, holding `datasets/`. */
  root: string;
  commit: string | null;
  dates: Map<string, { added: string; modified: string }>;
  cleanup: () => Promise<void>;
}

/**
 * A blobless clone: full commit history for the dates, but file contents for
 * the current commit only. `--no-renames` matters: rename detection compares
 * file contents, which a blobless clone would fetch one at a time.
 */
async function cloneRegistry(): Promise<Registry> {
  const parent = await mkdtemp(join(tmpdir(), 'open-data-registry-'));
  const root = join(parent, 'registry');
  await run('git', [
    'clone',
    '--quiet',
    '--filter=blob:none',
    '--single-branch',
    `--branch=${BRANCH}`,
    `https://github.com/${REPO}.git`,
    root,
  ]);
  return {
    ...(await readHistory(root)),
    root,
    cleanup: () => rm(parent, { recursive: true, force: true }),
  };
}

/** Dates and commit from a checkout's history. A shallow checkout gives poor dates, not none. */
async function readHistory(root: string): Promise<Pick<Registry, 'commit' | 'dates'>> {
  try {
    const [commit, log] = await Promise.all([
      git(root, 'rev-parse', 'HEAD'),
      git(root, 'log', '--no-renames', '--format=%x00%as', '--name-only', '--', 'datasets/'),
    ]);
    return { commit: commit.trim(), dates: parseGitDates(log) };
  } catch {
    return { commit: null, dates: new Map() };
  }
}

async function readEntries(dir: string, dates: Registry['dates']): Promise<Normalised[]> {
  const files = (await readdir(dir)).filter(f => f.endsWith('.yaml')).sort();
  const results: Normalised[] = [];
  let skipped = 0;
  for (const file of files) {
    const slug = file.slice(0, -'.yaml'.length);
    const source = await readFile(join(dir, file), 'utf8');
    let raw: unknown;
    try {
      // CORE_SCHEMA leaves unquoted dates as strings. The default schema
      // would turn RegistryEntryAdded into a Date.
      raw = loadYaml(source, { schema: CORE_SCHEMA });
    } catch (error) {
      skipped++;
      console.warn(`skip ${slug}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    const parsed = RawEntry.safeParse(raw);
    if (!parsed.success) {
      skipped++;
      console.warn(`skip ${slug}: ${parsed.error.issues[0]?.message ?? 'unreadable'}`);
      continue;
    }
    const entry = normalise(slug, parsed.data, dates.get(slug) ?? null);
    if (entry) results.push(entry);
  }
  console.log(`${files.length} registry entries, ${results.length} with a public bucket`);
  if (skipped > 0) console.log(`${skipped} entries could not be read`);
  return results;
}

async function probeAll(entries: Normalised[]): Promise<void> {
  const origin = process.env['SITE_ORIGIN'] ?? 'https://example.org';
  const byKey = new Map<string, { bucket: string; region: string; prefix: string }>();
  for (const { summary } of entries) {
    for (const bucket of summary.buckets) byKey.set(resourceKey(bucket), bucket);
  }
  const targets = [...byKey.entries()];
  const started = Date.now();
  const results = await pool(targets, PROBE_CONCURRENCY, ([, t]) =>
    probeBucket(t.bucket, t.region, t.prefix, origin),
  );
  const found = new Map(targets.map(([key], i) => [key, results[i]]));

  const counts: Partial<Record<BucketAccess, number>> = {};
  for (const result of results) counts[result.access] = (counts[result.access] ?? 0) + 1;
  const seconds = ((Date.now() - started) / 1000).toFixed(0);
  console.log(`probed ${targets.length} bucket resources in ${seconds}s:`, counts);

  // Summary and detail share the bucket objects, so one write updates both.
  for (const { summary } of entries) {
    for (const bucket of summary.buckets) {
      const result = found.get(resourceKey(bucket));
      if (!result) continue;
      bucket.access = result.access;
      bucket.region = result.region;
    }
  }
}

/**
 * Writes the index without removing `public/data/` first.
 *
 * A running Vite dev server keeps a list of public files, updated by a file
 * watcher. When the directory is deleted and refilled at speed, the watcher
 * misses the new files, and the dev server answers each one with index.html.
 * So existing files are overwritten in place and only stale ones are removed.
 * Details are written before the index, so the index never names a dataset
 * whose file is not there yet.
 */
async function writeIndex(entries: Normalised[], commit: string | null): Promise<void> {
  const dir = join(OUT, 'datasets');
  await mkdir(dir, { recursive: true });
  await pool(entries, 64, ({ detail }) =>
    writeFile(join(dir, `${detail.slug}.json`), JSON.stringify(detail)),
  );

  const index: DatasetIndex = {
    generated: new Date().toISOString(),
    registryCommit: commit,
    datasets: entries.map(e => e.summary),
  };
  await writeFile(join(OUT, 'index.json'), JSON.stringify(index));

  const current = new Set(entries.map(({ detail }) => `${detail.slug}.json`));
  const stale = (await readdir(dir)).filter(file => !current.has(file));
  await Promise.all(stale.map(file => rm(join(dir, file), { force: true })));
}

async function main(): Promise<void> {
  if (args['if-missing'] && existsSync(join(OUT, 'index.json'))) {
    console.log('public/data/index.json exists; skipping the index build');
    return;
  }

  const registry: Registry = args.registry
    ? {
        root: resolve(args.registry),
        ...(await readHistory(resolve(args.registry))),
        cleanup: () => Promise.resolve(),
      }
    : await cloneRegistry();
  try {
    const read = await readEntries(join(registry.root, 'datasets'), registry.dates);
    if (!args['no-probe']) await probeAll(read);
    const entries = read.flatMap(entry => keepListable(entry) ?? []);
    console.log(`${read.length - entries.length} datasets left out: no bucket a web page can list`);

    await writeIndex(entries, registry.commit);
    console.log(`wrote ${entries.length} datasets to public/data/`);
  } finally {
    await registry.cleanup();
  }
}

await main();
