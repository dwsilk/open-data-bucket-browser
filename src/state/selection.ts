/**
 * The objects picked for bulk download.
 *
 * The selection belongs to one listing page: a prefix of one bucket of one
 * dataset (its `scope`). The listing clears it when the page is left, and the
 * scope keeps the next page from showing it for the render in between.
 */
import type { S3Object } from '../modules/s3/list';
import { createStore } from './store';

export interface Selection {
  scope: string;
  objects: Readonly<Record<string, S3Object>>;
}

export const selectionStore = createStore<Selection>({ scope: '', objects: {} });

export function selectionScope(dataset: string, bucket: string, prefix: string): string {
  return `${dataset}|${bucket}|${prefix}`;
}

/** The selection, or an empty one if it belongs to another scope. */
export function selectionIn(selection: Selection, scope: string): Selection {
  return selection.scope === scope ? selection : { scope, objects: {} };
}

/** Selects or deselects objects in one step, starting afresh on a new scope. */
export function setSelected(scope: string, objects: readonly S3Object[], selected: boolean): void {
  selectionStore.set(current => {
    const next = { ...selectionIn(current, scope).objects };
    for (const object of objects) {
      if (selected) next[object.key] = object;
      else delete next[object.key];
    }
    return { scope, objects: next };
  });
}

export function clearSelection(): void {
  selectionStore.set({ scope: '', objects: {} });
}
