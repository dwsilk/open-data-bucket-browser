import { useMemo, useState } from 'react';
import { ChevronDownIcon, ChevronRightIcon } from '@primer/octicons-react';
import { JSON_CHILDREN_STEP, jsonOpenDepth, type JsonValue } from '../modules/preview/preview';
import styles from './JsonTree.module.css';

const SAFE_URL = /^https?:\/\/\S+$/i;

/**
 * A JSON value as a tree that opens and closes. A small file starts fully
 * open; a large one opens as many levels as stay quick to render. Closed
 * nodes render nothing below them, and a node shows its children 100 at a
 * time, so an array of 100,000 items opens at once.
 */
export function JsonTree({ value }: { value: JsonValue }) {
  const openDepth = useMemo(() => jsonOpenDepth(value), [value]);
  return (
    <div className={styles.tree}>
      <Node value={value} depth={0} openDepth={openDepth} />
    </div>
  );
}

type Container = JsonValue[] | { [key: string]: JsonValue };

function isContainer(value: JsonValue): value is Container {
  return value !== null && typeof value === 'object';
}

interface NodeProps {
  name?: string | undefined;
  /** Array items are labelled with their index, which reads differently from a key. */
  index?: boolean | undefined;
  value: JsonValue;
  depth: number;
  /** Nodes shallower than this start open. */
  openDepth: number;
}

function Node({ name, index = false, value, depth, openDepth }: NodeProps) {
  const [open, setOpen] = useState(depth < openDepth);
  const [shown, setShown] = useState(JSON_CHILDREN_STEP);
  const label = name != null && (
    <>
      <span className={index ? styles.index : styles.key}>{name}</span>
      <span className={styles.punctuation}>: </span>
    </>
  );

  if (!isContainer(value)) {
    return (
      <div className={styles.row}>
        <span className={styles.spacer} />
        <span>
          {label}
          <Primitive value={value} />
        </span>
      </div>
    );
  }

  const array = Array.isArray(value);
  const entries: [string, JsonValue][] = array
    ? value.map((item, i) => [String(i), item])
    : Object.entries(value);
  const [opening, closing] = array ? ['[', ']'] : ['{', '}'];

  if (entries.length === 0) {
    return (
      <div className={styles.row}>
        <span className={styles.spacer} />
        <span>
          {label}
          <span className={styles.punctuation}>
            {opening}
            {closing}
          </span>
        </span>
      </div>
    );
  }

  const noun = array
    ? entries.length === 1
      ? 'item'
      : 'items'
    : entries.length === 1
      ? 'key'
      : 'keys';
  const rest = entries.length - shown;

  return (
    <div>
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        {open ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
        <span>
          {label}
          <span className={styles.punctuation}>{opening}</span>
          {!open && (
            <>
              <span className={styles.count}>
                {' '}
                {entries.length.toLocaleString()} {noun}{' '}
              </span>
              <span className={styles.punctuation}>{closing}</span>
            </>
          )}
        </span>
      </button>
      {open && (
        <>
          <ul className={styles.children}>
            {entries.slice(0, shown).map(([key, item]) => (
              <li key={key}>
                <Node
                  name={key}
                  index={array}
                  value={item}
                  depth={depth + 1}
                  openDepth={openDepth}
                />
              </li>
            ))}
          </ul>
          {rest > 0 && (
            <button
              type="button"
              className={styles.more}
              onClick={() => setShown(s => s + JSON_CHILDREN_STEP)}
            >
              Show {Math.min(JSON_CHILDREN_STEP, rest).toLocaleString()} more of{' '}
              {rest.toLocaleString()}
            </button>
          )}
          <div className={styles.row}>
            <span className={styles.spacer} />
            <span className={styles.punctuation}>{closing}</span>
          </div>
        </>
      )}
    </div>
  );
}

function Primitive({ value }: { value: string | number | boolean | null }) {
  if (typeof value === 'string') {
    const quoted = JSON.stringify(value);
    return SAFE_URL.test(value) ? (
      <a className={styles.string} href={value} target="_blank" rel="noreferrer">
        {quoted}
      </a>
    ) : (
      <span className={styles.string}>{quoted}</span>
    );
  }
  if (typeof value === 'number') return <span className={styles.number}>{value}</span>;
  return <span className={styles.literal}>{String(value)}</span>;
}
