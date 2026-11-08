import { useEffect, useRef } from 'react';
import type { Box3 } from 'three';
import type { Vec3 } from '../config/dims';
import { useAppStore } from '../state/store';
import { buildExplodeTimeline, explodedBounds, explodeTimeline, partsBounds } from './buildTimeline';

const tuple = (b: Box3): [Vec3, Vec3] => [b.min.toArray(), b.max.toArray()];

/**
 * Drives the explode timeline from the store, and asks the camera to frame the full
 * exploded car on Explode (and to return on Assemble). Must be mounted inside the
 * Canvas after <PartsRenderer>, so every part has registered before the timeline is built.
 */
export function ExplodeController() {
  const exploded = useAppStore((s) => s.exploded);
  const tlRef = useRef<ReturnType<typeof buildExplodeTimeline> | null>(null);
  /** Last state the timeline was driven to; the initial state (from the URL) needs no play or fit. */
  const shown = useRef(exploded);

  useEffect(() => {
    const tl = buildExplodeTimeline();
    const { exploded: initial, fitOnLoad, requestCameraFit } = useAppStore.getState();
    tl.progress(initial ? 1 : 0);
    tlRef.current = tl;
    explodeTimeline.current = tl;
    if (fitOnLoad) requestCameraFit(tuple(partsBounds()), false);
    return () => {
      tl.kill();
      tlRef.current = null;
      explodeTimeline.current = null;
    };
  }, []);

  useEffect(() => {
    const tl = tlRef.current;
    // Only real changes: StrictMode re-runs this effect on mount, which must not count as a click.
    if (!tl || shown.current === exploded) return;
    shown.current = exploded;
    if (exploded) tl.play();
    else tl.reverse();
    const { requestCameraFit } = useAppStore.getState();
    requestCameraFit(exploded ? tuple(explodedBounds(tl)) : null, true);
  }, [exploded]);

  return null;
}
