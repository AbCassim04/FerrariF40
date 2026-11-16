import { useState } from 'react';
import type { ViewName } from '../config/scene';
import { useAppStore } from '../state/store';

const CHIPS: [ViewName, string][] = [
  ['front34', 'Front ¾'],
  ['side', 'Side'],
  ['rear34', 'Rear ¾'],
  ['top', 'Top'],
  ['engine', 'Engine'],
  ['cockpit', 'Cockpit'],
];

/**
 * Top-left corner, every layout: reset the view, and quick views as chips (they frame the
 * exploded car too while it is exploded). "Chassis" also hides the body (the rolling chassis).
 */
export function CameraButtons() {
  const [open, setOpen] = useState(false);
  const requestView = useAppStore((s) => s.requestView);
  const chassis = useAppStore((s) => s.chassis);
  const setChassis = useAppStore((s) => s.setChassis);
  return (
    <nav className="cam" aria-label="Camera">
      <div className="cam__buttons">
        <button type="button" className="icon-btn" aria-label="Reset the view" title="Reset the view" onClick={() => requestView('front34')}>
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M4.5 8.5a6 6 0 1 1-.2 4" />
            <path d="M4 4v4.6h4.6" />
          </svg>
        </button>
        <button type="button" className="icon-btn" aria-label="Views" title="Views" aria-expanded={open} aria-controls="view-chips" onClick={() => setOpen(!open)}>
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M2.5 6.5 10 3l7.5 3.5L10 10z" />
            <path d="M2.5 6.5v7L10 17V10M17.5 6.5v7L10 17" />
          </svg>
        </button>
      </div>
      {open && (
        <div className="cam__chips" id="view-chips">
          {CHIPS.map(([name, label]) => (
            <button key={name} type="button" className="chip" onClick={() => requestView(name)}>
              {label}
            </button>
          ))}
          {/* Phase 5: a mode as well as a view: the body comes off until it is pressed again. */}
          <button type="button" className="chip" aria-pressed={chassis} onClick={() => setChassis(!chassis)}>
            Chassis
          </button>
        </div>
      )}
    </nav>
  );
}
