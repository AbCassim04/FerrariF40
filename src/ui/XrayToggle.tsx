import { useAppStore } from '../state/store';

/** Body panels go see-through in place, showing the packaging underneath. */
export function XrayToggle() {
  const xray = useAppStore((s) => s.xray);
  const toggle = useAppStore((s) => s.toggleXray);
  return (
    <button type="button" className="xray-btn" aria-pressed={xray} onClick={toggle}>
      X-ray
    </button>
  );
}
