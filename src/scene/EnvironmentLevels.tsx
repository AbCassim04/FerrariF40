import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import { MathUtils, type MeshStandardMaterial } from 'three';
import { SCENE } from '../config/scene';
import { explodeTimeline } from '../explode/buildTimeline';
import { STAGE_START } from '../explode/timing';
import { modelEnvLevels, sharedMaterials } from '../materials/materials';
import { useAppStore } from '../state/store';

/**
 * Per-material environment levels. three ignores `envMapIntensity` for materials lit by
 * `scene.environment` (they all get `scene.environmentIntensity`), so materials that need
 * their own level get the environment bound to `envMap` explicitly:
 *
 * - Our parts, for specular occlusion. Environment lighting ignores occlusion, so with
 *   the body on, the engine reflected the whole studio and read as grey mush through the
 *   glass. While the body encloses the bay, our parts keep only part of the environment;
 *   that ramps to full as the body comes off (stages 1–2), and is full whenever a solo
 *   hides the body.
 * - Model materials with a tuned level (the body glass), registered in `modelEnvLevels`.
 */
export function EnvironmentLevels() {
  const scene = useThree((s) => s.scene);
  const applied = useRef({ factor: -1, count: 0, env: null as unknown });

  useFrame(() => {
    const env = scene.environment;
    if (!env) return;
    const { solo, soloGroup } = useAppStore.getState();
    const t = explodeTimeline.current?.time() ?? 0;
    const factor = solo || soloGroup ? 1 : MathUtils.lerp(SCENE.bayOcclusion.enclosed, 1, MathUtils.smoothstep(t, STAGE_START[1], STAGE_START[3]));
    const ours = [...sharedMaterials()] as MeshStandardMaterial[];
    const last = applied.current;
    if (factor === last.factor && ours.length === last.count && env === last.env) return;
    const bind = (m: MeshStandardMaterial, level: number) => {
      if (m.envMap !== env) {
        m.envMap = env;
        m.needsUpdate = true;
      }
      m.envMapIntensity = level * scene.environmentIntensity;
    };
    for (const m of ours) {
      if (!m.isMeshStandardMaterial) continue;
      m.userData.envLevel ??= m.envMapIntensity;
      bind(m, m.userData.envLevel * factor);
    }
    for (const [m, level] of modelEnvLevels) bind(m as MeshStandardMaterial, level);
    applied.current = { factor, count: ours.length, env };
  });

  return null;
}
