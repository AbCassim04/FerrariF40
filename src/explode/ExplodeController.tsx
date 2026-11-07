import { useEffect, useRef } from 'react';
import { useAppStore } from '../state/store';
import { buildExplodeTimeline } from './buildTimeline';

/**
 * Drives the explode timeline from the store. Must be mounted inside the Canvas after
 * <PartsRenderer>, so every part has registered its objects before the timeline is built.
 */
export function ExplodeController() {
  const exploded = useAppStore((s) => s.exploded);
  const tlRef = useRef<ReturnType<typeof buildExplodeTimeline> | null>(null);

  useEffect(() => {
    const tl = buildExplodeTimeline();
    tl.progress(useAppStore.getState().exploded ? 1 : 0);
    tlRef.current = tl;
    return () => {
      tl.kill();
      tlRef.current = null;
    };
  }, []);

  useEffect(() => {
    const tl = tlRef.current;
    if (!tl) return;
    if (exploded) tl.play();
    else tl.reverse();
  }, [exploded]);

  return null;
}
