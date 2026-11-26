import { useRef, useState, type KeyboardEvent } from 'react';
import { clampPanelWidth, PANEL_DEFAULT, PANEL_MIN, panelMax } from '../modules/layout/panelWidth';
import styles from './Splitter.module.css';

const STEP = 16;
const BIG_STEP = 64;

interface Props {
  /** The panel's width, in pixels. */
  width: number;
  /**
   * The panel's rendered width, and the width it shares with the listing.
   * Read when a resize starts, so a window resized since is accounted for.
   */
  measure: () => { panel: number; available: number };
  onResize: (width: number) => void;
  /** The id of the panel this divider resizes. */
  controls: string;
  className?: string | undefined;
}

/**
 * The divider on the left edge of a panel. Drag it, or focus it and use the
 * arrow keys, Home and End (the WAI-ARIA window splitter pattern). A double
 * click puts the default width back.
 */
export function Splitter({ width, measure, onResize, controls, className }: Props) {
  const drag = useRef<{ x: number; width: number; available: number } | null>(null);
  const [resizing, setResizing] = useState(false);
  const [max, setMax] = useState<number | undefined>(undefined);

  function resize(next: number, available: number) {
    setMax(panelMax(available));
    onResize(clampPanelWidth(next, available));
  }

  function onKeyDown(event: KeyboardEvent) {
    const { panel, available } = measure();
    const step = event.shiftKey ? BIG_STEP : STEP;
    // The panel is on the right, so moving the divider left widens it.
    const next =
      event.key === 'ArrowLeft'
        ? panel + step
        : event.key === 'ArrowRight'
          ? panel - step
          : event.key === 'Home'
            ? PANEL_MIN
            : event.key === 'End'
              ? Number.POSITIVE_INFINITY
              : null;
    if (next == null) return;
    event.preventDefault();
    resize(next, available);
  }

  function end() {
    drag.current = null;
    setResizing(false);
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the file panel"
      aria-controls={controls}
      aria-valuenow={width}
      aria-valuemin={PANEL_MIN}
      aria-valuemax={max}
      tabIndex={0}
      className={className ? `${styles.splitter} ${className}` : styles.splitter}
      data-resizing={resizing || undefined}
      onFocus={() => setMax(panelMax(measure().available))}
      onKeyDown={onKeyDown}
      onDoubleClick={() => resize(PANEL_DEFAULT, measure().available)}
      onPointerDown={event => {
        if (event.button !== 0) return;
        // Keeps the drag from selecting text on its way across the page.
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        const { panel, available } = measure();
        drag.current = { x: event.clientX, width: panel, available };
        setResizing(true);
      }}
      onPointerMove={event => {
        const start = drag.current;
        if (start) resize(start.width + start.x - event.clientX, start.available);
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
    />
  );
}
