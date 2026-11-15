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

/** 9B: gas flow inside the pipes (turns X-ray on if it's off). */
export function FlowToggle() {
  const flow = useAppStore((s) => s.flow);
  const toggle = useAppStore((s) => s.toggleFlow);
  return (
    <button type="button" className="xray-btn flow-btn" aria-pressed={flow} onClick={toggle} title="Gas flow: exhaust pulses and intake air, in X-ray">
      Flow
    </button>
  );
}
