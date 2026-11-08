import { create } from 'zustand';
import type { Vec3 } from '../config/dims';
import type { ViewName } from '../config/scene';
import type { PartGroup } from '../parts/types';

const DEV = import.meta.env.DEV;

/** Dev only: initial review state from the URL, e.g. ?view=top&segments=1&soloGroup=engine&explode=1 */
const params = DEV ? new URLSearchParams(window.location.search) : new URLSearchParams();
const flag = (k: string) => params.get(k) === '1';
const vec = (k: string) => {
  const v = params.get(k)?.split(',').map(Number);
  return v?.length === 3 && v.every(Number.isFinite) ? (v as unknown as Vec3) : null;
};

export type CameraSlot = 'explode' | 'inspect';

interface AppState {
  /** Target state of the explode animation (the timeline may still be travelling). */
  exploded: boolean;
  selectedId: string | null;
  hoveredId: string | null;
  xray: boolean;
  /** Last camera preset requested; `seq` makes repeat requests distinct. */
  view: { name: ViewName; seq: number } | null;
  /**
   * Camera framing request: fit `points` (keeping the current viewing angle), or with
   * `points: null` return to the view saved in `slot` before its first fit. Explode and
   * inspect keep separate saved views; `slot: null` fits without saving.
   */
  cameraFit: { points: Vec3[] | null; slot: CameraSlot | null; focus?: string; seq: number } | null;

  // Dev-only review aids
  showLabels: boolean;
  showGuides: boolean;
  /** Colour each body-model part distinctly. */
  showSegments: boolean;
  /** Highlight procedural parts that intersect the body model (assembled pose). */
  showClashes: boolean;
  /** Render only this part (and its children). */
  solo: string | null;
  /** Render only parts of this group (key S); `soloGroupPick` is the group S will solo. */
  soloGroup: PartGroup | null;
  soloGroupPick: PartGroup;
  /** Show the original car's engine-bay dressing as a faint ghost (placement guide). */
  showGhost: boolean;
  /** Result of the last clash check, for the dev panel. */
  clashReport: string | null;
  /** Fit the camera to the scene once it has loaded (URL ?fit=1). */
  fitOnLoad: boolean;
  /** Dev: start with the explode timeline paused at this time (s), for mid-explode shots. */
  timeAt: number | null;
  /** Initial camera from the URL (?cam=x,y,z&look=x,y,z), for review screenshots. */
  devCamera: { position: Vec3; target: Vec3 } | null;

  toggleExploded: () => void;
  select: (id: string | null) => void;
  hover: (id: string | null) => void;
  toggleXray: () => void;
  requestView: (name: ViewName) => void;
  /** `focus`: a part id; the camera then also looks for a direction that isn't blocked by other parts. */
  requestCameraFit: (points: Vec3[] | null, slot: CameraSlot | null, focus?: string) => void;
  setClashReport: (report: string | null) => void;
  toggleLabels: () => void;
  toggleGuides: () => void;
  toggleSegments: () => void;
  toggleClashes: () => void;
  setSolo: (id: string | null) => void;
  /** Solo the selected part's group (or the picked group); again to show everything. */
  toggleSoloGroup: (selectedGroup?: PartGroup) => void;
  setSoloGroupPick: (group: PartGroup) => void;
  toggleGhost: () => void;
}

export const useAppStore = create<AppState>()((set) => ({
  exploded: flag('explode'),
  selectedId: params.get('inspect'),
  hoveredId: null,
  xray: flag('xray'),
  view: params.get('view') ? { name: params.get('view') as ViewName, seq: 0 } : null,
  cameraFit: null,

  showLabels: flag('labels'),
  showGuides: params.get('guides') !== '0',
  showSegments: flag('segments'),
  showClashes: flag('clashes') || params.get('clashes') === 'all',
  solo: params.get('solo'),
  soloGroup: (params.get('soloGroup') as PartGroup | null) ?? null,
  soloGroupPick: (params.get('soloGroup') as PartGroup | null) ?? 'engine',
  showGhost: flag('ghost'),
  clashReport: null,
  fitOnLoad: flag('fit'),
  timeAt: params.has('t') ? Number(params.get('t')) : null,
  devCamera: vec('cam') && vec('look') ? { position: vec('cam')!, target: vec('look')! } : null,

  toggleExploded: () => set((s) => ({ exploded: !s.exploded })),
  select: (id) => set({ selectedId: id }),
  hover: (id) => set({ hoveredId: id }),
  toggleXray: () => set((s) => ({ xray: !s.xray })),
  requestView: (name) => set((s) => ({ view: { name, seq: (s.view?.seq ?? 0) + 1 } })),
  requestCameraFit: (points, slot, focus) => set((s) => ({ cameraFit: { points, slot, focus, seq: (s.cameraFit?.seq ?? 0) + 1 } })),
  setClashReport: (clashReport) => set({ clashReport }),
  toggleLabels: () => set((s) => ({ showLabels: !s.showLabels })),
  toggleGuides: () => set((s) => ({ showGuides: !s.showGuides })),
  toggleSegments: () => set((s) => ({ showSegments: !s.showSegments })),
  toggleClashes: () => set((s) => ({ showClashes: !s.showClashes })),
  setSolo: (id) => set({ solo: id }),
  toggleSoloGroup: (selectedGroup) =>
    set((s) => (s.soloGroup ? { soloGroup: null } : { soloGroup: selectedGroup ?? s.soloGroupPick })),
  setSoloGroupPick: (group) => set((s) => ({ soloGroupPick: group, soloGroup: s.soloGroup ? group : null })),
  toggleGhost: () => set((s) => ({ showGhost: !s.showGhost })),
}));

// Dev: lets review scripts read the interaction state.
if (DEV) {
  (window as unknown as { __state: () => unknown }).__state = () => {
    const { selectedId, hoveredId, xray, exploded } = useAppStore.getState();
    return { selectedId, hoveredId, xray, exploded };
  };
}
