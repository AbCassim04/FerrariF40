import { useAppStore } from '../state/store';

export function ExplodeButton() {
  const exploded = useAppStore((s) => s.exploded);
  const toggle = useAppStore((s) => s.toggleExploded);
  return (
    <button type="button" className="explode-btn" onClick={toggle} aria-pressed={exploded}>
      {exploded ? 'Assemble' : 'Explode'}
    </button>
  );
}
