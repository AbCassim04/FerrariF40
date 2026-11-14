import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  IcosahedronGeometry,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  ShaderMaterial,
  Vector3,
  type Group,
} from 'three';
import { DIMS } from '../config/dims';
import { FLASH, TIME_SCALES } from '../config/engine-sim';
import { CYLINDERS, crankpin, cycleAngle, cylinderNumber, bankPoint, headDeckA, SIDES, strokeOf, type Side } from '../parts/engine/layout';
import { explodeTimeline } from '../explode/buildTimeline';
import { partObjects } from '../scene/partObjects';
import { useAppStore } from '../state/store';
import { sim, useEngineStore } from '../state/engine';
import { motionState } from './motion';

const E = DIMS.engine;
const TAU = Math.PI * 2;

/** Soft additive glow ball: bright core, fading to nothing at its rim (instance colour = colour × intensity). */
function glowMaterial() {
  return new ShaderMaterial({
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      varying vec3 vColor;
      void main() {
        vColor = instanceColor;
        vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * mat3(instanceMatrix) * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      varying vec3 vColor;
      void main() {
        float f = abs(dot(normalize(vNormal), normalize(vView)));
        gl_FragColor = vec4(vColor * pow(f, 2.2), 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    // Seen through the engine's casings (X-ray), like light from inside the cylinders.
    depthTest: false,
    blending: AdditiveBlending,
  });
}

const FIRE = new Color('#ffb04a');
const SPARK = new Color('#9fd8ff');

/** Where cylinder (s, i)'s combustion happens: just above the piston crown at TDC (pistons' frame). */
const chamber = (s: Side, i: number) => bankPoint(s, E.deckHeight + E.head.gasketThickness * 0.5, 0, E.boreZ[s][i]);
/** The spark plug's tip (spark plugs' frame). */
const plugTip = (s: Side, i: number) => bankPoint(s, headDeckA + E.sparkPlug.tip, 0, E.boreZ[s][i]);

/**
 * Engine effects that live in the parts' own frames (so they follow the explode):
 * X-ray combustion flashes in firing order, the followed cylinder's spark in Strokes mode,
 * its stroke label, and guide lines from each rod's big end to its crank pin while exploded.
 * All cost nothing while the engine is off.
 */
export function EngineEffects() {
  const xray = useAppStore((s) => s.xray);
  const running = useEngineStore((s) => s.engineRunning);
  const timeScale = useEngineStore((s) => s.timeScale);
  const strokes = timeScale === 'strokes';

  const flashes = useMemo(() => {
    const geometry = new IcosahedronGeometry(E.bore * 0.42, 2);
    const material = glowMaterial();
    return SIDES.map((s) => {
      const mesh = new InstancedMesh(geometry, material, CYLINDERS.length);
      CYLINDERS.forEach((i) => mesh.setColorAt(i, new Color(0, 0, 0)));
      CYLINDERS.forEach((i) => mesh.setMatrixAt(i, new Matrix4().setPosition(chamber(s, i))));
      Object.assign(mesh, { frustumCulled: false, renderOrder: 10, raycast: () => {} });
      mesh.userData.effect = true;
      mesh.visible = false;
      return { s, mesh };
    });
  }, []);
  const spark = useMemo(() => {
    const mesh = new InstancedMesh(new IcosahedronGeometry(0.009, 1), glowMaterial(), 1);
    mesh.setColorAt(0, new Color(0, 0, 0));
    Object.assign(mesh, { frustumCulled: false, renderOrder: 11, raycast: () => {} });
    mesh.userData.effect = true;
    mesh.visible = false;
    return mesh;
  }, []);

  // Hang the flashes on each bank's pistons (they follow them when exploded).
  useEffect(() => {
    for (const { s, mesh } of flashes) partObjects.get(`pistons-${s}`)?.anchor.add(mesh);
    return () => flashes.forEach(({ mesh }) => mesh.removeFromParent());
  }, [flashes]);

  useFrame(() => {
    if (!running && !flashes[0].mesh.visible && !spark.visible) return;
    const on = running && sim.firing;
    const showFlash = on && xray;
    for (const { s, mesh } of flashes) {
      mesh.visible = showFlash;
      if (!showFlash) continue;
      const speed = visualSpeed();
      for (const i of CYLINDERS) {
        const since = cycleAngle(s, i, motionState.crank);
        const tau = Math.max(FLASH.minSeconds, (FLASH.crankDegrees * Math.PI) / 180 / Math.max(speed, 1e-6));
        // Too fast to tell apart (Real): the flashes merge into a dimmer steady glow.
        const merge = Math.min(1, Math.max(0.25, (4 * Math.PI) / Math.max(speed, 1e-6) / (8 * tau)));
        const level = speed > 0 ? Math.exp(-since / speed / tau) * FLASH.intensity * (0.5 + 0.5 * sim.load) * merge : 0;
        mesh.setColorAt(i, new Color().copy(FIRE).multiplyScalar(level));
      }
      mesh.instanceColor!.needsUpdate = true;
    }
    // Strokes mode: the followed cylinder's spark, briefly, at its firing.
    const { strokeCylinder: c } = useEngineStore.getState();
    const showSpark = on && strokes;
    spark.visible = showSpark;
    if (showSpark) {
      const plugs = partObjects.get(`spark-plugs-${c.s}`);
      if (plugs && spark.parent !== plugs.anchor) plugs.anchor.add(spark);
      spark.setMatrixAt(0, new Matrix4().setPosition(plugTip(c.s, c.i)));
      spark.instanceMatrix.needsUpdate = true;
      const since = cycleAngle(c.s, c.i, motionState.crank);
      const deg = (since * 180) / Math.PI;
      // Ignition is just before TDC: light from 10° before (the end of the cycle) to 25° after.
      const level = deg > 710 || deg < 25 ? 3 * (deg > 710 ? (deg - 710) / 10 : 1 - deg / 25) : 0;
      spark.setColorAt(0, new Color().copy(SPARK).multiplyScalar(level));
      spark.instanceColor!.needsUpdate = true;
    }
  });

  return (
    <>
      <RodGuides />
      {running && strokes && <StrokeLabel />}
    </>
  );
}

/** Visual crank speed now (rad/s). */
function visualSpeed() {
  const { timeScale } = useEngineStore.getState();
  return (sim.rpm / 60) * TAU * TIME_SCALES[timeScale].scale;
}

const STROKE_NAMES = { intake: 'Intake', compression: 'Compression', power: 'Power', exhaust: 'Exhaust' } as const;

/** Strokes mode: the followed cylinder's number and current stroke, beside it. */
function StrokeLabel() {
  const anchor = useRef<Group>(null);
  const text = useRef<HTMLDivElement>(null);
  const p = useMemo(() => new Vector3(), []);
  useFrame(() => {
    const { strokeCylinder: c } = useEngineStore.getState();
    const pistons = partObjects.get(`pistons-${c.s}`);
    if (!pistons || !anchor.current) return;
    // Beside the cylinder at the deck, outboard of its bore (in the pistons' frame, so it follows the explode).
    p.copy(bankPoint(c.s, E.deckHeight + 0.02, E.bore / 2 + 0.06, E.boreZ[c.s][c.i]));
    pistons.anchor.updateWorldMatrix(true, false);
    anchor.current.position.copy(p.applyMatrix4(pistons.anchor.matrixWorld));
    const stroke = strokeOf(c.s, c.i, motionState.crank);
    if (text.current) {
      const label = `Cyl ${cylinderNumber(c.s, c.i)} · ${STROKE_NAMES[stroke]}`;
      if (text.current.textContent !== label) text.current.textContent = label;
      text.current.dataset.stroke = stroke;
    }
  });
  return (
    <group ref={anchor}>
      <Html center zIndexRange={[5, 0]} pointerEvents="none">
        <div ref={text} className="stroke-label" />
      </Html>
    </group>
  );
}

/**
 * While exploded the rods ride with their pistons, away from the crank: a faint line from
 * each rod's big end to its crank pin keeps the linkage readable. Fades in as they part.
 */
function RodGuides() {
  const lines = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(CYLINDERS.length * 2 * 2 * 3), 3));
    const l = new LineSegments(g, new LineBasicMaterial({ color: '#9fd8ff', transparent: true, opacity: 0, depthWrite: false }));
    l.frustumCulled = false;
    l.raycast = () => {};
    l.visible = false;
    return l;
  }, []);
  const a = useMemo(() => new Vector3(), []);
  const b = useMemo(() => new Vector3(), []);
  const seen = useRef({ version: -1, time: -1 });
  useFrame(() => {
    const crank = partObjects.get('crankshaft');
    if (!crank) return;
    // Only when the pose or the explode changed (nothing to do while everything is still).
    const time = explodeTimeline.current?.time() ?? 0;
    if (seen.current.version === motionState.version && seen.current.time === time) return;
    seen.current = { version: motionState.version, time };
    const pos = lines.geometry.getAttribute('position') as BufferAttribute;
    let far = 0;
    let k = 0;
    crank.content.updateWorldMatrix(true, false);
    for (const s of SIDES) {
      const rods = partObjects.get(`conrods-${s}`);
      if (!rods) continue;
      rods.content.updateWorldMatrix(true, false);
      for (const i of CYLINDERS) {
        // The big end in the rods' frame and the pin in the crank's: the same point when assembled.
        crankpin(i, motionState.crank, a).setZ(E.boreZ[s][i]);
        b.copy(a).applyMatrix4(crank.content.matrixWorld);
        a.applyMatrix4(rods.content.matrixWorld);
        far = Math.max(far, a.distanceTo(b));
        pos.setXYZ(k++, a.x, a.y, a.z);
        pos.setXYZ(k++, b.x, b.y, b.z);
      }
    }
    const opacity = 0.45 * Math.min(1, Math.max(0, (far - 0.02) / 0.15));
    lines.visible = opacity > 0.005;
    (lines.material as LineBasicMaterial).opacity = opacity;
    if (lines.visible) pos.needsUpdate = true;
  });
  return <primitive object={lines} />;
}
