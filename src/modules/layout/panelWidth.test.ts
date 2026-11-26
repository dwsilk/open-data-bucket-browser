import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clampPanelWidth,
  LISTING_MIN,
  PANEL_DEFAULT,
  PANEL_MIN,
  readPanelWidth,
  storePanelWidth,
} from './panelWidth';

describe('clampPanelWidth', () => {
  it('keeps a width between the panel minimum and what leaves the listing its minimum', () => {
    expect(clampPanelWidth(500, 1200)).toBe(500);
    expect(clampPanelWidth(100, 1200)).toBe(PANEL_MIN);
    expect(clampPanelWidth(5000, 1200)).toBe(1200 - LISTING_MIN);
  });

  it('keeps the panel minimum when there is no room for both', () => {
    expect(clampPanelWidth(900, 500)).toBe(PANEL_MIN);
  });
});

describe('stored panel width', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('round-trips a width and ignores a stored value that makes no sense', () => {
    expect(readPanelWidth()).toBe(PANEL_DEFAULT);
    storePanelWidth(600);
    expect(readPanelWidth()).toBe(600);
    localStorage.setItem('detailsPanelWidth', 'wide');
    expect(readPanelWidth()).toBe(PANEL_DEFAULT);
  });

  it('falls back to the default when storage throws', () => {
    const blocked = () => {
      throw new Error('blocked');
    };
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked });
    expect(() => storePanelWidth(600)).not.toThrow();
    expect(readPanelWidth()).toBe(PANEL_DEFAULT);
  });
});
