/**
 * The folder listing as a table that renders only the rows in view.
 *
 * A folder can hold tens of thousands of entries once "Load more" has run a
 * few times, and every row carries a checkbox, two icon buttons with their
 * tooltips, and a link. Rendering all of them at once stalls the browser,
 * so the table is its own scroll container and a virtualizer renders the
 * rows near the viewport, with one spacer row above and one below standing
 * in for the rest. Browser find-in-page sees only the rendered rows; the
 * "Names containing" filter is the way to search a long folder.
 */
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { measureElement, observeElementRect, useVirtualizer } from '@tanstack/react-virtual';
import { Checkbox, IconButton } from '@primer/react';
import { DownloadIcon, FileDirectoryFillIcon, FileIcon } from '@primer/octicons-react';
import { formatBytes, formatDate } from '../modules/format';
import { folderOf } from '../modules/route/route';
import type { S3Object } from '../modules/s3/list';
import { objectUrl } from '../modules/s3/urls';
import { hrefFor, navigate } from '../state/route';
import { CopyButton } from './CopyButton';
import styles from './ListingTable.module.css';

type SortKey = 'name' | 'size' | 'modified';

interface Props {
  bucket: string;
  region: string;
  prefix: string;
  folders: string[];
  objects: S3Object[];
  /** Key of the object shown in the details panel. */
  selected: string | null;
  /** Keys picked for bulk download. */
  checked: ReadonlySet<string>;
  onCheck: (objects: S3Object[], checked: boolean) => void;
  /** Called when the last row is rendered, that is, within the overscan of the view. */
  onEndReached: () => void;
}

type Row = { kind: 'folder'; prefix: string; name: string } | { kind: 'file'; object: S3Object };

/** A typical row; the virtualizer measures the real height of each row it renders. */
const ROW_HEIGHT = 37;
/** Rows rendered beyond each edge of the viewport, so a fast scroll does not show gaps. */
const OVERSCAN = 12;
/** The tallest the table asks for before it scrolls, when the column has room. */
const MIN_SCROLL_HEIGHT = 240;
/** The size assumed for a scroll area that has not been laid out. */
const UNMEASURED = { width: 0, height: 800 };

/** Keep plain clicks in the app; let modified clicks open a new tab. */
function follow(event: MouseEvent, change: Parameters<typeof navigate>[0]): void {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
  event.preventDefault();
  navigate(change);
}

/**
 * Sorting applies to the entries loaded so far. S3 returns keys in UTF-8
 * byte order and offers no other, so a sort by size cannot reach past the
 * loaded pages.
 */
function sortObjects(objects: S3Object[], key: SortKey, ascending: boolean): S3Object[] {
  if (key === 'name') return ascending ? objects : [...objects].reverse();
  const value = (o: S3Object) => (key === 'size' ? o.size : Date.parse(o.lastModified));
  const sorted = [...objects].sort((a, b) => value(a) - value(b));
  return ascending ? sorted : sorted.reverse();
}

function rowKey(row: Row | undefined): string {
  if (!row) return '';
  return row.kind === 'folder' ? `d:${row.name}` : `f:${row.object.key}`;
}

/** What each rendered row needs from the virtualizer. */
interface Placement {
  index: number;
  measure: (element: HTMLTableRowElement | null) => void;
}

/**
 * A folder row has a cell in every column a file row has, spanning name and
 * size, so a column hidden on narrow screens is hidden in every row and the
 * rows keep the table's full width.
 */
function FolderRow({ prefix, name, index, measure }: Placement & { prefix: string; name: string }) {
  return (
    <tr ref={measure} data-index={index} aria-rowindex={index + 2}>
      <td />
      <td colSpan={2}>
        <a
          className={styles.name}
          href={hrefFor({ prefix, object: null })}
          onClick={event => follow(event, { prefix, object: null })}
        >
          <span className={styles.folderIcon}>
            <FileDirectoryFillIcon />
          </span>
          {name}
        </a>
      </td>
      <td className={styles.date} />
      <td colSpan={2} />
    </tr>
  );
}

interface FileRowProps extends Placement {
  object: S3Object;
  name: string;
  url: string;
  selected: boolean;
  checked: boolean;
  onCheck: (objects: S3Object[], checked: boolean) => void;
}

function FileRow({ object, name, url, selected, checked, onCheck, index, measure }: FileRowProps) {
  return (
    <tr
      ref={measure}
      data-index={index}
      aria-rowindex={index + 2}
      className={selected ? styles.selected : undefined}
    >
      <td className={styles.check}>
        <Checkbox
          aria-label={`Select ${name}`}
          checked={checked}
          onChange={event => onCheck([object], event.target.checked)}
        />
      </td>
      <td>
        <a
          className={styles.name}
          href={hrefFor({ object: object.key })}
          aria-current={selected ? 'true' : undefined}
          onClick={event => follow(event, { object: object.key })}
        >
          <span className={styles.fileIcon}>
            <FileIcon />
          </span>
          {name}
        </a>
      </td>
      <td className={styles.numeric}>{formatBytes(object.size)}</td>
      <td className={styles.date}>{formatDate(object.lastModified, true)}</td>
      <td className={styles.actions}>
        <CopyButton value={url} label={`Copy URL of ${name}`} />
      </td>
      <td className={styles.actions}>
        <IconButton
          as="a"
          href={url}
          size="small"
          variant="invisible"
          icon={DownloadIcon}
          aria-label={`Download ${name}`}
        />
      </td>
    </tr>
  );
}

/**
 * Stands in for the rows that are not rendered. It has the same columns as
 * a folder row, so it never adds a column when "Last modified" is hidden.
 */
function Spacer({ height }: { height: number }) {
  if (height <= 0) return null;
  return (
    <tr aria-hidden="true" className={styles.spacer} style={{ height }}>
      <td colSpan={5} />
      <td className={styles.date} />
    </tr>
  );
}

export function ListingTable({
  bucket,
  region,
  prefix,
  folders,
  objects,
  selected,
  checked,
  onCheck,
  onEndReached,
}: Props) {
  const [sort, setSort] = useState<{ key: SortKey; ascending: boolean }>({
    key: 'name',
    ascending: true,
  });
  const folder = folderOf(prefix);
  const files = useMemo(
    () => sortObjects(objects, sort.key, sort.ascending),
    [objects, sort.key, sort.ascending],
  );
  const checkedHere = useMemo(() => files.filter(o => checked.has(o.key)).length, [files, checked]);

  const rows = useMemo(() => {
    const parent = folder === '' ? null : folderOf(folder.slice(0, -1));
    // Folders have no size or date, so they keep S3's order unless names are reversed.
    const ordered = sort.key === 'name' && !sort.ascending ? [...folders].reverse() : folders;
    const result: Row[] = [];
    if (parent != null) result.push({ kind: 'folder', prefix: parent, name: '..' });
    for (const path of ordered) {
      result.push({ kind: 'folder', prefix: path, name: path.slice(folder.length) });
    }
    for (const object of files) result.push({ kind: 'file', object });
    return result;
  }, [folder, folders, files, sort.key, sort.ascending]);

  const scroller = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW_HEIGHT,
    getItemKey: index => rowKey(rows[index]),
    overscan: OVERSCAN,
    // A scroll area with no height yet (before layout, or in tests, which
    // have none) still renders a screenful of rows rather than none.
    initialRect: UNMEASURED,
    observeElementRect: (instance, report) =>
      observeElementRect(instance, rect => report(rect.height > 0 ? rect : UNMEASURED)),
    // Likewise a row that measures 0 counts as a typical row: otherwise a
    // screenful of 0-height rows never fills, and every row renders.
    measureElement: (element, entry, instance) =>
      measureElement(element, entry, instance) || ROW_HEIGHT,
  });
  const items = virtualizer.getVirtualItems();
  const total = virtualizer.getTotalSize();
  // Offsets count from the top of the scroll area, which the sticky header
  // also covers, so the rows the header hides count as out of view.
  const before = items[0]?.start ?? 0;
  const after = total - (items.at(-1)?.end ?? 0);

  // The last row renders once it is within the overscan of the view, which
  // leaves a page's request time to fetch more before the end is reached.
  // A short or filtered list that does not fill the view asks again after
  // each page, until it fills or the folder ends.
  const lastRendered = items.at(-1)?.index ?? -1;
  const atEnd = rows.length > 0 && lastRendered === rows.length - 1;
  useEffect(() => {
    if (atEnd) onEndReached();
  }, [atEnd, rows.length, onEndReached]);

  const header = (key: SortKey, label: string, className?: string) => {
    const active = sort.key === key;
    return (
      <th
        scope="col"
        className={className}
        aria-sort={active ? (sort.ascending ? 'ascending' : 'descending') : 'none'}
      >
        <button
          type="button"
          className={styles.sort}
          onClick={() => setSort({ key, ascending: active ? !sort.ascending : true })}
        >
          {label}
          {active && <span aria-hidden="true">{sort.ascending ? ' ▲' : ' ▼'}</span>}
        </button>
      </th>
    );
  };

  return (
    <div
      ref={scroller}
      className={styles.scroller}
      // Short listings take their own height; long ones at least this much,
      // then scroll inside the column.
      style={{ minHeight: Math.min(total + ROW_HEIGHT + 2, MIN_SCROLL_HEIGHT) }}
    >
      <table className={styles.table} aria-rowcount={rows.length + 1}>
        <thead>
          <tr aria-rowindex={1}>
            <th scope="col" className={styles.check}>
              {files.length > 0 && (
                <Checkbox
                  aria-label={`Select all ${files.length.toLocaleString()} files in this list`}
                  checked={checkedHere === files.length}
                  indeterminate={checkedHere > 0 && checkedHere < files.length}
                  onChange={event => onCheck(files, event.target.checked)}
                />
              )}
            </th>
            {header('name', 'Name')}
            {header('size', 'Size', styles.numeric)}
            {header('modified', 'Last modified', styles.date)}
            <th scope="col" className={styles.actions}>
              <span className={styles.hidden}>Copy URL</span>
            </th>
            <th scope="col" className={styles.actions}>
              <span className={styles.hidden}>Download</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <Spacer height={before} />
          {items.map(item => {
            const row = rows[item.index];
            if (!row) return null;
            if (row.kind === 'folder') {
              return (
                <FolderRow
                  key={item.key}
                  index={item.index}
                  measure={virtualizer.measureElement}
                  prefix={row.prefix}
                  name={row.name}
                />
              );
            }
            const { object } = row;
            return (
              <FileRow
                key={item.key}
                index={item.index}
                measure={virtualizer.measureElement}
                object={object}
                name={object.key.slice(folder.length) || object.key}
                url={objectUrl(bucket, region, object.key)}
                selected={object.key === selected}
                checked={checked.has(object.key)}
                onCheck={onCheck}
              />
            );
          })}
          <Spacer height={after} />
        </tbody>
      </table>
    </div>
  );
}
