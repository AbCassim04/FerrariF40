import { useEffect, useRef } from 'react';
import { PARTS_BY_ID } from '../parts/registry';
import { useAppStore } from '../state/store';

/** Part name beside the mouse pointer while it is over a part (mouse only; touch has no hover). */
export function HoverTooltip() {
  const hoveredId = useAppStore((s) => s.hoveredId);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && ref.current) ref.current.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 18}px)`;
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  useEffect(() => {
    document.body.style.cursor = hoveredId ? 'pointer' : '';
  }, [hoveredId]);

  const part = hoveredId ? PARTS_BY_ID.get(hoveredId) : undefined;
  return (
    <div ref={ref} className="tooltip" role="tooltip" hidden={!part}>
      {part?.name}
    </div>
  );
}
