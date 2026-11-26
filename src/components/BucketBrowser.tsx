import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionList,
  ActionMenu,
  Breadcrumbs,
  Button,
  Dialog,
  Flash,
  FormControl,
  Heading,
  Label,
  Spinner,
  TextInput,
} from '@primer/react';
import { FilterIcon, GlobeIcon, InfoIcon, TriangleDownIcon, XIcon } from '@primer/octicons-react';
import type { BucketResource, DatasetSummary } from '../modules/registry/types';
import { distinctBuckets } from '../modules/registry/types';
import { crumbs, folderOf, startsWithOf, toSearch, type Route } from '../modules/route/route';
import { s3Uri } from '../modules/s3/urls';
import { useListing } from '../modules/s3/useListing';
import { hrefFor, navigate } from '../state/route';
import {
  clearSelection,
  selectionIn,
  selectionScope,
  selectionStore,
  setSelected,
} from '../state/selection';
import { useStore } from '../state/useStore';
import { AccessLabel } from './AccessLabel';
import { CopyButton } from './CopyButton';
import { DatasetMetadata } from './DatasetMetadata';
import { ListingTable } from './ListingTable';
import { SelectionBar } from './SelectionBar';
import styles from './BucketBrowser.module.css';

interface Props {
  dataset: DatasetSummary;
  route: Route;
}

/**
 * The resource the route points at. A bucket can be listed more than once,
 * under different prefixes; prefer the one the current prefix lies inside.
 */
export function currentResource(dataset: DatasetSummary, route: Route): BucketResource | null {
  const matches = dataset.buckets.filter(b => b.bucket === route.bucket);
  return (
    matches.find(b => b.prefix !== '' && route.prefix.startsWith(b.prefix)) ??
    matches.find(b => b.prefix === '') ??
    matches[0] ??
    null
  );
}

export function BucketBrowser({ dataset, route }: Props) {
  const resource = currentResource(dataset, route);
  // The dialog belongs to the route it opened on. Following a tag or bucket
  // link inside it, or going back, closes it without any extra state.
  const [aboutOpenAt, setAboutOpenAt] = useState<string | null>(null);
  const aboutOpen = aboutOpenAt === toSearch(route);
  const aboutButton = useRef<HTMLButtonElement>(null);

  if (!resource) {
    return (
      <Flash variant="danger">
        This dataset has no bucket named <code>{route.bucket}</code>.
      </Flash>
    );
  }

  return (
    <div className={styles.browser}>
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <Heading as="h2" className={styles.title}>
            {dataset.name}
          </Heading>
          <Button
            ref={aboutButton}
            size="small"
            leadingVisual={InfoIcon}
            onClick={() => setAboutOpenAt(toSearch(route))}
          >
            About this dataset
          </Button>
        </div>
        <p className={styles.meta}>
          <Label>
            <span className={styles.region}>
              <GlobeIcon size={12} aria-label="AWS region" />
              {resource.region}
            </span>
          </Label>
          {resource.access === 'unchecked' && <AccessLabel access={resource.access} />}
        </p>
      </header>

      <Listing
        resource={resource}
        buckets={distinctBuckets(dataset.buckets)}
        route={route}
        scope={selectionScope(dataset.slug, resource.bucket, route.prefix)}
      />

      {aboutOpen && (
        <Dialog
          title={dataset.name}
          width="52rem"
          returnFocusRef={aboutButton}
          onClose={() => setAboutOpenAt(null)}
        >
          <DatasetMetadata slug={dataset.slug} />
        </Dialog>
      )}
    </div>
  );
}

/**
 * Entries loaded before automatic loading pauses for a click. A page is
 * 1,000 entries, so this is 100 requests: far past anything a person
 * scrolls through, but a stop for a filter searching a folder of millions.
 */
const AUTO_LOAD_STEP = 100_000;

/** Whether the name inside the folder contains `needle`, already lower case. */
function nameContains(key: string, folder: string, needle: string): boolean {
  return needle === '' || key.slice(folder.length).toLowerCase().includes(needle);
}

function Listing({
  resource,
  buckets,
  route,
  scope,
}: {
  resource: BucketResource;
  /** The dataset's distinct buckets. With more than one, the bucket crumb picks between them. */
  buckets: BucketResource[];
  route: Route;
  scope: string;
}) {
  const { bucket, region } = resource;
  const selection = selectionIn(useStore(selectionStore), scope).objects;
  const picked = useMemo(() => Object.values(selection), [selection]);
  const checked = useMemo(() => new Set(Object.keys(selection)), [selection]);
  // Leaving the page, for another folder, bucket or dataset, or for the
  // welcome page, drops the selection. Opening a file does not leave it.
  useEffect(() => () => clearSelection(), [scope]);
  const listing = useListing({ bucket, region, prefix: route.prefix });
  const folder = folderOf(route.prefix);
  // Older links narrow the listing with a prefix that does not end in `/`.
  // S3 does that on the server; the box below can only search what is loaded.
  const startsWith = startsWithOf(route.prefix);
  const [filter, setFilter] = useState('');
  const [limit, setLimit] = useState(AUTO_LOAD_STEP);
  const [stateFor, setStateFor] = useState(`${bucket}|${route.prefix}`);
  if (stateFor !== `${bucket}|${route.prefix}`) {
    // A new folder starts unfiltered, with a fresh automatic-loading budget.
    setStateFor(`${bucket}|${route.prefix}`);
    setFilter('');
    setLimit(AUTO_LOAD_STEP);
  }

  const needle = filter.trim().toLowerCase();
  const folders = useMemo(
    () => listing.folders.filter(path => nameContains(path, folder, needle)),
    [listing.folders, folder, needle],
  );
  const objects = useMemo(
    () => listing.objects.filter(o => nameContains(o.key, folder, needle)),
    [listing.objects, folder, needle],
  );

  const trail = crumbs(bucket, route.prefix);
  const loaded = listing.folders.length + listing.objects.length;
  const shown = folders.length + objects.length;
  const more = listing.nextToken != null;
  const paused = more && loaded >= limit;

  // Loads the next page when the table's end comes into view. Not after a
  // failure (the footer offers a retry), and not past the limit, so a filter
  // that matches little cannot walk a folder of millions on its own.
  const { status, loadingMore, error, loadMore } = listing;
  const loadNext = useCallback(() => {
    if (status === 'ready' && more && !loadingMore && !error && !paused) loadMore();
  }, [status, more, loadingMore, error, paused, loadMore]);
  // With nothing to show there is no table to report its end, so ask here.
  useEffect(() => {
    if (shown === 0) loadNext();
  }, [shown, loadNext]);

  return (
    <>
      <nav className={styles.toolbar} aria-label="Location">
        <div className={styles.crumbs}>
          <Breadcrumbs>
            {trail.map((crumb, i) => {
              const last = i === trail.length - 1 && startsWith === '';
              if (i === 0 && buckets.length > 1) {
                return <BucketMenu key="" current={bucket} buckets={buckets} />;
              }
              return (
                <Breadcrumbs.Item
                  key={crumb.prefix}
                  href={hrefFor({ prefix: crumb.prefix, object: null })}
                  selected={last}
                  onClick={event => {
                    event.preventDefault();
                    navigate({ prefix: crumb.prefix, object: null });
                  }}
                >
                  {crumb.label}
                </Breadcrumbs.Item>
              );
            })}
            {startsWith !== '' && (
              <Breadcrumbs.Item selected>
                {startsWith}
                {'*'}
              </Breadcrumbs.Item>
            )}
          </Breadcrumbs>
        </div>
        <CopyButton value={s3Uri(bucket, folder)} label="Copy S3 URI of this folder" />
      </nav>

      <div className={styles.filter} role="search">
        <div className={styles.filterInput}>
          <FormControl>
            <FormControl.Label visuallyHidden>Names containing</FormControl.Label>
            <TextInput
              block
              leadingVisual={FilterIcon}
              placeholder="Names containing…"
              value={filter}
              onChange={event => setFilter(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Escape') setFilter('');
              }}
              {...(filter !== '' && {
                trailingAction: (
                  <TextInput.Action
                    icon={XIcon}
                    aria-label="Clear filter"
                    onClick={() => setFilter('')}
                  />
                ),
              })}
            />
          </FormControl>
        </div>
      </div>

      <SelectionBar bucket={bucket} region={region} objects={picked} />

      {listing.status === 'loading' && (
        <div className={styles.loading}>
          <Spinner size="small" /> Listing…
        </div>
      )}
      {listing.status === 'error' && listing.error && (
        <Flash variant="danger">
          <strong>{listing.error.code}</strong>: {listing.error.message}
        </Flash>
      )}
      {listing.status === 'ready' && shown === 0 && (!more || paused || error) && (
        <p className={styles.empty}>
          {needle !== ''
            ? `No ${more ? 'loaded ' : ''}names contain “${filter.trim()}”.`
            : startsWith === ''
              ? 'This folder is empty.'
              : `No names start with “${startsWith}”.`}
        </p>
      )}
      {listing.status === 'ready' && shown > 0 && (
        <ListingTable
          bucket={bucket}
          region={region}
          prefix={route.prefix}
          folders={folders}
          objects={objects}
          selected={route.object}
          checked={checked}
          onCheck={(objects, on) => setSelected(scope, objects, on)}
          onEndReached={loadNext}
        />
      )}
      {listing.status === 'ready' && (
        <div className={styles.footer}>
          <span role="status">
            {needle !== '' && `${shown.toLocaleString()} of `}
            {loaded.toLocaleString()} {loaded === 1 ? 'entry' : 'entries'}
            {needle !== '' && ' match'}
            {paused && `. Stopped loading automatically at ${loaded.toLocaleString()}.`}
          </span>
          {loadingMore && (
            <span className={styles.loading}>
              <Spinner size="small" /> {needle !== '' ? 'Searching more…' : 'Loading more…'}
            </span>
          )}
          {paused && !loadingMore && (
            <Button size="small" onClick={() => setLimit(loaded + AUTO_LOAD_STEP)}>
              Keep loading
            </Button>
          )}
          {error && (
            <>
              <span className={styles.error}>{error.message}</span>
              <Button size="small" onClick={loadMore}>
                Retry
              </Button>
            </>
          )}
        </div>
      )}
    </>
  );
}

/**
 * The bucket crumb of a dataset with several buckets: a menu of them. Each
 * opens where the registry points, as it does when the dataset is opened.
 */
function BucketMenu({ current, buckets }: { current: string; buckets: BucketResource[] }) {
  return (
    <ActionMenu>
      {/* A plain inline button, not ActionMenu.Button: Primer's button is a
          block that breaks the crumb trail onto a new line. */}
      <ActionMenu.Anchor>
        <button type="button" className={styles.bucketCrumb} aria-label={`Bucket: ${current}`}>
          {current}
          <TriangleDownIcon size={16} />
        </button>
      </ActionMenu.Anchor>
      <ActionMenu.Overlay width="auto">
        <ActionList selectionVariant="single">
          {buckets.map(b => (
            <ActionList.Item
              key={b.bucket}
              selected={b.bucket === current}
              onSelect={() => navigate({ bucket: b.bucket, prefix: b.prefix, object: null })}
            >
              {b.bucket}
              <ActionList.Description variant="block">
                {s3Uri(b.bucket, b.prefix)} · {b.region}
              </ActionList.Description>
            </ActionList.Item>
          ))}
        </ActionList>
      </ActionMenu.Overlay>
    </ActionMenu>
  );
}
