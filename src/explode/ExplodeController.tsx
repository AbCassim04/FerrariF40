import { useEffect, useRef } from 'react';
import type { Box3 } from 'three';
import type { Vec3 } from '../config/dims';
import { useAppStore } from '../state/store';
import { buildExplodeTimeline, explodedBounds, partsBounds } from './buildTimeline';

const tuple = (b: Box3): [Vec3, Vec3] => [b.min.toArray(), b.max.toArray()];

/**
 * Drives the explode timeline from the store, and asks the camera to frame the full
 * exploded car on Explode (and to return on Assemble). Must be mounted inside the
 * Canvas after <PartsRenderer>, so every part has registered before the timeline is built.
 */
export function ExplodeController() {
  const exploded = useAppStore((s) => s.exploded);
  const tlRef = useRef<ReturnType<typeof buildExplodeTimeline> | null>(null);
  const first = useRef(true);

  useEffect(() => {
    const tl = buildExplodeTimeline();
    const { exploded: initial, fitOnLoad, requestCameraFit } = useAppStore.getState();
    tl.progress(initial ? 1 : 0);
    tlRef.current = tl;
    if (fitOnLoad) requestCameraFit(tuple(partsBounds()), false);
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
    // The initial state (possibly from the URL) keeps whatever view was requested.
    if (first.current) {
      first.current = false;
      return;
    }
    const { requestCameraFit } = useAppStore.getState();
    requestCameraFit(exploded ? tuple(explodedBounds(tl)) : null, true);
  }, [exploded]);

  return null;
}
