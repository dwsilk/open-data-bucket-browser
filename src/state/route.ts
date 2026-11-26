/**
 * The current route, kept in step with the address bar.
 *
 * `navigate` pushes a history entry, so Back steps out of a folder or a
 * dataset. `replace` is for typing in a search box, where every keystroke
 * would otherwise become an entry.
 */
import { parseRoute, toSearch, type Route } from '../modules/route/route';
import { createStore } from './store';

export const routeStore = createStore<Route>(parseRoute(window.location.search));

function write(route: Route, push: boolean): void {
  const url = `${window.location.pathname}${toSearch(route)}`;
  if (push) window.history.pushState(null, '', url);
  else window.history.replaceState(null, '', url);
  routeStore.set(route);
}

export function navigate(change: Partial<Route>): void {
  write({ ...routeStore.get(), ...change }, true);
}

export function replace(change: Partial<Route>): void {
  write({ ...routeStore.get(), ...change }, false);
}

/** An href for a link that also works with a middle click or "copy link". */
export function hrefFor(change: Partial<Route>): string {
  return `${window.location.pathname}${toSearch({ ...routeStore.get(), ...change })}`;
}

window.addEventListener('popstate', () => {
  routeStore.set(parseRoute(window.location.search));
});
