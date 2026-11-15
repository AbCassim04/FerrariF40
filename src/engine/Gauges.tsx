import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { BoxGeometry, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import { GAUGES, type Needle } from '../config/details';
import { partObjects } from '../scene/partObjects';
import { sim } from '../state/engine';

/**
 * 9C cockpit needles on the donor's dial faces (body/donor.ts puts the faces in the cockpit):
 * tach, speedo and boost follow the sim; the other gauges sit at a typical reading (est). One
 * instanced mesh on the cockpit part (one draw call), so they ride with it in the explode.
 */

const DEG = Math.PI / 180;
const LIVE: { key: 'tach' | 'speedo' | 'boost'; n: Needle; value: () => number }[] = [
  { key: 'tach', n: GAUGES.tach, value: () => sim.rpm },
  { key: 'speedo', n: GAUGES.speedo, value: () => Math.abs(sim.speed) * 3.6 },
  { key: 'boost', n: GAUGES.boost, value: () => Math.max(0, sim.boost) },
];
const COUNT = LIVE.length + GAUGES.fixed.length;

const angleOf = (n: Needle, v: number) => {
  const t = Math.min(1, Math.max(0, (v - n.range[0]) / (n.range[1] - n.range[0])));
  return n.sweep[0] + (n.sweep[1] - n.sweep[0]) * t;
};

const m = new Matrix4();
const q = new Quaternion();
const z = new Vector3(0, 0, 1);
const p = new Vector3();
const s = new Vector3();

/** A needle along +y from its pivot (a short tail behind it), turned clockwise as the driver sees it (about +z, the driver looks along +z). */
function place(mesh: InstancedMesh, i: number, at: readonly number[], length: number, width: number, deg: number) {
  q.setFromAxisAngle(z, deg * DEG);
  m.compose(p.set(at[0], at[1], at[2]), q, s.set(width, length, 1));
  mesh.setMatrixAt(i, m);
}

export function Gauges() {
  const mesh = useMemo(() => {
    // Unit needle: 1 wide, 1 long from 0.15 behind the pivot, 0.6 mm thick.
    const g = new BoxGeometry(1, 1.15, 0.0006).translate(0, 0.5 - 0.15, 0);
    const mat = new MeshStandardMaterial({ color: GAUGES.colour, roughness: 0.55, metalness: 0, emissive: GAUGES.colour, emissiveIntensity: 0.15 });
    const mesh = new InstancedMesh(g, mat, COUNT);
    mesh.name = 'needles';
    mesh.frustumCulled = false;
    mesh.castShadow = mesh.receiveShadow = false;
    GAUGES.fixed.forEach((f, k) => place(mesh, LIVE.length + k, f.at, f.length, f.width, f.angle));
    LIVE.forEach(({ n }, k) => place(mesh, k, n.at, n.length, n.width, n.sweep[0]));
    return mesh;
  }, []);
  const shown = useMemo(() => ({ tach: 0, speedo: 0, boost: 0 }), []);
  useEffect(
    () => () => {
      mesh.removeFromParent();
      mesh.geometry.dispose();
      (mesh.material as MeshStandardMaterial).dispose();
    },
    [mesh],
  );
  useFrame((_, dt) => {
    const o = partObjects.get('interior');
    if (!o) return;
    if (mesh.parent !== o.content) o.content.add(mesh);
    const k = 1 - Math.exp(-Math.min(dt, 0.1) / GAUGES.lagS);
    let moved = false;
    LIVE.forEach(({ key, n, value }, i) => {
      const target = sim.phase === 'off' ? n.range[0] : value();
      const next = shown[key] + (target - shown[key]) * k;
      if (Math.abs(next - shown[key]) < 1e-4 * (n.range[1] - n.range[0])) return;
      shown[key] = next;
      place(mesh, i, n.at, n.length, n.width, angleOf(n, next));
      moved = true;
    });
    if (moved) mesh.instanceMatrix.needsUpdate = true;
  });
  return null;
}
