import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import { explodeTimeline } from '../explode/buildTimeline';
import { useAppStore } from '../state/store';

/** Frames to keep shadows live after a change settles (GSAP and R3F tick separately). */
const TAIL_FRAMES = 4;

/** Dev: `?perfPeak=1` keeps shadows live every frame, to measure the cost while animating. */
const ALWAYS_LIVE = import.meta.env.DEV && new URLSearchParams(location.search).has('perfPeak');

/**
 * Contact-shadow refreshes: Ground re-renders on each tick, which resets ContactShadows'
 * frame count so it renders exactly one more frame.
 */
export const useContactShadowTick = create<{ tick: number }>(() => ({ tick: 0 }));

/** Dev readout: whether a shadow pass ran this frame. */
export const shadowState = { live: false };

type State = ReturnType<typeof useAppStore.getState>;
/** Store keys that can't change the shadows; any other change re-renders them (an inspect ghosts the other parts, which then cast none). */
const IGNORED = new Set<keyof State>(['hoveredId', 'cameraFit', 'view']);
const INERT = (Object.keys(useAppStore.getState()) as (keyof State)[]).filter((k) => !IGNORED.has(k));

/**
 * Shadows only re-render while something moves: the explode timeline is running, or app
 * state (solo, visibility, explode) just changed. Even then the two passes alternate
 * (shadow map on even frames, contact shadows on odd), so a moving frame costs one extra
 * scene pass, not two. A still scene keeps its last shadow map and contact texture.
 */
export function ShadowScheduler() {
  const gl = useThree((s) => s.gl);
  const pending = useRef(TAIL_FRAMES * 3); // first frames after everything has mounted
  const frame = useRef(0);

  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    const unsubscribe = useAppStore.subscribe((now, prev) => {
      // Pointer and camera state (hover, framing) don't change what casts shadows.
      if (INERT.every((k) => now[k] === prev[k])) return;
      pending.current = Math.max(pending.current, TAIL_FRAMES);
    });
    return () => {
      unsubscribe();
      gl.shadowMap.autoUpdate = true;
    };
  }, [gl]);

  useFrame(() => {
    if (ALWAYS_LIVE || explodeTimeline.current?.isActive()) pending.current = Math.max(pending.current, TAIL_FRAMES);
    shadowState.live = pending.current > 0;
    if (!shadowState.live) return;
    pending.current--;
    if (frame.current++ % 2 === 0) gl.shadowMap.needsUpdate = true;
    else useContactShadowTick.setState((s) => ({ tick: s.tick + 1 }));
  });

  return null;
}
