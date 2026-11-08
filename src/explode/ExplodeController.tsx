import { useEffect, useRef } from 'react';
import type { Vector3 } from 'three';
import type { Vec3 } from '../config/dims';
import { useAppStore } from '../state/store';
import { buildExplodeTimeline, explodedCorners, explodeTimeline, partCorners } from './buildTimeline';

const tuples = (points: Vector3[]) => points.map((p) => p.toArray() as Vec3);

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
    const { exploded: initial, fitOnLoad, timeAt, requestCameraFit } = useAppStore.getState();
    tl.progress(initial ? 1 : 0);
    if (timeAt !== null) tl.time(timeAt);
    tlRef.current = tl;
    explodeTimeline.current = tl;
    if (fitOnLoad) requestCameraFit(tuples(partCorners()), null);
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
    requestCameraFit(exploded ? tuples(explodedCorners(tl)) : null, 'explode');
  }, [exploded]);

  return null;
}
