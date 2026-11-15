import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { SCENE } from '../config/scene';
import { tierOf, useQuality } from '../state/quality';
import { useEngineStore } from '../state/engine';

const { watch } = SCENE.quality;

/**
 * Applies the quality tier's pixel ratio, and watches the frame time: a tier down when the
 * median frame stays slow for a few windows in a row. Never back up within a session (a tier
 * that flickers up and down would be worse than either). Shadows and AO read the tier in
 * Lighting, Ground and PostEffects.
 */
export function QualityController() {
  const setDpr = useThree((s) => s.setDpr);
  const tier = useQuality((s) => s.tier);
  const state = useRef({ samples: [] as number[], elapsed: 0, warm: 0, strikes: 0 });

  useEffect(() => {
    setDpr(Math.min(window.devicePixelRatio || 1, tierOf(tier).dpr));
    // Settle again after a change before judging the new tier.
    Object.assign(state.current, { samples: [], elapsed: 0, warm: 0, strikes: 0 });
    if (import.meta.env.DEV) Object.assign(window, { __quality: () => ({ ...useQuality.getState(), name: tierOf(useQuality.getState().tier).name, dpr: Math.min(window.devicePixelRatio || 1, tierOf(useQuality.getState().tier).dpr) }) });
  }, [tier, setDpr]);

  useFrame((_, delta) => {
    const q = useQuality.getState();
    const s = state.current;
    if (q.pinned || q.tier >= SCENE.quality.tiers.length - 1 || document.hidden) return;
    // A returning tab or a hitch is not the steady frame rate.
    if (delta > 0.5) return;
    s.warm += delta;
    if (s.warm < watch.warmup) return;
    s.samples.push(delta);
    s.elapsed += delta;
    if (s.elapsed < watch.window) return;
    const sorted = s.samples.sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] * 1000;
    s.samples = [];
    s.elapsed = 0;
    s.strikes = median > watch.slowMs ? s.strikes + 1 : 0;
    if (s.strikes >= watch.strikes) {
      q.drop(`median frame ${median.toFixed(1)} ms`);
      // Real mode needs the top tier: fall back to Slow.
      if (useEngineStore.getState().timeScale === 'real') useEngineStore.getState().setTimeScale('slow');
    }
  });

  return null;
}
