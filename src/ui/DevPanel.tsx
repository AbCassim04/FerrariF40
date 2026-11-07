import { useEffect } from 'react';
import { useAppStore } from '../state/store';

const NON_TEXT_INPUTS = new Set(['checkbox', 'radio', 'button', 'range', 'color']);

/** True for elements where a typed letter is text, not a shortcut. */
function isTextEntry(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target instanceof HTMLTextAreaElement) return true;
  return target instanceof HTMLInputElement && !NON_TEXT_INPUTS.has(target.type);
}

/** Dev-only toggles for review aids. Keyboard: L = part ids, G = guides. */
export function DevPanel() {
  const showLabels = useAppStore((s) => s.showLabels);
  const showGuides = useAppStore((s) => s.showGuides);
  const toggleLabels = useAppStore((s) => s.toggleLabels);
  const toggleGuides = useAppStore((s) => s.toggleGuides);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || isTextEntry(e.target)) return;
      if (e.key === 'l' || e.key === 'L') toggleLabels();
      if (e.key === 'g' || e.key === 'G') toggleGuides();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleLabels, toggleGuides]);

  return (
    <div className="dev-panel">
      <div className="dev-panel__title">Dev</div>
      <label>
        <input type="checkbox" checked={showLabels} onChange={toggleLabels} /> Part ids <kbd>L</kbd>
      </label>
      <label>
        <input type="checkbox" checked={showGuides} onChange={toggleGuides} /> Guides <kbd>G</kbd>
      </label>
    </div>
  );
}
