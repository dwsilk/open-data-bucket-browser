/**
 * Measures, at index time, whether a web page can list each bucket.
 *
 * This is the fact the whole app depends on and the registry does not record.
 * A bucket can be public and still be useless to a browser: S3 only lets a
 * page read a listing when the bucket's CORS configuration allows it, and
 * about a quarter of the registry's listable buckets have none.
 *
 * The probe sends an `Origin` header and reads `Access-Control-Allow-Origin`
 * from the reply, which is the same decision the browser makes. No preflight
 * is involved: the app's listing request is a simple GET.
 *
 * A wrong region in the registry comes back as a 301 that names the right one
 * in `x-amz-bucket-region`. That header is not CORS-exposed, so a browser could
 * never follow it; the corrected region is written into the index instead.
 */
import type { BucketAccess } from '../src/modules/registry/types.ts';
import { listUrl } from '../src/modules/s3/urls.ts';

export interface ProbeResult {
  access: BucketAccess;
  region: string;
}

/** Classifies one ListObjectsV2 response. */
export function classify(status: number, allowOrigin: string | null, origin: string): BucketAccess {
  if (status === 200) {
    return allowOrigin === '*' || allowOrigin === origin ? 'browsable' : 'no-cors';
  }
  if (status === 403) return 'denied';
  if (status === 404) return 'missing';
  return 'unreachable';
}

const TIMEOUT_MS = 20_000;
const ATTEMPTS = 2;

async function request(url: string, origin: string): Promise<Response> {
  let failure: unknown;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    try {
      return await fetch(url, {
        headers: { Origin: origin },
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      failure = error;
    }
  }
  throw failure;
}

export async function probeBucket(
  bucket: string,
  region: string,
  prefix: string,
  origin: string,
): Promise<ProbeResult> {
  try {
    let response = await request(listUrl({ bucket, region, prefix, maxKeys: 1 }), origin);
    const actual = response.headers.get('x-amz-bucket-region');
    if (response.status === 301 && actual != null && actual !== region) {
      await response.body?.cancel();
      region = actual;
      response = await request(listUrl({ bucket, region, prefix, maxKeys: 1 }), origin);
    }
    await response.body?.cancel();
    const allowOrigin = response.headers.get('access-control-allow-origin');
    return { access: classify(response.status, allowOrigin, origin), region };
  } catch {
    return { access: 'unreachable', region };
  }
}

/** Runs `task` over `items` with at most `limit` in flight. */
export async function pool<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index] as T);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
