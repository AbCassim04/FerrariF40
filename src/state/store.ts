import { create } from 'zustand';
import type { Vec3 } from '../config/dims';
import type { ViewName } from '../config/scene';

const DEV = import.meta.env.DEV;

/** Dev only: initial review state from the URL, e.g. ?view=top&segments=1&solo=door-l&explode=1 */
const params = DEV ? new URLSearchParams(window.location.search) : new URLSearchParams();
const flag = (k: string) => params.get(k) === '1';

interface AppState {
  /** Target state of the explode animation (the timeline may still be travelling). */
  exploded: boolean;
  selectedId: string | null;
  hoveredId: string | null;
  xray: boolean;
  /** Last camera preset requested; `seq` makes repeat requests distinct. */
  view: { name: ViewName; seq: number } | null;
  /**
   * Camera framing request: fit `box` (keeping the current viewing angle), or with
   * `box: null` return to the view saved before the last fit that had `remember`.
   */
  cameraFit: { box: [Vec3, Vec3] | null; remember: boolean; seq: number } | null;

  // Dev-only review aids
  showLabels: boolean;
  showGuides: boolean;
  /** Colour each body-model part distinctly. */
  showSegments: boolean;
  /** Highlight procedural parts that intersect the body model (assembled pose). */
  showClashes: boolean;
  /** Render only this part (and its children). */
  solo: string | null;
  /** Result of the last clash check, for the dev panel. */
  clashReport: string | null;
  /** Fit the camera to the scene once it has loaded (URL ?fit=1). */
  fitOnLoad: boolean;

  toggleExploded: () => void;
  select: (id: string | null) => void;
  hover: (id: string | null) => void;
  toggleXray: () => void;
  requestView: (name: ViewName) => void;
  requestCameraFit: (box: [Vec3, Vec3] | null, remember: boolean) => void;
  setClashReport: (report: string | null) => void;
  toggleLabels: () => void;
  toggleGuides: () => void;
  toggleSegments: () => void;
  toggleClashes: () => void;
  setSolo: (id: string | null) => void;
}

export const useAppStore = create<AppState>()((set) => ({
  exploded: flag('explode'),
  selectedId: null,
  hoveredId: null,
  xray: false,
  view: params.get('view') ? { name: params.get('view') as ViewName, seq: 0 } : null,
  cameraFit: null,

  showLabels: flag('labels'),
  showGuides: params.get('guides') !== '0',
  showSegments: flag('segments'),
  showClashes: flag('clashes'),
  solo: params.get('solo'),
  clashReport: null,
  fitOnLoad: flag('fit'),

  toggleExploded: () => set((s) => ({ exploded: !s.exploded })),
  select: (id) => set({ selectedId: id }),
  hover: (id) => set({ hoveredId: id }),
  toggleXray: () => set((s) => ({ xray: !s.xray })),
  requestView: (name) => set((s) => ({ view: { name, seq: (s.view?.seq ?? 0) + 1 } })),
  requestCameraFit: (box, remember) => set((s) => ({ cameraFit: { box, remember, seq: (s.cameraFit?.seq ?? 0) + 1 } })),
  setClashReport: (clashReport) => set({ clashReport }),
  toggleLabels: () => set((s) => ({ showLabels: !s.showLabels })),
  toggleGuides: () => set((s) => ({ showGuides: !s.showGuides })),
  toggleSegments: () => set((s) => ({ showSegments: !s.showSegments })),
  toggleClashes: () => set((s) => ({ showClashes: !s.showClashes })),
  setSolo: (id) => set({ solo: id }),
}));
