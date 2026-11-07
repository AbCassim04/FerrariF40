import { useAppStore } from '../state/store';

export function ExplodeButton() {
  const exploded = useAppStore((s) => s.exploded);
  const toggle = useAppStore((s) => s.toggleExploded);
  return (
    // The label names the action, so no aria-pressed (it would contradict the label).
    <button type="button" className="explode-btn" onClick={toggle}>
      {exploded ? 'Assemble' : 'Explode'}
    </button>
  );
}
