import { useEffect } from 'react';
import { SCENE, type ViewName } from '../config/scene';
import { PARTS } from '../parts/registry';
import { useAppStore } from '../state/store';

const NON_TEXT_INPUTS = new Set(['checkbox', 'radio', 'button', 'range', 'color']);

/** True for elements where a typed letter is text, not a shortcut. */
function isTextEntry(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target instanceof HTMLTextAreaElement) return true;
  return target instanceof HTMLInputElement && !NON_TEXT_INPUTS.has(target.type);
}

const VIEW_NAMES = Object.keys(SCENE.views) as ViewName[];

/**
 * Dev-only review aids. Keys: L part ids, G guides, S segments, C clashes.
 * Most of this state can also be set from the URL (see state/store.ts).
 */
export function DevPanel() {
  const s = useAppStore();

  useEffect(() => {
    const keys: Record<string, () => void> = {
      l: s.toggleLabels,
      g: s.toggleGuides,
      s: s.toggleSegments,
      c: s.toggleClashes,
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || isTextEntry(e.target)) return;
      keys[e.key.toLowerCase()]?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [s.toggleLabels, s.toggleGuides, s.toggleSegments, s.toggleClashes]);

  return (
    <div className="dev-panel">
      <div className="dev-panel__title">Dev</div>
      <Toggle label="Part ids" hotkey="L" checked={s.showLabels} onChange={s.toggleLabels} />
      <Toggle label="Guides" hotkey="G" checked={s.showGuides} onChange={s.toggleGuides} />
      <Toggle label="Segments" hotkey="S" checked={s.showSegments} onChange={s.toggleSegments} />
      <Toggle label="Clashes" hotkey="C" checked={s.showClashes} onChange={s.toggleClashes} />
      <label>
        Solo
        <select value={s.solo ?? ''} onChange={(e) => s.setSolo(e.target.value || null)}>
          <option value="">all parts</option>
          {PARTS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.id}
            </option>
          ))}
        </select>
      </label>
      {s.clashReport && <pre className="dev-panel__report">clashes: {s.clashReport}</pre>}
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
