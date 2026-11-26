/**
 * Reading a small text file from a bucket to show it in the details panel.
 *
 * The request is the same unsigned GET as a download. A bucket whose CORS
 * configuration lets a page list it nearly always lets the page read its
 * objects too, because CORS rules apply to the whole bucket.
 */

export type PreviewKind = 'json' | 'markdown' | 'text';

/** Files larger than this are not previewed. Parsing and rendering stay quick below it. */
export const PREVIEW_LIMIT = 2_000_000;

const KINDS: Record<string, PreviewKind> = {
  json: 'json',
  geojson: 'json',
  md: 'markdown',
  markdown: 'markdown',
  txt: 'text',
  text: 'text',
  log: 'text',
  csv: 'text',
  tsv: 'text',
  yaml: 'text',
  yml: 'text',
  xml: 'text',
};

/** The file name's extension, lower case, or `''`. A leading dot is not one. */
function extensionOf(key: string): string {
  const name = key.slice(key.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? '' : name.slice(dot + 1).toLowerCase();
}

/** What the file can be previewed as, from its name. */
export function previewKind(key: string): PreviewKind | null {
  return KINDS[extensionOf(key)] ?? null;
}

/**
 * An HTML file is not previewed: its markup could run script as this page.
 * It opens in a new tab instead, on the bucket's own origin.
 */
export function isHtml(key: string): boolean {
  const extension = extensionOf(key);
  return extension === 'html' || extension === 'htm';
}

export type PreviewText = { text: string } | { tooLarge: true };

/**
 * The file's text, or `tooLarge` once more than `limit` bytes arrive.
 *
 * The body is read as a stream and cancelled at the limit, because
 * `Content-Length` is missing for some responses and counts compressed bytes
 * for others. A Range request would need a CORS preflight that many buckets
 * do not allow.
 */
export async function fetchPreviewText(
  url: string,
  limit: number,
  signal?: AbortSignal,
): Promise<PreviewText> {
  let response: Response;
  try {
    response = await fetch(url, signal ? { signal } : {});
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(
      'The file could not be read. The bucket may not let a web page read its files.',
      {
        cause: error,
      },
    );
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`S3 answered ${response.status} ${response.statusText}`.trim() + '.');
  }
  if (!response.body) {
    const text = await response.text();
    return new TextEncoder().encode(text).length > limit ? { tooLarge: true } : { text };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      await reader.cancel();
      return { tooLarge: true };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return { text: new TextDecoder().decode(bytes) };
}

export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/** Children a JSON node shows before a "Show more" button. */
export const JSON_CHILDREN_STEP = 100;

/** Rows a JSON preview shows before anything is clicked. */
export const JSON_OPEN_BUDGET = 1500;

/**
 * How many levels of a JSON value start open: all of them if the whole tree
 * fits in `budget` rows, otherwise as many as fit. Each node counts at most
 * `JSON_CHILDREN_STEP` children, as many as it shows.
 */
export function jsonOpenDepth(value: JsonValue, budget = JSON_OPEN_BUDGET): number {
  let level: JsonValue[] = [value];
  let rows = 1;
  let depth = 0;
  for (;;) {
    const next: JsonValue[] = [];
    for (const node of level) {
      if (node === null || typeof node !== 'object') continue;
      const children = Array.isArray(node) ? node : Object.values(node);
      next.push(...children.slice(0, JSON_CHILDREN_STEP));
    }
    if (next.length === 0) return Number.POSITIVE_INFINITY;
    if (rows + next.length > budget) return depth;
    rows += next.length;
    depth += 1;
    level = next;
  }
}

export type ParsedJson = { ok: true; value: JsonValue } | { ok: false; error: string };

export function parseJson(text: string): ParsedJson {
  try {
    return { ok: true, value: JSON.parse(text) as JsonValue };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
