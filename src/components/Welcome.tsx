import { useState } from 'react';
import { Button, Heading, Label, Link } from '@primer/react';
import { formatDate } from '../modules/format';
import { REGISTRY_URL, type DatasetIndex } from '../modules/registry/types';
import type { DatasetSearch } from '../modules/search/search';
import type { Route } from '../modules/route/route';
import { hrefFor, navigate } from '../state/route';
import styles from './Welcome.module.css';

const SHOWN = 24;

export function Welcome({ index, search }: { index: DatasetIndex; search: DatasetSearch }) {
  const buckets = new Set(index.datasets.flatMap(d => d.buckets.map(b => b.bucket))).size;
  const tags = search.tagCounts();
  const organisations = search.organisationCounts();

  return (
    <div className={styles.welcome}>
      <Heading as="h2" className={styles.title}>
        Browse public S3 buckets from the Registry of Open Data
      </Heading>
      <p>
        Search the datasets listed in the{' '}
        <Link href={REGISTRY_URL} target="_blank" rel="noreferrer">
          Registry of Open Data on AWS
        </Link>
        , then open one to browse its bucket. Everything here is anonymous and read-only: there is
        nothing to sign in to and nothing to upload.
      </p>

      <dl className={styles.stats}>
        <div>
          <dt>Datasets</dt>
          <dd>{index.datasets.length.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Buckets</dt>
          <dd>{buckets.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Organisations</dt>
          <dd>{organisations.length.toLocaleString()}</dd>
        </div>
      </dl>

      <p className={styles.note}>
        The page shows only datasets with a bucket that a web page can list. Bucket access was
        checked when this index was built on {formatDate(index.generated)}.
      </p>

      <Facet title="Popular tags" items={tags} change={tag => ({ tag })} expandable={false} />
      <Facet title="Organisations" items={organisations} change={org => ({ org })} />
    </div>
  );
}

interface FacetProps {
  title: string;
  items: [value: string, count: number][];
  /** The route change that filters the search to one value. */
  change: (value: string) => Partial<Route>;
  /** Offer a button to show the items past the first few. */
  expandable?: boolean | undefined;
}

/** Selectable values with dataset counts, largest first. */
function Facet({ title, items, change, expandable = true }: FacetProps) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, SHOWN);
  return (
    <section className={styles.facet}>
      <Heading as="h3" className={styles.subtitle}>
        {title}
      </Heading>
      <ul className={styles.tags}>
        {shown.map(([value, count]) => (
          <li key={value}>
            <a
              href={hrefFor(change(value))}
              onClick={event => {
                event.preventDefault();
                navigate(change(value));
              }}
            >
              <Label size="large">
                {value} <span className={styles.count}>{count}</span>
              </Label>
            </a>
          </li>
        ))}
      </ul>
      {expandable && items.length > SHOWN && (
        <div>
          <Button size="small" variant="invisible" onClick={() => setAll(a => !a)}>
            {all ? 'Show fewer' : `Show all ${items.length.toLocaleString()}`}
          </Button>
        </div>
      )}
    </section>
  );
}
