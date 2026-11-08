import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { BufferAttribute, BufferGeometry, CatmullRomCurve3, MathUtils, Matrix4, Vector3, type InstancedMesh } from 'three';
import { DIMS, type Vec3 } from '../../config/dims';
import { SEGMENTS } from '../../config/detail';
import { lathe } from '../../geometry/build';
import { getMaterial } from '../../materials/materials';
import { dynamicParts, partObjects } from '../../scene/partObjects';
import { band } from '../engine/geometry/core';

/** One end of a cable: a point on a part (car coordinates, assembled) and the way the cable leaves it. */
export interface CableEnd {
  part: string;
  /** The part's `position` (car coordinates), so the point can be expressed in its frame. */
  origin: Vec3;
  at: Vector3;
  dir: Vector3;
}

export interface CableRoute {
  id: string;
  from: CableEnd;
  to: CableEnd;
  /** Assembled route between the ends (car coordinates). */
  via: readonly Vector3[];
  /**
   * How far the middle of the cable bows out (car axes) once its ends have separated by
   * `slackGrowth` more than when assembled: keeps it outside the exploded parts.
   */
  slack: Vector3;
  /** Where along the cable (0…1) the slack peaks; default the middle. */
  slackPeak?: number;
}

const H = DIMS.hvCable;
const STRANDS = 3;
const T = SEGMENTS.cable;
const R = SEGMENTS.cableRadial;
/** Straight run out of each connector before the cable may bend. */
const LEAD = 0.05;

/**
 * Build for an HV bundle (3 orange strands twisted round each other, with clips) that
 * re-curves every frame between its two ends. Each assembled waypoint is carried along
 * by a blend of the two ends' displacements (by its position along the route), so the
 * assembled route is exact and the cable follows its ends smoothly as they separate.
 */
export function cableBuild(route: CableRoute) {
  function Build() {
    const clipsRef = useRef<InstancedMesh>(null);
    const state = useMemo(() => createCable(route), []);

    useLayoutEffect(() => {
      const update = () => state.update(clipsRef.current);
      dynamicParts.set(route.id, update);
      update();
      return () => {
        dynamicParts.delete(route.id);
      };
    }, [state]);

    useFrame(() => state.update(clipsRef.current));

    return (
      <>
        <mesh geometry={state.geometry} material={getMaterial('hvOrange')} />
        <instancedMesh ref={clipsRef} args={[state.clipGeometry, getMaterial('satinBlack'), state.clipCount]} />
      </>
    );
  }
  Build.displayName = `HvCable(${route.id})`;
  return Build;
}

function createCable(route: CableRoute) {
  const { from, to } = route;
  const leadA = from.at.clone().addScaledVector(from.dir, LEAD);
  const leadB = to.at.clone().addScaledVector(to.dir, LEAD);
  const assembled = [from.at, leadA, ...route.via, leadB, to.at];
  // Position of each control point along the assembled route (0…1), for the blend.
  const cum = [0];
  for (let i = 1; i < assembled.length; i++) cum.push(cum[i - 1] + assembled[i].distanceTo(assembled[i - 1]));
  const share = cum.map((c) => c / cum[cum.length - 1]);
  const span = from.at.distanceTo(to.at);
  // Slack profile sin(π s^k), with k putting the peak at slackPeak.
  const slackPower = Math.log(0.5) / Math.log(route.slackPeak ?? 0.5);

  const geometry = new BufferGeometry();
  const verts = STRANDS * (T + 1) * (R + 1);
  const position = new BufferAttribute(new Float32Array(verts * 3), 3);
  const normal = new BufferAttribute(new Float32Array(verts * 3), 3);
  geometry.setAttribute('position', position);
  geometry.setAttribute('normal', normal);
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(verts * 2), 2));
  const index: number[] = [];
  for (let k = 0; k < STRANDS; k++) {
    const base = k * (T + 1) * (R + 1);
    for (let i = 0; i < T; i++) {
      for (let j = 0; j < R; j++) {
        const a = base + i * (R + 1) + j;
        const b = a + R + 1;
        index.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  }
  geometry.setIndex(index);
  geometry.userData.dynamic = true;

  const clipR = H.bundleOffset + H.strandRadius;
  const [, clipWidth] = H.clip;
  const clipGeometry = lathe(band(clipR, clipR + H.strandRadius * 0.4, -clipWidth / 2, clipWidth / 2), SEGMENTS.small);
  const length = cum[cum.length - 1];
  const clipCount = Math.max(1, Math.floor(length / H.clipSpacing));

  const local = (end: CableEnd) => end.at.clone().sub(new Vector3(...end.origin));
  const localA = local(from);
  const localB = local(to);
  const nowA = new Vector3();
  const nowB = new Vector3();
  const last = { a: new Vector3(NaN, 0, 0), b: new Vector3() };
  const m = new Matrix4();

  /** World position of a cable end now (assembled position if its part isn't mounted). */
  function endNow(end: CableEnd, loc: Vector3, out: Vector3) {
    const o = partObjects.get(end.part);
    if (!o) return out.copy(end.at);
    o.content.updateWorldMatrix(true, false);
    return out.copy(loc).applyMatrix4(o.content.matrixWorld);
  }

  function update(clips: InstancedMesh | null) {
    endNow(from, localA, nowA);
    endNow(to, localB, nowB);
    const still = nowA.distanceToSquared(last.a) < 1e-12 && nowB.distanceToSquared(last.b) < 1e-12;
    if (still && (!clips || clips.userData.placed)) return;
    if (clips) clips.userData.placed = true;
    last.a.copy(nowA);
    last.b.copy(nowB);
    const dA = nowA.clone().sub(from.at);
    const dB = nowB.clone().sub(to.at);
    const grown = MathUtils.clamp((nowA.distanceTo(nowB) - span) / H.slackGrowth, 0, 1);
    const points = assembled.map((p, i) =>
      p.clone().add(dA.clone().lerp(dB, share[i])).addScaledVector(route.slack, grown * Math.sin(Math.PI * share[i] ** slackPower)),
    );
    const pts = new CatmullRomCurve3(points, false, 'centripetal').getSpacedPoints(T);

    // Parallel-transport frames along the centreline.
    const tangents = pts.map((_, i) => pts[Math.min(i + 1, T)].clone().sub(pts[Math.max(i - 1, 0)]).normalize());
    const normals: Vector3[] = [];
    let n = new Vector3(0, 1, 0);
    if (Math.abs(n.dot(tangents[0])) > 0.9) n.set(1, 0, 0);
    for (const t of tangents) {
      n = n.clone().addScaledVector(t, -t.dot(n)).normalize();
      normals.push(n);
    }
    const p = new Vector3();
    const off = new Vector3();
    const dir = new Vector3();
    let v = 0;
    for (let k = 0; k < STRANDS; k++) {
      for (let i = 0; i <= T; i++) {
        const t = tangents[i];
        const nn = normals[i];
        const bb = new Vector3().crossVectors(t, nn);
        const twist = (k / STRANDS) * Math.PI * 2 + (i / T) * length * H.twist * Math.PI * 2;
        off.copy(nn).multiplyScalar(Math.cos(twist) * H.bundleOffset).addScaledVector(bb, Math.sin(twist) * H.bundleOffset);
        for (let j = 0; j <= R; j++) {
          const a = (j / R) * Math.PI * 2;
          dir.copy(nn).multiplyScalar(Math.cos(a)).addScaledVector(bb, Math.sin(a));
          p.copy(pts[i]).add(off).addScaledVector(dir, H.strandRadius);
          position.setXYZ(v, p.x, p.y, p.z);
          normal.setXYZ(v, dir.x, dir.y, dir.z);
          v++;
        }
      }
    }
    position.needsUpdate = true;
    normal.needsUpdate = true;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    if (clips) {
      for (let c = 0; c < clipCount; c++) {
        const i = Math.round(((c + 0.5) / clipCount) * T);
        const t = tangents[i];
        const nn = normals[i];
        m.makeBasis(new Vector3().crossVectors(t, nn), t, nn).setPosition(pts[i]);
        clips.setMatrixAt(c, m);
      }
      clips.instanceMatrix.needsUpdate = true;
      clips.computeBoundingBox();
      clips.computeBoundingSphere();
    }
  }

  // Assembled shape up front, so bounds (shadow and culling decisions) are right on mount.
  update(null);
  return { geometry, clipGeometry, clipCount, update };
}
