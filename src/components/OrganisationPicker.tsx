import { useMemo, useState } from 'react';
import { Button, SelectPanel, type SelectPanelItemInput } from '@primer/react';
import { TriangleDownIcon } from '@primer/octicons-react';
import { navigate } from '../state/route';
import styles from './OrganisationPicker.module.css';

interface Props {
  /** Organisation names with dataset counts. */
  organisations: [organisation: string, count: number][];
  value: string | null;
}

/**
 * A filterable organisation picker.
 *
 * A native select is no good here: there are hundreds of organisations, and
 * the browser draws the open list as wide as the longest name. The panel has
 * a fixed width, a filter box, and renders only the rows in view.
 */
export function OrganisationPicker({ organisations, value }: Props) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');

  const items = useMemo(
    () =>
      organisations.map(([organisation, count]) => ({
        id: organisation,
        text: organisation,
        trailingVisual: count.toLocaleString(),
      })),
    [organisations],
  );
  const shown = useMemo(() => {
    const words = filter.toLowerCase().split(/\s+/).filter(Boolean);
    return words.length === 0
      ? items
      : items.filter(item => words.every(word => item.text.toLowerCase().includes(word)));
  }, [items, filter]);
  const selected = items.find(item => item.id === value);

  return (
    <div className={styles.anchor}>
      <SelectPanel
        title="Organisation"
        placeholderText="Filter organisations"
        inputLabel="Filter organisations"
        open={open}
        onOpenChange={next => {
          setOpen(next);
          if (!next) setFilter('');
        }}
        renderAnchor={({ children: _children, ...anchorProps }) => (
          <Button {...anchorProps} block alignContent="start" trailingAction={TriangleDownIcon}>
            {selected?.text ?? 'All organisations'}
          </Button>
        )}
        items={shown}
        selected={selected}
        // Choosing the selected organisation again clears the filter.
        onSelectedChange={(item: SelectPanelItemInput | undefined) =>
          navigate({ org: item ? String(item.id) : null })
        }
        filterValue={filter}
        onFilterChange={next => setFilter(next)}
        virtualized
        width="medium"
        height="large"
        {...(value != null && {
          secondaryAction: (
            <SelectPanel.SecondaryActionButton
              onClick={() => {
                navigate({ org: null });
                setOpen(false);
              }}
            >
              All organisations
            </SelectPanel.SecondaryActionButton>
          ),
        })}
      />
    </div>
  );
}
