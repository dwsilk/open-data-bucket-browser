/**
 * Bulk download: selected objects streamed into one ZIP file in the browser.
 *
 * The objects are fetched one at a time, as the ZIP writer asks for them, so
 * only one response is in flight. Where the browser can write to disk
 * (`showSaveFilePicker`, Chromium today) the archive streams straight to the
 * file and its size has no limit. Elsewhere the archive is built in memory,
 * so the selection is capped at MEMORY_LIMIT and the CLI commands are the
 * route for anything larger.
 *
 * Entries are stored, not compressed (client-zip does not compress). Most
 * objects in these buckets are compressed formats already.
 */
import { downloadZip } from 'client-zip';
import type { S3Object } from '../s3/list';
import { cliCopy, objectUrl } from '../s3/urls';

/** The largest selection built in memory, for browsers that cannot stream to disk. */
export const MEMORY_LIMIT = 2_000_000_000;

export function canStreamToDisk(): boolean {
  return typeof window.showSaveFilePicker === 'function';
}

/** The folder all keys share, ending in `/`, or `''` if they share none. */
export function commonFolder(keys: readonly string[]): string {
  const first = keys[0];
  if (first == null) return '';
  let common = first.slice(0, first.lastIndexOf('/') + 1);
  for (const key of keys) {
    while (common !== '' && !key.startsWith(common)) {
      common = common.slice(0, common.slice(0, -1).lastIndexOf('/') + 1);
    }
  }
  return common;
}

export interface ZipEntry {
  /** Path inside the archive. */
  name: string;
  object: S3Object;
}

/**
 * Archive paths relative to the folder the selection shares, so files picked
 * from one folder sit at the top of the archive and files from several
 * folders keep the part of the path that tells them apart.
 */
export function zipEntries(objects: readonly S3Object[]): ZipEntry[] {
  const base = commonFolder(objects.map(o => o.key));
  return [...objects]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(object => ({ name: object.key.slice(base.length), object }));
}

/** A file name for the archive: bucket plus the shared folder's last segment. */
export function zipName(bucket: string, keys: readonly string[]): string {
  const folder = commonFolder(keys).replace(/\/$/, '');
  const last = folder.slice(folder.lastIndexOf('/') + 1);
  const name = last === '' ? bucket : `${bucket}-${last}`;
  return `${name.replace(/[^\w.-]+/g, '_')}.zip`;
}

/** One `aws s3 cp` line per object, for selections too large for the browser. */
export function cliCommands(bucket: string, objects: readonly S3Object[]): string {
  return [...objects]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(o => cliCopy(bucket, o.key))
    .join('\n');
}

export interface Progress {
  bytes: number;
  total: number;
  /** Key of the object being fetched. */
  current: string;
}

export interface ZipRequest {
  bucket: string;
  region: string;
  objects: readonly S3Object[];
  signal: AbortSignal;
  onProgress: (progress: Progress) => void;
}

/** The archive as a stream. Fails, naming the object, if any fetch fails. */
function zipStream({ bucket, region, objects, signal, onProgress }: ZipRequest) {
  const entries = zipEntries(objects);
  const total = entries.reduce((sum, e) => sum + e.object.size, 0);
  let bytes = 0;

  async function* files() {
    for (const { name, object } of entries) {
      onProgress({ bytes, total, current: object.key });
      const response = await fetch(objectUrl(bucket, region, object.key), { signal });
      if (!response.ok || !response.body) {
        throw new Error(`Could not download ${object.key} (HTTP ${response.status}).`);
      }
      const counted = response.body.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            bytes += chunk.byteLength;
            onProgress({ bytes, total, current: object.key });
            controller.enqueue(chunk);
          },
        }),
      );
      yield {
        name,
        input: counted,
        size: object.size,
        lastModified: new Date(object.lastModified),
      };
    }
  }

  const body = downloadZip(files()).body;
  if (!body) throw new Error('The ZIP writer returned no stream.');
  return body;
}

/**
 * Asks where to save the archive. Must be called in the click handler before
 * any `await`, because the browser only shows the picker for a user gesture.
 * Resolves to null when the person cancels the picker.
 */
export async function pickTarget(
  suggestedName: string,
): Promise<FileSystemWritableFileStream | null> {
  const picker = window.showSaveFilePicker;
  if (!picker) return null;
  try {
    const handle = await picker({
      suggestedName,
      types: [{ description: 'ZIP archive', accept: { 'application/zip': ['.zip'] } }],
    });
    return await handle.createWritable();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return null;
    throw error;
  }
}

/** Streams the archive into a file the person picked. */
export async function zipToFile(target: FileSystemWritableFileStream, request: ZipRequest) {
  await zipStream(request).pipeTo(target, { signal: request.signal });
}

/** Builds the archive in memory and hands it to the browser's download. */
export async function zipToDownload(fileName: string, request: ZipRequest): Promise<void> {
  const blob = await new Response(zipStream(request)).blob();
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
  } finally {
    // Revoking at once can cancel the download in some browsers.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
