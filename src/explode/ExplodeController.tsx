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
  const solo = useAppStore((s) => (import.meta.env.DEV ? `${s.solo ?? ''}|${s.soloGroup ?? ''}` : ''));
  const tlRef = useRef<ReturnType<typeof buildExplodeTimeline> | null>(null);
  /** Last state the timeline was driven to; the initial state (from the URL) needs no play or fit. */
  const shown = useRef(exploded);
  const soloShown = useRef(solo);

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
    // Already there (the dev API posed the timeline directly): nothing to play or frame.
    if (tl.progress() === (exploded ? 1 : 0) && !tl.isActive()) return;
    if (exploded) tl.play();
    else tl.reverse();
    const { requestCameraFit } = useAppStore.getState();
    requestCameraFit(exploded ? tuples(explodedCorners(tl)) : null, 'explode');
  }, [exploded]);

  // Dev solo: frame what is left visible (in the pose the timeline is heading for), so a
  // soloed group fills the view instead of sitting small where the whole car was framed.
  useEffect(() => {
    const tl = tlRef.current;
    if (!tl || soloShown.current === solo) return;
    soloShown.current = solo;
    const corners = exploded ? explodedCorners(tl) : partCorners();
    if (corners.length) useAppStore.getState().requestCameraFit(tuples(corners), null);
  }, [solo]);

  return null;
}
