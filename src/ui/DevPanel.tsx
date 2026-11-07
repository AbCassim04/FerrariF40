import { useEffect } from 'react';
import { useAppStore } from '../state/store';

/** Dev-only toggles for review aids. Keyboard: L = part ids, G = guides. */
export function DevPanel() {
  const showLabels = useAppStore((s) => s.showLabels);
  const showGuides = useAppStore((s) => s.showGuides);
  const toggleLabels = useAppStore((s) => s.toggleLabels);
  const toggleGuides = useAppStore((s) => s.toggleGuides);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
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
