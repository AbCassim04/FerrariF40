import { useEffect } from 'react';
import { SCENE, type ViewName } from '../config/scene';
import { PARTS, PARTS_BY_ID } from '../parts/registry';
import type { PartGroup } from '../parts/types';
import { useAppStore } from '../state/store';

const NON_TEXT_INPUTS = new Set(['checkbox', 'radio', 'button', 'range', 'color']);

/** True for elements where a typed letter is text, not a shortcut. */
function isTextEntry(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target instanceof HTMLTextAreaElement) return true;
  return target instanceof HTMLInputElement && !NON_TEXT_INPUTS.has(target.type);
}

const VIEW_NAMES = Object.keys(SCENE.views) as ViewName[];
const GROUPS = [...new Set(PARTS.map((p) => p.group))] as PartGroup[];

/**
 * Dev-only review aids. Keys: L part ids, G guides, K segment colours, C clashes,
 * S solo the selected part's group (or the group picked here), B engine-bay ghost.
 * Most of this state can also be set from the URL (see state/store.ts).
 */
export function DevPanel() {
  const s = useAppStore();

  useEffect(() => {
    const soloGroup = () => {
      const { selectedId, toggleSoloGroup } = useAppStore.getState();
      toggleSoloGroup(selectedId ? PARTS_BY_ID.get(selectedId)?.group : undefined);
    };
    const keys: Record<string, () => void> = {
      l: s.toggleLabels,
      g: s.toggleGuides,
      k: s.toggleSegments,
      c: s.toggleClashes,
      s: soloGroup,
      b: s.toggleGhost,
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || isTextEntry(e.target)) return;
      keys[e.key.toLowerCase()]?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [s.toggleLabels, s.toggleGuides, s.toggleSegments, s.toggleClashes, s.toggleGhost]);

  return (
    <div className="dev-panel">
      <div className="dev-panel__title">Dev</div>
      <Toggle label="Part ids" hotkey="L" checked={s.showLabels} onChange={s.toggleLabels} />
      <Toggle label="Guides" hotkey="G" checked={s.showGuides} onChange={s.toggleGuides} />
      <Toggle label="Segments" hotkey="K" checked={s.showSegments} onChange={s.toggleSegments} />
      <Toggle label="Clashes" hotkey="C" checked={s.showClashes} onChange={s.toggleClashes} />
      <Toggle label="Bay ghost" hotkey="B" checked={s.showGhost} onChange={s.toggleGhost} />
      <Toggle label="Solo group" hotkey="S" checked={s.soloGroup !== null} onChange={() => s.toggleSoloGroup()} />
      <label>
        Group
        <select value={s.soloGroupPick} onChange={(e) => s.setSoloGroupPick(e.target.value as PartGroup)}>
          {GROUPS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </label>
      <label>
        Solo part
        <select value={s.solo ?? ''} onChange={(e) => s.setSolo(e.target.value || null)}>
          <option value="">all parts</option>
          {PARTS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.id}
            </option>
          ))}
        </select>
      </label>
      {s.clashReport && <pre className="dev-panel__report">{s.clashReport}</pre>}
      <div className="dev-panel__views">
        {VIEW_NAMES.map((v) => (
          <button key={v} type="button" onClick={() => s.requestView(v)}>
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}

function Toggle({ label, hotkey, checked, onChange }: { label: string; hotkey: string; checked: boolean; onChange: () => void }) {
  return (
    <label>
      <input type="checkbox" checked={checked} onChange={onChange} /> {label} <kbd>{hotkey}</kbd>
    </label>
  );
}
