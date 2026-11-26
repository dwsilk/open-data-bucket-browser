/**
 * One folder's listing, a page at a time.
 *
 * S3 returns at most 1,000 entries a request and some folders here hold
 * millions, so the listing never loads everything at once: it loads a page,
 * and the next when `loadMore` is called (the table calls it as its end
 * scrolls into view). A change of bucket or prefix aborts whatever is in flight,
 * so a slow page from the previous folder can never land in this one.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ListError, listPage, type S3Object } from './list';

export interface ListingTarget {
  bucket: string;
  region: string;
  prefix: string;
}

export interface Listing {
  status: 'loading' | 'ready' | 'error';
  folders: string[];
  objects: S3Object[];
  nextToken: string | null;
  loadingMore: boolean;
  error: ListError | null;
}

const INITIAL: Listing = {
  status: 'loading',
  folders: [],
  objects: [],
  nextToken: null,
  loadingMore: false,
  error: null,
};

function asListError(error: unknown): ListError {
  return error instanceof ListError
    ? error
    : new ListError(error instanceof Error ? error.message : String(error), 'Unknown');
}

export function useListing(target: ListingTarget | null): Listing & { loadMore: () => void } {
  const bucket = target?.bucket;
  const region = target?.region;
  const prefix = target?.prefix;
  const key = target ? `${target.bucket}|${target.region}|${target.prefix}` : '';
  // Tagged with the target it belongs to, so the render between a prefix
  // change and the effect that clears the state shows nothing rather than
  // the previous folder's entries.
  const [state, setListing] = useState<Listing & { key: string }>({ ...INITIAL, key });
  const listing: Listing = state.key === key ? state : INITIAL;
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    if (bucket == null || region == null || prefix == null) return;
    const forKey = `${bucket}|${region}|${prefix}`;
    const abort = new AbortController();
    controller.current = abort;
    setListing({ ...INITIAL, key: forKey });
    listPage({ bucket, region, prefix }, abort.signal).then(
      page => setListing({ ...INITIAL, key: forKey, status: 'ready', ...page }),
      (error: unknown) => {
        if (abort.signal.aborted) return;
        setListing({ ...INITIAL, key: forKey, status: 'error', error: asListError(error) });
      },
    );
    return () => abort.abort();
  }, [bucket, region, prefix]);

  const loadMore = useCallback(() => {
    const token = listing.nextToken;
    const abort = controller.current;
    if (bucket == null || region == null || prefix == null || token == null || !abort) return;
    if (listing.loadingMore) return;
    setListing(current => ({ ...current, loadingMore: true, error: null }));
    listPage({ bucket, region, prefix, continuationToken: token }, abort.signal).then(
      page =>
        setListing(current => ({
          ...current,
          folders: [...current.folders, ...page.folders],
          objects: [...current.objects, ...page.objects],
          nextToken: page.nextToken,
          loadingMore: false,
        })),
      (error: unknown) => {
        if (abort.signal.aborted) return;
        setListing(current => ({ ...current, loadingMore: false, error: asListError(error) }));
      },
    );
  }, [bucket, region, prefix, listing.nextToken, listing.loadingMore]);

  return { ...listing, loadMore };
}
