/**
 * Fetches the files `npm run index` writes. Paths resolve against the app's
 * mount point, so the same build works at `/` and under a project path.
 */
import type { DatasetDetail, DatasetIndex } from './types';

const base = (): string => new URL(import.meta.env.BASE_URL || '/', window.location.origin).href;

/**
 * Reads a generated JSON file, or says plainly that it is missing.
 *
 * The status alone does not show a missing file: the Vite dev server answers
 * an unknown path with index.html and a 200. Without the type check, that
 * surfaces as "Unexpected token '<'" from the JSON parser.
 */
async function readJson<T>(response: Response, missing: string): Promise<T> {
  const type = response.headers.get('content-type') ?? '';
  if (!response.ok || !type.includes('json')) {
    throw new Error(`${missing} (HTTP ${response.status}, ${type || 'no content type'}).`);
  }
  return (await response.json()) as T;
}

export async function loadIndex(): Promise<DatasetIndex> {
  const response = await fetch(new URL('data/index.json', base()));
  return readJson(response, 'The dataset index is missing. Run `npm run index` first');
}

const details = new Map<string, Promise<DatasetDetail>>();

/** One request per dataset per session; a failed request is not cached. */
export function loadDetail(slug: string): Promise<DatasetDetail> {
  let pending = details.get(slug);
  if (!pending) {
    pending = fetch(new URL(`data/datasets/${encodeURIComponent(slug)}.json`, base())).then(
      response =>
        readJson<DatasetDetail>(
          response,
          `The metadata file for ${slug} is missing. If \`npm run index\` ran while the dev ` +
            'server was running, restart the dev server',
        ),
    );
    void pending.catch(() => details.delete(slug));
    details.set(slug, pending);
  }
  return pending;
}
