import { useMemo, useState } from 'react';
import { ActionList, Button, FormControl, Select, TextInput } from '@primer/react';
import { OrganizationIcon, SearchIcon } from '@primer/octicons-react';
import type { DatasetSummary } from '../modules/registry/types';
import type { DatasetSearch } from '../modules/search/search';
import type { Route } from '../modules/route/route';
import { hrefFor, navigate, replace } from '../state/route';
import { OrganisationPicker } from './OrganisationPicker';
import styles from './SearchPane.module.css';

const PAGE = 100;

interface Props {
  search: DatasetSearch;
  route: Route;
  total: number;
}

/** Where a dataset opens: its first bucket, at the prefix the registry gives. */
export function openDataset(dataset: DatasetSummary): Partial<Route> {
  const bucket = dataset.buckets[0];
  return {
    dataset: dataset.slug,
    bucket: bucket?.bucket ?? null,
    prefix: bucket?.prefix ?? '',
    object: null,
  };
}

export function SearchPane({ search, route, total }: Props) {
  const results = useMemo(
    () => search.search({ query: route.q, tag: route.tag, org: route.org }),
    [search, route.q, route.tag, route.org],
  );
  const tags = useMemo(() => search.tagCounts(), [search]);
  // Alphabetical, unlike tags: with hundreds of organisations, finding a name
  // matters more than seeing the largest first.
  const organisations = useMemo(
    () => search.organisationCounts().sort((a, b) => a[0].localeCompare(b[0])),
    [search],
  );
  const [shown, setShown] = useState(PAGE);
  const [lastQuery, setLastQuery] = useState('');
  const queryKey = `${route.q}|${route.tag}|${route.org}`;
  if (queryKey !== lastQuery) {
    // A new search starts from the top of the list again.
    setLastQuery(queryKey);
    setShown(PAGE);
  }

  return (
    <div className={styles.pane}>
      <div className={styles.filters}>
        <FormControl>
          <FormControl.Label visuallyHidden>Search datasets</FormControl.Label>
          <TextInput
            block
            type="search"
            leadingVisual={SearchIcon}
            placeholder={`Search ${total.toLocaleString()} ${total === 1 ? 'dataset' : 'datasets'}`}
            value={route.q}
            onChange={event => replace({ q: event.target.value })}
          />
        </FormControl>
        <FormControl>
          <FormControl.Label visuallyHidden>Tag</FormControl.Label>
          <Select
            block
            value={route.tag ?? ''}
            onChange={event => navigate({ tag: event.target.value || null })}
          >
            <Select.Option value="">All tags</Select.Option>
            {route.tag != null && !tags.some(([tag]) => tag === route.tag) && (
              <Select.Option value={route.tag}>{route.tag} (0)</Select.Option>
            )}
            {tags.map(([tag, count]) => (
              <Select.Option key={tag} value={tag}>
                {tag} ({count})
              </Select.Option>
            ))}
          </Select>
        </FormControl>
        <OrganisationPicker organisations={organisations} value={route.org} />
      </div>

      <p className={styles.count} role="status">
        {results.length.toLocaleString()} {results.length === 1 ? 'dataset' : 'datasets'}
      </p>

      <div className={styles.results}>
        <ActionList aria-label="Datasets">
          {results.slice(0, shown).map(dataset => {
            const open = openDataset(dataset);
            return (
              <ActionList.LinkItem
                key={dataset.slug}
                href={hrefFor(open)}
                active={dataset.slug === route.dataset}
                onClick={event => {
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0)
                    return;
                  event.preventDefault();
                  navigate(open);
                }}
              >
                <span className={styles.name}>{dataset.name}</span>
                <ActionList.Description variant="block">
                  <span className={styles.owner}>
                    <OrganizationIcon size={12} aria-label="Managed by" />
                    {dataset.managedBy}
                  </span>
                  <span className={styles.summary}>{dataset.summary}</span>
                </ActionList.Description>
              </ActionList.LinkItem>
            );
          })}
        </ActionList>
      </div>

      {results.length > shown && (
        <div className={styles.more}>
          <Button block onClick={() => setShown(n => n + PAGE)}>
            Show more ({(results.length - shown).toLocaleString()} left)
          </Button>
        </div>
      )}
    </div>
  );
}
