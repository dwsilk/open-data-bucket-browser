import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { Flash, Link } from '@primer/react';
import { BucketBrowser, currentResource } from '../components/BucketBrowser';
import { ObjectDetails } from '../components/ObjectDetails';
import { SearchPane } from '../components/SearchPane';
import { Splitter } from '../components/Splitter';
import { Welcome } from '../components/Welcome';
import { readPanelWidth, storePanelWidth } from '../modules/layout/panelWidth';
import { REGISTRY_URL, type DatasetIndex } from '../modules/registry/types';
import { DatasetSearch } from '../modules/search/search';
import { routeStore } from '../state/route';
import { useStore } from '../state/useStore';
import styles from './App.module.css';

export function App({ index }: { index: DatasetIndex }) {
  const route = useStore(routeStore);
  const search = useMemo(() => new DatasetSearch(index.datasets), [index]);
  const dataset = useMemo(
    () => index.datasets.find(d => d.slug === route.dataset) ?? null,
    [index, route.dataset],
  );
  const resource = dataset ? currentResource(dataset, route) : null;
  const file = resource && route.object != null ? { resource, key: route.object } : null;

  const [panelWidth, setPanelWidth] = useState(readPanelWidth);
  const main = useRef<HTMLElement>(null);
  const panel = useRef<HTMLElement>(null);
  // Without layout (in tests), offsetWidth is 0; fall back to the state and window.
  const measure = () => {
    const rendered = panel.current?.offsetWidth ?? 0;
    const width = rendered > 0 ? rendered : panelWidth;
    const shared = (main.current?.offsetWidth ?? 0) + width;
    return { panel: width, available: shared > width ? shared : window.innerWidth };
  };

  return (
    <div
      className={file ? `${styles.app} ${styles.withFile}` : styles.app}
      style={file ? ({ '--panel-width': `${panelWidth}px` } as CSSProperties) : undefined}
    >
      <header className={styles.header}>
        <h1 className={styles.brand}>
          <a href={import.meta.env.BASE_URL}>Open Data Bucket Browser</a>
        </h1>
        <span className={styles.tagline}>
          Public S3 buckets from the{' '}
          <Link href={REGISTRY_URL} target="_blank" rel="noreferrer" className={styles.headerLink}>
            Registry of Open Data on AWS
          </Link>
        </span>
      </header>

      <aside className={styles.search} aria-label="Dataset search">
        <SearchPane search={search} route={route} total={index.datasets.length} />
      </aside>

      <main ref={main} className={styles.main}>
        {route.dataset != null && !dataset ? (
          <div className={styles.padded}>
            <Flash variant="danger">
              No dataset called <code>{route.dataset}</code> is in this index. The page shows only
              datasets with a bucket that a web page can list.
            </Flash>
          </div>
        ) : dataset ? (
          <BucketBrowser key={dataset.slug} dataset={dataset} route={route} />
        ) : (
          <Welcome index={index} search={search} />
        )}
      </main>

      {file && (
        <>
          <Splitter
            className={styles.splitter}
            width={panelWidth}
            measure={measure}
            controls="file-panel"
            onResize={width => {
              setPanelWidth(width);
              storePanelWidth(width);
            }}
          />
          <aside id="file-panel" ref={panel} className={styles.details} aria-label="File">
            <ObjectDetails
              bucket={file.resource.bucket}
              region={file.resource.region}
              objectKey={file.key}
            />
          </aside>
        </>
      )}
    </div>
  );
}
