/**
 * The width of the details panel, which the divider beside it changes.
 *
 * The width is a per-browser convenience, so it lives in localStorage. Storage
 * can be missing or throw (private windows, blocked site data), and then the
 * panel just starts at its default width.
 */

export const PANEL_MIN = 320;
export const PANEL_DEFAULT = 480;
/** The bucket listing keeps at least this much width, however wide the panel is dragged. */
export const LISTING_MIN = 360;

const KEY = 'detailsPanelWidth';

/**
 * `available` is the width the listing and the panel share. When it is too
 * narrow for both minimums, the panel keeps its own.
 */
export function clampPanelWidth(width: number, available: number): number {
  return Math.round(Math.min(Math.max(width, PANEL_MIN), panelMax(available)));
}

/** The widest the panel can be when it shares `available` with the listing. */
export function panelMax(available: number): number {
  return Math.max(PANEL_MIN, Math.round(available - LISTING_MIN));
}

export function readPanelWidth(): number {
  try {
    const stored = Number(localStorage.getItem(KEY));
    return Number.isFinite(stored) && stored >= PANEL_MIN ? stored : PANEL_DEFAULT;
  } catch {
    return PANEL_DEFAULT;
  }
}

export function storePanelWidth(width: number): void {
  try {
    localStorage.setItem(KEY, String(width));
  } catch {
    // The width is a convenience. Without storage it resets on the next visit.
  }
}
