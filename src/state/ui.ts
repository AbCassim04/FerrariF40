import { useSyncExternalStore } from 'react';
import { create } from 'zustand';

/**
 * Screen layouts (phone-first). The same media queries drive styles.css.
 * - `landscape`: a phone on its side (short screen): the driving layout, hold-buttons at the thumbs.
 * - `portrait`: a narrow screen: one compact bottom bar, a bottom sheet for the rest.
 * - `desktop`: everything else: one slim bar along the bottom.
 */
export type Layout = 'desktop' | 'portrait' | 'landscape';

export const LAYOUT_QUERIES = {
  landscape: '(orientation: landscape) and (max-height: 500px)',
  portrait: '(max-width: 719.98px)',
} as const;

const mql = (q: string) => (typeof matchMedia === 'undefined' ? null : matchMedia(q));
const queries = [mql(LAYOUT_QUERIES.landscape), mql(LAYOUT_QUERIES.portrait)];

function currentLayout(): Layout {
  if (queries[0]?.matches) return 'landscape';
  if (queries[1]?.matches) return 'portrait';
  return 'desktop';
}

function subscribe(onChange: () => void) {
  for (const q of queries) q?.addEventListener('change', onChange);
  return () => queries.forEach((q) => q?.removeEventListener('change', onChange));
}

export const useLayout = () => useSyncExternalStore(subscribe, currentLayout);

/** A touch-only device (no fine pointer): no keyboard hints, touch-sized controls, phone quality tier. */
export const touchOnly = typeof matchMedia !== 'undefined' && matchMedia('(hover: none) and (pointer: coarse)').matches;

/** A phone-sized touch device (the quality tier and Real mode use it). */
export const isPhone = touchOnly && typeof screen !== 'undefined' && Math.min(screen.width, screen.height) < 600;

interface UiState {
  /** The "more" panel (bottom sheet on phones, a popover above the bar on desktop). */
  moreOpen: boolean;
  /** Engine controls folded down to just Start / Stop. */
  compact: boolean;
  setMore: (open: boolean) => void;
  toggleMore: () => void;
  setCompact: (compact: boolean) => void;
}

export const useUiStore = create<UiState>()((set) => ({
  moreOpen: false,
  compact: false,
  setMore: (moreOpen) => set({ moreOpen }),
  toggleMore: () => set((s) => ({ moreOpen: !s.moreOpen })),
  setCompact: (compact) => set({ compact, moreOpen: false }),
}));
