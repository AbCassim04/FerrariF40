import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { AdditiveBlending, BufferGeometry, CatmullRomCurve3, Float32BufferAttribute, Matrix4, Mesh, ShaderMaterial, TubeGeometry, Vector3, type Curve } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DIMS } from '../config/dims';
import { ENGINE_SIM, TIME_SCALES } from '../config/engine-sim';
import { SOUND } from '../config/sound';
import { plenumZ, runnerCurve, throttleAxis, throttleInlet } from '../parts/engine/geometry/intake';
import { CYLINDERS, firingAngle, SIDES, sideSign, type Side } from '../parts/engine/layout';
import {
  chargePipeCurves,
  collectorCurve,
  compressorInlet,
  compressorOutlet,
  downpipeCurve,
  inletCurve,
  intercoolerPort,
  primaryCurve,
  silencerPath,
  tailpipeBend,
  turbineInlet,
  turbineOutlet,
  wastegateOutlet,
  wastegatePipeCurves,
} from '../parts/turbo/geometry';
import { partObjects } from '../scene/partObjects';
import { sim, useEngineStore } from '../state/engine';
import { useAppStore } from '../state/store';
import { motionState } from './motion';

/**
 * 9B gas flow, shown in X-ray with "Flow" on. Exhaust: each firing sends a glowing pulse from
 * its port down its own primary, into the collector, through the turbine, the downpipe and the
 * silencer and out of the outer tailpipe, hot to cooler along the way, in the firing order (the
 * pulses are timed from the crank angle, so they follow the display speed: Strokes shows them
 * one by one). At full boost the wastegate opens and pulses also take its pipe to the centre
 * tailpipe. Intake: cool air from the filters into the compressors, warm after them, cool again
 * after the intercoolers, into the plenum and down each runner as its intake valve opens.
 *
 * Two merged tube meshes (exhaust, intake) along the parts' own centrelines; every vertex
 * knows which part it belongs to, and the vertex shader places it with that part's matrix, so
 * exploded each segment flows where its part is. Built the first time Flow is turned on; not
 * drawn while it is off.
 */

const E = DIMS.engine;
const F = ENGINE_SIM.flow;
const deg = 180 / Math.PI;

/** Segment kinds (the shaders read them). */
const PRIMARY = 0;
const SHARED = 1;
const GATE = 2;
const AIR = 3;
const RUNNER = 4;

interface Seg {
  part: string;
  curve: Curve<Vector3>;
  kind: number;
  /** Cylinder (0–7: bank × 4 + index) for primaries and runners; bank (0, 1; 2 = both) for shared segments. */
  idx: number;
  /** Distance along the route at the segment's start (m), and how much of the route it covers (default: its own length). */
  s0: number;
  length?: number;
  /** Temperature coordinate at its start and end (exhaust: 0 hot … 1 cool; intake: 0 cool … 1 hot). */
  heat: [number, number];
  radius: number;
}

const through = (...pts: Vector3[]) => new CatmullRomCurve3(pts, false, 'centripetal');
const reversed = (c: CatmullRomCurve3) => new CatmullRomCurve3([...c.points].reverse(), false, 'centripetal');
const at = (s: Side, x: number, y: number, z: number) => new Vector3(sideSign(s) * x, y, z);
const bankIndex = (s: Side) => SIDES.indexOf(s);
const cylinder = (s: Side, i: number) => bankIndex(s) * CYLINDERS.length + i;

/** The exhaust and wastegate routes, and the total route length (port to tailpipe). */
function exhaustRoutes() {
  const segs: Seg[] = [];
  const TB = E.turbo;
  const TP = E.tailpipe;
  let total = 0;
  for (const s of SIDES) {
    const b = bankIndex(s);
    const primaries = CYLINDERS.map((i) => primaryCurve(s, i));
    const lp = primaries.reduce((a, c) => a + c.getLength(), 0) / primaries.length;
    // Every primary is drawn as the mean length, so the pulses meet the collector together.
    primaries.forEach((c, i) => segs.push({ part: `exhaust-manifold-${s}`, curve: c, kind: PRIMARY, idx: cylinder(s, i), s0: 0, length: lp, heat: [0, 0], radius: E.exhaust.primaryRadius * F.radius }));
    const chain: { part: string; curve: Curve<Vector3>; radius: number }[] = [
      { part: `exhaust-manifold-${s}`, curve: collectorCurve(s), radius: 0.022 },
      { part: `turbo-${s}`, curve: through(turbineInlet(s).at, at(s, TB.turbine.x, TB.y - 0.01, TB.z), turbineOutlet(s).at), radius: 0.02 },
      { part: `downpipe-${s}`, curve: downpipeCurve(s), radius: E.downpipe.radius },
    ];
    const sil = silencerPath(s);
    chain.push({ part: 'silencer', curve: through(sil.inlet, sil.centre, sil.outlet), radius: 0.035 });
    const bend = tailpipeBend(s);
    chain.push({ part: 'tailpipes', curve: bend.curve, radius: TP.radius });
    chain.push({ part: 'tailpipes', curve: through(bend.to, at(s, TP.sideX, TP.y, (bend.to.z + TP.exitZ) / 2), at(s, TP.sideX, TP.y, TP.exitZ - 0.01)), radius: TP.radius });
    let s0 = lp;
    for (const c of chain) {
      segs.push({ part: c.part, curve: c.curve, kind: SHARED, idx: b, s0, heat: [0, 0], radius: c.radius * F.radius });
      s0 += c.curve.getLength();
    }
    total = Math.max(total, s0);
    // The wastegate: off the collector beside the valve, through the valve to its outlet, then its branch pipe.
    const W = E.wastegate;
    const coll = collectorCurve(s);
    let best = 0;
    for (let k = 0; k <= 40; k++) if (Math.abs(coll.getPointAt(k / 40).z - W.z) < Math.abs(coll.getPointAt(best / 40).z - W.z)) best = k;
    const offAt = coll.getPointAt(best / 40);
    const valve = at(s, W.x, W.y - W.bodyHeight * 0.2, W.z);
    const gateStart = lp + coll.getLength() * (best / 40);
    const gate = through(offAt, valve, wastegateOutlet(s).at);
    segs.push({ part: `wastegate-${s}`, curve: gate, kind: GATE, idx: b, s0: gateStart, heat: [0, 0], radius: W.bodyRadius * 0.5 * F.radius });
    segs.push({ part: 'wastegate-pipe', curve: wastegatePipeCurves().branch(s), kind: GATE, idx: b, s0: gateStart + gate.getLength(), heat: [0, 0], radius: E.wastegatePipe.radius * F.radius });
  }
  // After the Y both banks share the pipe back to the centre tailpipe.
  const { back } = wastegatePipeCurves();
  const yAt = gateEnd(segs);
  segs.push({ part: 'wastegate-pipe', curve: back, kind: GATE, idx: 2, s0: yAt, heat: [0, 0], radius: E.wastegatePipe.radius * F.radius });
  const end = back.getPointAt(1);
  segs.push({ part: 'tailpipes', curve: through(end, new Vector3(0, E.wastegatePipe.tipY, (end.z + E.tailpipe.exitZ) / 2), new Vector3(0, E.wastegatePipe.tipY, E.tailpipe.exitZ - 0.01)), kind: GATE, idx: 2, s0: yAt + back.getLength(), heat: [0, 0], radius: E.tailpipe.radius * F.radius });
  // Heat: by distance along the route.
  total = Math.max(total, yAt + back.getLength() + 0.05);
  for (const g of segs) {
    const len = g.length ?? g.curve.getLength();
    g.heat = [g.s0 / total, (g.s0 + len) / total];
  }
  return { segs, total };
}

/** Where the wastegate branches reach the Y (the mean of the two). */
function gateEnd(segs: Seg[]) {
  const ends = segs.filter((g) => g.kind === GATE && g.part === 'wastegate-pipe').map((g) => g.s0 + g.curve.getLength());
  return ends.reduce((a, b) => a + b, 0) / Math.max(1, ends.length);
}

/** The intake routes: filter → compressor → riser → intercooler → forward pipe → throttle → plenum, then each runner. */
function intakeRoutes() {
  const segs: Seg[] = [];
  const TB = E.turbo;
  const FI = E.turboInlet.filter;
  const IC = E.intercooler;
  const P = E.intake.plenum;
  const midY = (P.bottom + P.top) / 2;
  for (const s of SIDES) {
    const b = bankIndex(s);
    const icIn = intercoolerPort(s, 'in').at;
    const icOut = intercoolerPort(s, 'out').at;
    const midZ = (IC.z[0] + IC.z[1]) / 2;
    const chain: { part: string; curve: Curve<Vector3>; heat: [number, number]; radius: number }[] = [
      { part: `turbo-inlet-${s}`, curve: reversed(inletCurve(s)), heat: [0, 0], radius: E.turboInlet.radius },
      { part: `turbo-${s}`, curve: through(compressorInlet(s).at, at(s, TB.compressor.x, TB.y + 0.01, TB.z), compressorOutlet(s).at), heat: [0, 1], radius: 0.022 },
      { part: `charge-pipes-${s}`, curve: chargeRiser(s), heat: [1, 1], radius: E.chargePipe.radius },
      { part: `intercooler-${s}`, curve: through(icIn, at(s, Math.abs(icIn.x), IC.portY, midZ), at(s, Math.abs(icOut.x), IC.portY, midZ), icOut), heat: [1, 0.15], radius: 0.03 },
      { part: `charge-pipes-${s}`, curve: chargeForward(s), heat: [0.15, 0.15], radius: E.chargePipe.radius },
      { part: 'throttle-bodies', curve: through(throttleInlet(s).at, throttleAxis(s).clone().setZ((throttleInlet(s).at.z + plenumZ.rear) / 2), throttleAxis(s)), heat: [0.15, 0.15], radius: 0.024 },
      { part: 'intake-plenum', curve: through(throttleAxis(s), at(s, E.intake.runner.topX, midY, plenumZ.rear + 0.04), at(s, E.intake.runner.topX, midY, plenumZ.front - 0.04)), heat: [0.15, 0.15], radius: 0.03 },
    ];
    // The filter: from its middle down to where the duct leaves it.
    const top = reversed(inletCurve(s)).getPointAt(0);
    chain.unshift({ part: `turbo-inlet-${s}`, curve: through(at(s, FI.x, (FI.y[0] + FI.y[1]) / 2, FI.z), top.clone().setY(top.y + 0.02), top), heat: [0, 0], radius: FI.radius * 0.6 });
    let s0 = 0;
    for (const c of chain) {
      segs.push({ part: c.part, curve: c.curve, kind: AIR, idx: b, s0, heat: c.heat, radius: c.radius * F.radius });
      s0 += c.curve.getLength();
    }
    for (const i of CYLINDERS) segs.push({ part: `intake-runners-${s}`, curve: reversed(runnerCurve(s, i)), kind: RUNNER, idx: cylinder(s, i), s0: 0, heat: [0.15, 0.15], radius: E.intake.runner.radius * F.radius });
  }
  return { segs };
}

const chargeRiser = (s: Side) => chargePipeCurves(s).riser;
const chargeForward = (s: Side) => chargePipeCurves(s).forward;

/** One merged tube geometry for a set of segments, with the per-vertex attributes the shaders read. */
function build(segs: Seg[], parts: string[]) {
  const pieces = segs.map((g) => {
    const len = g.curve.getLength();
    const geo = new TubeGeometry(g.curve, Math.max(6, Math.ceil(len / F.step)), Math.max(0.004, g.radius), 6, false);
    const uv = geo.getAttribute('uv');
    const n = uv.count;
    const covers = g.length ?? len;
    const a = { part: new Float32Array(n), s: new Float32Array(n), kind: new Float32Array(n), idx: new Float32Array(n), heat: new Float32Array(n) };
    const pi = parts.indexOf(g.part);
    for (let k = 0; k < n; k++) {
      const u = uv.getX(k);
      a.part[k] = pi;
      a.s[k] = g.s0 + u * covers;
      a.kind[k] = g.kind;
      a.idx[k] = g.idx;
      a.heat[k] = g.heat[0] + (g.heat[1] - g.heat[0]) * u;
    }
    geo.setAttribute('aPart', new Float32BufferAttribute(a.part, 1));
    geo.setAttribute('aS', new Float32BufferAttribute(a.s, 1));
    geo.setAttribute('aKind', new Float32BufferAttribute(a.kind, 1));
    geo.setAttribute('aIdx', new Float32BufferAttribute(a.idx, 1));
    geo.setAttribute('aHeat', new Float32BufferAttribute(a.heat, 1));
    geo.deleteAttribute('uv');
    return geo;
  });
  return mergeGeometries(pieces) as BufferGeometry;
}

const VERTEX = (count: number) => /* glsl */ `
  uniform mat4 uParts[${count}];
  attribute float aPart;
  attribute float aS;
  attribute float aKind;
  attribute float aIdx;
  attribute float aHeat;
  varying float vS;
  varying float vKind;
  varying float vIdx;
  varying float vHeat;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    mat4 M = uParts[int(aPart + 0.5)];
    vec4 mv = viewMatrix * (M * vec4(position, 1.0));
    vN = normalize(mat3(viewMatrix) * mat3(M) * normal);
    vV = normalize(-mv.xyz);
    vS = aS;
    vKind = aKind;
    vIdx = aIdx;
    vHeat = aHeat;
    gl_Position = projectionMatrix * mv;
  }
`;

const PULSE = /* glsl */ `
  // A pulse: a short bright front and a fading tail behind it (front at f, metres along the route).
  float pulse(float s, float f, float tail, float front) {
    float d = f - s;
    return d >= 0.0 ? exp(-d / tail) * step(d, tail * 6.0) : exp(d / front);
  }
`;

const EXHAUST_FRAGMENT = /* glsl */ `
  uniform float uPhase[8];
  uniform float uK;
  uniform float uGate;
  uniform float uOn;
  uniform float uTail;
  uniform float uFront;
  uniform float uBase;
  varying float vS;
  varying float vKind;
  varying float vIdx;
  varying float vHeat;
  varying vec3 vN;
  varying vec3 vV;
  ${PULSE}
  void main() {
    int idx = int(vIdx + 0.5);
    float g = 0.0;
    if (vKind < 0.5) {
      g = pulse(vS, uPhase[idx] * uK, uTail, uFront);
    } else {
      int first = idx == 2 ? 0 : idx * 4;
      int n = idx == 2 ? 8 : 4;
      for (int c = 0; c < 8; c++) {
        if (c >= n) break;
        g += pulse(vS, uPhase[first + c] * uK, uTail, uFront);
      }
      // The wastegate takes pulses only as it opens; the turbine path keeps most of them.
      g *= vKind < 1.5 ? 1.0 - 0.45 * uGate : uGate;
    }
    vec3 hot = vec3(1.6, 1.25, 0.8);
    vec3 mid = vec3(1.5, 0.48, 0.1);
    vec3 cool = vec3(0.65, 0.1, 0.04);
    vec3 col = vHeat < 0.45 ? mix(hot, mid, vHeat / 0.45) : mix(mid, cool, (vHeat - 0.45) / 0.55);
    float face = 0.55 + 0.45 * abs(dot(normalize(vN), normalize(vV)));
    float base = vKind > 1.5 ? uBase * uGate : uBase;
    gl_FragColor = vec4(col * (g + base) * face * uOn, 1.0);
  }
`;

const INTAKE_FRAGMENT = /* glsl */ `
  uniform float uPhase[8];
  uniform float uKin;
  uniform float uTravel;
  uniform float uFlow;
  uniform float uOn;
  uniform float uBase;
  varying float vS;
  varying float vKind;
  varying float vIdx;
  varying float vHeat;
  varying vec3 vN;
  varying vec3 vV;
  ${PULSE}
  void main() {
    float g;
    vec3 coolAir = vec3(0.25, 0.65, 1.5);
    vec3 warmAir = vec3(1.45, 0.75, 0.35);
    vec3 col = mix(coolAir, warmAir, vHeat);
    if (vKind < 3.5) {
      // A steady stream: bands moving along at the air's (display) speed.
      float band = 0.5 + 0.5 * sin(6.2832 * (vS - uTravel) / 0.16);
      g = uFlow * (0.25 + 0.75 * band * band * band);
    } else {
      // Down a runner while its intake valve is open.
      float ph = uPhase[int(vIdx + 0.5)];
      g = ph < 240.0 ? pulse(vS, ph * uKin, 0.05, 0.012) : 0.0;
      g += 0.25 * uFlow;
    }
    float face = 0.55 + 0.45 * abs(dot(normalize(vN), normalize(vV)));
    gl_FragColor = vec4(col * (g + uBase) * face * uOn, 1.0);
  }
`;

function material(vertex: string, fragment: string, uniforms: Record<string, { value: unknown }>) {
  return new ShaderMaterial({ uniforms, vertexShader: vertex, fragmentShader: fragment, transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false });
}

/** Exhaust valve opening (degrees after firing TDC) and intake valve opening (after firing TDC, in the 720° cycle). */
const EVO = SOUND.exhaust.pulseAt;
const IVO = F.intakeOpensDeg;

function makeFlow() {
  const ex = exhaustRoutes();
  const air = intakeRoutes();
  const parts = [...new Set([...ex.segs, ...air.segs].map((g) => g.part))];
  const matrices = parts.map(() => new Matrix4());
  const exhaust = new Mesh(
    build(ex.segs, parts),
    material(VERTEX(parts.length), EXHAUST_FRAGMENT, {
      uParts: { value: matrices },
      uPhase: { value: new Array(8).fill(1000) },
      uK: { value: (ex.total * F.exhaustReach) / 720 },
      uGate: { value: 0 },
      uOn: { value: 1 },
      uTail: { value: F.tail },
      uFront: { value: F.front },
      uBase: { value: F.base },
    }),
  );
  const intake = new Mesh(
    build(air.segs, parts),
    material(VERTEX(parts.length), INTAKE_FRAGMENT, {
      uParts: { value: matrices },
      uPhase: { value: new Array(8).fill(1000) },
      uKin: { value: F.runnerLength / 200 },
      uTravel: { value: 0 },
      uFlow: { value: 0 },
      uOn: { value: 1 },
      uBase: { value: F.base },
    }),
  );
  for (const m of [exhaust, intake]) {
    m.frustumCulled = false;
    m.renderOrder = 9;
    m.userData.effect = true;
    m.castShadow = m.receiveShadow = false;
  }
  return { exhaust, intake, parts, matrices, total: ex.total };
}

/** Degrees since `opens`, in the 720° cycle, for the display crank angle. */
const since = (crankDeg: number, opens: number) => (((crankDeg - opens) % 720) + 720) % 720;

export function GasFlow() {
  const flow = useAppStore((s) => s.flow);
  const xray = useAppStore((s) => s.xray);
  const on = flow && xray;
  // Built the first time it is turned on, then kept (hidden while off: no draw calls).
  const keep = useMemo(() => ({ flow: null as ReturnType<typeof makeFlow> | null, travel: 0 }), []);
  if (on && !keep.flow) keep.flow = makeFlow();
  useEffect(() => {
    const f = keep.flow;
    if (!f) return;
    f.exhaust.visible = f.intake.visible = on;
  }, [on, keep]);
  useEffect(
    () => () => {
      const f = keep.flow;
      if (!f) return;
      for (const m of [f.exhaust, f.intake]) {
        m.removeFromParent();
        m.geometry.dispose();
        (m.material as ShaderMaterial).dispose();
      }
    },
    [keep],
  );
  useFrame(({ scene }, delta) => {
    const f = keep.flow;
    if (!f || !on) return;
    if (f.exhaust.parent !== scene) scene.add(f.exhaust, f.intake);
    f.parts.forEach((id, k) => {
      const o = partObjects.get(id);
      if (o) f.matrices[k].copy(o.content.matrixWorld);
    });
    const running = sim.phase !== 'off';
    const crankDeg = motionState.crank * deg;
    const ex = (f.exhaust.material as ShaderMaterial).uniforms;
    const air = (f.intake.material as ShaderMaterial).uniforms;
    SIDES.forEach((s) =>
      CYLINDERS.forEach((i) => {
        const c = cylinder(s, i);
        const fire = firingAngle(s, i) * deg;
        ex.uPhase.value[c] = running ? since(crankDeg, fire + EVO) : 1000;
        air.uPhase.value[c] = running ? since(crankDeg, fire + IVO) : 1000;
      }),
    );
    // The wastegate opens near peak boost (as the sound's centre outlet does).
    const share = Math.min(1, Math.max(0, sim.boost) / ENGINE_SIM.maxBoost);
    ex.uGate.value = running ? Math.max(0, (share - SOUND.exhaust.wastegateFrom) / (1 - SOUND.exhaust.wastegateFrom)) : 0;
    ex.uOn.value = air.uOn.value = running ? 1 : F.offLevel;
    // Intake air moves at a speed set by revs and throttle, at the display speed.
    const scale = TIME_SCALES[useEngineStore.getState().timeScale].scale;
    const speed = running ? F.airSpeed * (sim.rpm / 7000) * (0.3 + 0.7 * sim.throttle) : 0;
    keep.travel = (keep.travel + speed * Math.min(delta, 0.1) * scale) % 1000;
    air.uTravel.value = keep.travel;
    air.uFlow.value = running ? Math.min(1, 0.35 + (sim.rpm / 7000) * (0.4 + 0.6 * sim.throttle)) : 0;
  });
  return null;
}
