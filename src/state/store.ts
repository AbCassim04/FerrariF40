import { create } from 'zustand';

interface AppState {
  /** Target state of the explode animation (the timeline may still be travelling). */
  exploded: boolean;
  selectedId: string | null;
  hoveredId: string | null;
  xray: boolean;
  /** Dev only: floating part-id labels. */
  showLabels: boolean;
  /** Dev only: axes, axle lines and centreline. */
  showGuides: boolean;

  toggleExploded: () => void;
  select: (id: string | null) => void;
  hover: (id: string | null) => void;
  toggleXray: () => void;
  toggleLabels: () => void;
  toggleGuides: () => void;
}

export const useAppStore = create<AppState>()((set) => ({
  exploded: false,
  selectedId: null,
  hoveredId: null,
  xray: false,
  showLabels: false,
  showGuides: true,

  toggleExploded: () => set((s) => ({ exploded: !s.exploded })),
  select: (id) => set({ selectedId: id }),
  hover: (id) => set({ hoveredId: id }),
  toggleXray: () => set((s) => ({ xray: !s.xray })),
  toggleLabels: () => set((s) => ({ showLabels: !s.showLabels })),
  toggleGuides: () => set((s) => ({ showGuides: !s.showGuides })),
}));
