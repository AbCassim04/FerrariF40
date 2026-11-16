import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import {
  AdditiveBlending,
  BufferAttribute,
  DoubleSide,
  BufferGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  PlaneGeometry,
  PointLight,
  ShaderMaterial,
  Vector3,
} from 'three';
import { DIMS } from '../config/dims';
import { ENGINE_SIM } from '../config/engine-sim';
import { partObjects } from '../scene/partObjects';
import { reducedMotion, sim } from '../state/engine';
import { useQuality } from '../state/quality';

/**
 * 9B exhaust flames, rebuilt in the phase 9 fix-up: when the sim fires a pop (lifting off on
 * boost at high revs, the limiter cutting in), each outer tailpipe (the centre one is the
 * wastegates' and doesn't flame) throws a short flame made of soft additive layers, drawn by a
 * shader rather than as a shape: noise drives its length, width and edges, a little
 * turbulence sways it, and over the pop's life it flashes, stretches, breaks up into tongues,
 * leaves the pipe and cools from a blue-white core through yellow and orange to dark red.
 *
 *   - flames: one instanced ribbon per layer per tip (core, body, haze; one draw call), turned
 *     about the pipe's axis to face the camera in the vertex shader;
 *   - glows: one instanced quad (one draw call): a soft glow round each pipe mouth (facing the
 *     camera, stronger seen down the pipe, where the ribbons are edge-on) and a warm spill on
 *     the ground under the tips (the floor is unlit, so a light wouldn't reach it);
 *   - a warm point light on the rear bodywork (kept in the scene at zero between pops:
 *     switching a light on or off recompiles every shader), above the low tier only.
 *
 * Everything is placed each frame from the tailpipes part's world matrix, so it follows the
 * explode. Drawn only while a pop lasts (+2 draw calls). The look is a function of the pop's
 * age, strength and the sim's pop count only (no wall clock), so a posed or replayed pop looks
 * the same every time. Reduced motion: smaller, no light, no ground spill. Figures:
 * ENGINE_SIM.flames (est).
 */

const TP = DIMS.engine.tailpipe;
const F = ENGINE_SIM.flames;
/** The outer tips' mouths and their axis (tailpipes' frame), facing −z. */
const TIPS = [new Vector3(TP.sideX, TP.y, TP.exitZ), new Vector3(-TP.sideX, TP.y, TP.exitZ)];
const AXIS = new Vector3(0, 0, -1);
const LAYERS = F.layers;

/** Shared GLSL: hash, value noise, fbm. */
const NOISE = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float a = 0.5;
  float s = 0.0;
  for (int k = 0; k < 4; k++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec2(17.1, 9.7);
    a *= 0.5;
  }
  return s / 0.9375;
}
`;

/** Flame colour by temperature 0…1: dark red → orange → yellow → white (linear, HDR; ACES maps it). */
const RAMP = /* glsl */ `
vec3 flameRamp(float t) {
  vec3 c = mix(vec3(0.22, 0.015, 0.0), vec3(1.0, 0.24, 0.02), smoothstep(0.0, 0.38, t));
  c = mix(c, vec3(1.0, 0.62, 0.16), smoothstep(0.38, 0.68, t));
  c = mix(c, vec3(1.0, 0.92, 0.72), smoothstep(0.68, 0.95, t));
  return c;
}
`;

/** A ribbon along +s (0 at the mouth, 1 at the tip), u −1…1 across; turned to the camera in the shader. */
function ribbonGeometry() {
  const along = 28;
  const across = 6;
  const g = new BufferGeometry();
  const fl = new Float32Array((along + 1) * (across + 1) * 2);
  const index: number[] = [];
  for (let i = 0; i <= along; i++)
    for (let j = 0; j <= across; j++) {
      const k = i * (across + 1) + j;
      fl.set([i / along, (j / across) * 2 - 1], k * 2);
      if (i < along && j < across) index.push(k, k + across + 1, k + 1, k + 1, k + across + 1, k + across + 2);
    }
  g.setAttribute('fl', new BufferAttribute(fl, 2));
  // three needs a position attribute (bounds, raycast); the shader builds the real one.
  g.setAttribute('position', new BufferAttribute(new Float32Array(fl.length * 1.5), 3));
  g.setIndex(index);
  return g;
}

function flameMaterial() {
  return new ShaderMaterial({
    uniforms: { uAge: { value: 0 }, uTime: { value: 0 }, uStrength: { value: 1 }, uI: { value: 0 }, uHot: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute vec2 fl;
      // seed, brightness, width (× max), length (× flame)
      attribute vec4 iLayer;
      varying vec2 vFl;
      varying vec4 vLayer;
      varying float vFacing;
      void main() {
        // The instance matrix carries the mouth (translation), the axis × length (z column) and the width (x column).
        vec3 origin = instanceMatrix[3].xyz;
        vec3 axisL = instanceMatrix[2].xyz;
        float len = length(axisL);
        vec3 axis = axisL / max(len, 1e-5);
        float width = length(instanceMatrix[0].xyz);
        vec3 mid = origin + axis * len * 0.5;
        vec3 toCam = normalize(cameraPosition - mid);
        vec3 side = cross(axis, toCam);
        float sl = length(side);
        // Seen straight down the pipe the ribbon is edge-on: any side will do (the mouth glow takes over).
        side = sl > 1e-3 ? side / sl : normalize(cross(axis, vec3(0.0, 1.0, 0.0)));
        vFacing = sl;
        float s = fl.x;
        // Hot gas rises a little toward the tip.
        vec3 p = origin + axis * s * len + side * fl.y * width + vec3(0.0, 1.0, 0.0) * s * s * len * 0.06;
        vFl = fl;
        vLayer = iLayer;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uAge;
      uniform float uTime;
      uniform float uStrength;
      uniform float uI;
      uniform float uHot;
      varying vec2 vFl;
      varying vec4 vLayer;
      varying float vFacing;
      ${NOISE}
      ${RAMP}
      void main() {
        float s = vFl.x;
        float seed = vLayer.x;
        // The gas leaves the pipe fast: the pattern runs out along the flame.
        // Streaks: the noise is stretched along the flame (tongues), finer across it.
        float flow = s * 2.4 - uTime * 24.0;
        float n = fbm(vec2(flow, vFl.y * 2.2 + seed));
        float n2 = vnoise(vec2(flow * 1.7 + 5.0, seed * 3.1 + uTime * 9.0));
        // Turbulence: the flame sways sideways, more toward the tip.
        float u = vFl.y + (n2 - 0.5) * 0.9 * s;
        // Width profile (share of the ribbon): the mouth's size, swelling, then a ragged taper.
        float prof = (0.42 + 0.5 * smoothstep(0.0, 0.32, s)) * (1.0 - 0.8 * smoothstep(0.45, 1.0, s));
        prof *= 0.75 + 0.5 * n;
        float edge = clamp(1.0 - abs(u) / max(prof, 1e-3), 0.0, 1.0);
        float body = smoothstep(0.0, 0.85, edge);
        // A ragged tip that flickers in and out (noise-driven length).
        float tip = 1.0 - smoothstep(0.55, 1.0, s + (n - 0.5) * 0.5);
        // With age it breaks up (holes eat in where the noise is low) and leaves the pipe.
        float erode = smoothstep(0.18, 1.0, uAge);
        float d = body * tip * (0.4 + 1.25 * n * n * 1.6);
        d = max(0.0, d - erode * (1.15 - n) * 1.1);
        float detach = smoothstep(0.5, 1.0, uAge) * 0.45;
        d *= smoothstep(detach - 0.12, detach + 0.04, s);
        d *= smoothstep(0.0, 0.08, s);
        // Never a hard edge: nothing reaches the ribbon's own sides or tip.
        d *= (1.0 - smoothstep(0.7, 0.98, abs(vFl.y))) * (1.0 - smoothstep(0.9, 1.0, s));
        // Temperature: hottest on the axis at the mouth, cooler outward, along and with age.
        float T = clamp((1.0 - s * 1.05) * (0.45 + 0.55 * edge) + 0.3 * (n - 0.5) + 0.25 - uAge * 0.55, 0.0, 1.0);
        vec3 col = flameRamp(T);
        // The blue-white core at the mouth while it is young.
        float blue = uHot * (1.0 - smoothstep(0.04, 0.3, s)) * smoothstep(0.3, 0.9, edge);
        col = mix(col, vec3(0.6, 0.75, 1.45), blue * 0.8);
        // Edge-on ribbons (seen down the pipe) fade; the mouth glow covers that view.
        float facing = smoothstep(0.3, 0.65, vFacing);
        gl_FragColor = vec4(col * d * vLayer.y * uI * facing, 1.0);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    // Turned to the camera in the shader, so either winding can face it; additive, so no sorting.
    side: DoubleSide,
    forceSinglePass: true,
    toneMapped: false,
  });
}

/** Glow quads: kind 0 = mouth glow (faces the camera), 1 = ground spill (flat). */
function glowMaterial() {
  return new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uHot: { value: 1 } },
    vertexShader: /* glsl */ `
      // kind, intensity, seed, along (× size, ground spill only)
      attribute vec4 iGlow;
      varying vec2 vUv;
      varying vec4 vGlow;
      varying float vEndOn;
      void main() {
        vec3 c = instanceMatrix[3].xyz;
        float size = length(instanceMatrix[0].xyz);
        vec3 p;
        vEndOn = 0.0;
        if (iGlow.x < 0.5) {
          // Seen down the pipe the ribbons are edge-on: the glow grows into the flame seen end-on.
          vEndOn = clamp(dot(normalize(instanceMatrix[2].xyz), normalize(cameraPosition - c)), 0.0, 1.0);
          vEndOn *= vEndOn;
          size *= 1.0 + 0.8 * vEndOn;
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          // Pulled toward the eye, out of the exhaust's tunnel in the valance (13 cm deep), so
          // the bodywork round the mouth doesn't clip it.
          p = c + (right * position.x + up * position.y) * size + normalize(cameraPosition - c) * 0.15;
        } else {
          vec3 ax = normalize(instanceMatrix[2].xyz);
          vec3 sd = normalize(cross(vec3(0.0, 1.0, 0.0), ax));
          p = c + sd * position.x * size + ax * position.y * size * iGlow.w;
        }
        vUv = position.xy;
        vGlow = iGlow;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uHot;
      varying vec2 vUv;
      varying vec4 vGlow;
      varying float vEndOn;
      ${NOISE}
      void main() {
        float r = length(vUv);
        if (r >= 1.0) discard;
        vec3 col;
        float a;
        if (vGlow.x < 0.5) {
          // A soft round glow with a flickering, ragged edge (more ragged seen end-on: the flame's tongues).
          float ang = atan(vUv.y, vUv.x);
          float n = fbm(vec2(ang * 1.6 + vGlow.z, r * 2.0 - uTime * 18.0));
          float rr = r / (0.62 + (0.35 + 0.35 * vEndOn) * n);
          a = exp(-rr * rr * 5.0) * (1.0 - smoothstep(0.7, 1.0, r)) * (1.0 + 2.0 * vEndOn);
          col = mix(vec3(1.0, 0.36, 0.06), vec3(1.0, 0.78, 0.5), exp(-rr * rr * 14.0));
          col = mix(col, vec3(0.78, 0.86, 1.25), uHot * exp(-rr * rr * 30.0) * 0.8);
        } else {
          a = exp(-r * r * 3.2) * (1.0 - smoothstep(0.8, 1.0, r));
          col = vec3(1.0, 0.38, 0.1);
        }
        gl_FragColor = vec4(col * a * vGlow.y, 1.0);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    // Turned to the camera in the shader, so either winding can face it; additive, so no sorting.
    side: DoubleSide,
    forceSinglePass: true,
    toneMapped: false,
  });
}

const tmpM = new Matrix4();
const w = new Vector3();
const a = new Vector3();
const xCol = new Vector3();
const zCol = new Vector3();
const yCol = new Vector3(0, 1, 0);

/** An instance matrix: translation `at`, the axis × length as the z column, the width on x. */
function frameMatrix(at: Vector3, axis: Vector3, length: number, width: number) {
  zCol.copy(axis).multiplyScalar(Math.max(1e-4, length));
  xCol.set(width, 0, 0);
  return tmpM.makeBasis(xCol, yCol, zCol).setPosition(at);
}

export function Flames() {
  const { flames, glows, light, flameMat, glowMat } = useMemo(() => {
    const flameMat = flameMaterial();
    const flames = new InstancedMesh(ribbonGeometry(), flameMat, TIPS.length * LAYERS.length);
    const layerData = new Float32Array(flames.count * 4);
    TIPS.forEach((_, k) =>
      LAYERS.forEach((l, j) => layerData.set([k * 7.31 + j * 3.17, l.brightness, l.width, l.length], (k * LAYERS.length + j) * 4)),
    );
    flames.geometry.setAttribute('iLayer', new InstancedBufferAttribute(layerData, 4));
    const glowMat = glowMaterial();
    // Two mouth glows and two ground spills.
    const glows = new InstancedMesh(new PlaneGeometry(2, 2), glowMat, TIPS.length * 2);
    glows.geometry.setAttribute('iGlow', new InstancedBufferAttribute(new Float32Array(glows.count * 4), 4));
    for (const m of [flames, glows]) {
      m.frustumCulled = false;
      m.visible = false;
      m.castShadow = m.receiveShadow = false;
      m.userData.effect = true;
      m.renderOrder = 10;
      m.raycast = () => {};
    }
    const light = new PointLight(F.light.color, 0, F.light.distance, 2);
    light.position.set(0, TP.y + 0.04, TP.exitZ - 0.1);
    light.castShadow = false;
    return { flames, glows, light, flameMat, glowMat };
  }, []);
  useEffect(
    () => () => {
      for (const m of [flames, glows]) {
        m.removeFromParent();
        m.geometry.dispose();
      }
      light.removeFromParent();
      flameMat.dispose();
      glowMat.dispose();
    },
    [flames, glows, light, flameMat, glowMat],
  );
  useFrame(({ scene }) => {
    const o = partObjects.get('tailpipes');
    if (!o) return;
    if (flames.parent !== scene) scene.add(flames);
    if (glows.parent !== scene) scene.add(glows);
    // The light only above the low tier: every lit material pays for it while it exists (one
    // recompile when it goes, if the tier drops).
    const lit = useQuality.getState().tier < 2;
    if (lit && light.parent !== o.content) o.content.add(light);
    else if (!lit && light.parent) light.removeFromParent();
    const age = sim.popLength > 0 ? (sim.t - sim.popAt) / sim.popLength : Infinity;
    const on = sim.phase !== 'off' && age >= 0 && age < 1;
    flames.visible = glows.visible = on;
    if (!on) {
      light.intensity = 0;
      return;
    }
    const seconds = age * sim.popLength;
    const strength = sim.popStrength;
    // A flash: up in `rise` of the life, then dimming as it breaks up.
    const flash = age < F.rise ? age / F.rise : Math.max(0, 1 - (age - F.rise) / (1 - F.rise)) ** F.fade;
    const small = reducedMotion ? F.reducedScale : 1;
    const hot = 1 - Math.min(1, age / F.coolAt);
    // Flicker from the pop count and its age (deterministic).
    const flicker = 0.85 + 0.15 * Math.sin(seconds * 210 + sim.pops * 1.7) * Math.sin(seconds * 97 + 0.6);
    flameMat.uniforms.uAge.value = age;
    flameMat.uniforms.uTime.value = seconds + (sim.pops % 64) * 0.37;
    flameMat.uniforms.uStrength.value = strength;
    flameMat.uniforms.uHot.value = hot;
    flameMat.uniforms.uI.value = F.intensity * (0.55 + 0.45 * strength) * Math.min(1, flash * 1.3) * flicker;
    glowMat.uniforms.uTime.value = flameMat.uniforms.uTime.value;
    glowMat.uniforms.uHot.value = hot;
    o.content.updateWorldMatrix(true, false);
    const mw = o.content.matrixWorld;
    const axis = a.copy(AXIS).transformDirection(mw);
    const glowData = glows.geometry.getAttribute('iGlow') as InstancedBufferAttribute;
    TIPS.forEach((tip, k) => {
      w.copy(tip).applyMatrix4(mw);
      // Each side a little different, but the same every time this pop is replayed.
      const vary = 1 + F.sideVary * Math.sin(sim.pops * 12.9898 + k * 78.233);
      // Short and fat as it flashes, stretching to full length.
      const stretch = F.stretch[0] + (1 - F.stretch[0]) * Math.min(1, age / F.stretchAt);
      const length = sim.popFlame * stretch * vary * small;
      const width = F.width * (0.75 + 0.25 * strength) * small;
      LAYERS.forEach((l, j) => flames.setMatrixAt(k * LAYERS.length + j, frameMatrix(w, axis, length * l.length, width * l.width)));
      // Mouth glow: brighter as the flash peaks; the ground spill under and behind the tip,
      // fading as the tip rises off the ground (exploded) and with reduced motion gone.
      glows.setMatrixAt(k, frameMatrix(w, axis, 1, F.glow.size * small));
      glowData.setXYZW(k, 0, F.glow.intensity * (0.5 + 0.5 * strength) * Math.min(1, flash * 1.5) * flicker, k * 5.3, 1);
      const height = Math.max(0, w.y);
      const near = Math.max(0, 1 - height / F.spill.fadeHeight);
      const spillAt = w.clone().addScaledVector(axis, F.spill.behind * length);
      spillAt.y = F.spill.y;
      glows.setMatrixAt(TIPS.length + k, frameMatrix(spillAt, axis.clone().setY(0).normalize(), 1, F.spill.size));
      glowData.setXYZW(TIPS.length + k, 1, reducedMotion ? 0 : F.spill.intensity * strength * flash * near * flicker, 0, F.spill.stretch);
    });
    flames.instanceMatrix.needsUpdate = true;
    glows.instanceMatrix.needsUpdate = true;
    glowData.needsUpdate = true;
    const lightOn = !reducedMotion && lit;
    light.intensity = lightOn ? F.light.intensity * strength * flash * flicker : 0;
  });
  return null;
}
