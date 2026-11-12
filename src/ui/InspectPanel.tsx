import { useEffect } from 'react';
import { PARTS_BY_ID } from '../parts/registry';
import type { PartGroup } from '../parts/types';
import { useAppStore } from '../state/store';

const GROUP_LABEL: Record<PartGroup, string> = {
  body: 'Body',
  chassis: 'Chassis',
  suspension: 'Brakes & suspension',
  wheels: 'Wheels',
  engine: 'Engine',
  transmission: 'Transmission',
  cooling: 'Cooling',
  exhaust: 'Exhaust',
};

/**
 * Side panel (bottom sheet on narrow screens) for the selected part: name, description
 * and specs from the registry. Esc, the close button or a click on empty space closes it.
 */
export function InspectPanel() {
  const selectedId = useAppStore((s) => s.selectedId);
  const select = useAppStore((s) => s.select);
  const part = selectedId ? PARTS_BY_ID.get(selectedId) : undefined;

  useEffect(() => {
    if (!part) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && select(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [part, select]);

  if (!part) return null;
  const parent = part.parent ? PARTS_BY_ID.get(part.parent) : undefined;
  const specs = Object.entries(part.specs);
  return (
    <aside className="inspect" aria-labelledby="inspect-title" key={part.id}>
      <header className="inspect__head">
        <p className="inspect__group">
          {GROUP_LABEL[part.group]}
          {parent && <span> · part of the {parent.name.toLowerCase()}</span>}
        </p>
        <h2 id="inspect-title" className="inspect__title">
          {part.name}
        </h2>
        <button type="button" className="inspect__close" aria-label="Close" onClick={() => select(null)}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3 3l10 10M13 3L3 13" />
          </svg>
        </button>
      </header>
      <div className="inspect__body">
        <p className="inspect__desc">{part.description}</p>
        {specs.length > 0 && (
          <dl className="inspect__specs">
            {specs.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </aside>
  );
}
