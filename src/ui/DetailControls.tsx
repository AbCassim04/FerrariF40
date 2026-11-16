import { useEffect } from 'react';
import { useAppStore } from '../state/store';

/** 9C: lights and doors switches for "more", and key L for the lights (any time, engine or not); hazards (phase 9 fix-up). */

function Switch({ on, set, label, disabled }: { on: boolean; set: (v: boolean) => void; label: [string, string]; disabled?: boolean }) {
  return (
    <button type="button" className="switch" role="switch" aria-checked={on} disabled={disabled} onClick={() => set(!on)}>
      <span className="switch__knob" aria-hidden="true" />
      <span className="switch__text">{on ? label[0] : label[1]}</span>
    </button>
  );
}

export function LightsSwitch() {
  const on = useAppStore((s) => s.lights);
  const toggle = useAppStore((s) => s.toggleLights);
  return <Switch on={on} set={toggle} label={['On', 'Off']} />;
}

/** Phase 9 fix-up: hazard lights (every indicator, front, sides and rear, flashing). */
export function HazardsSwitch() {
  const on = useAppStore((s) => s.hazards);
  const toggle = useAppStore((s) => s.toggleHazards);
  return <Switch on={on} set={toggle} label={['On', 'Off']} />;
}

/** Doors open only assembled: exploded (or exploding), they keep their explode pose. */
export function DoorsSwitch() {
  const on = useAppStore((s) => s.doors);
  const exploded = useAppStore((s) => s.exploded);
  const toggle = useAppStore((s) => s.toggleDoors);
  return <Switch on={on && !exploded} set={toggle} label={['Open', 'Closed']} disabled={exploded} />;
}

const isTextEntry = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) && !(t instanceof HTMLInputElement && t.type === 'range');

export function DetailKeys() {
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || isTextEntry(e.target)) return;
      if (e.key === 'l' || e.key === 'L') useAppStore.getState().toggleLights();
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, []);
  return null;
}
