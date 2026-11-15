import type { MeshStandardMaterial } from 'three';
import { DIMS } from '../config/dims';
import { ENGINE_SIM } from '../config/engine-sim';

/**
 * 9C brake glow: hard braking heats the discs' friction rings, which glow on the same
 * blackbody-like ramp as the exhaust (dark red → cherry → orange), front and rear apart (the
 * front brakes do most of the work). Only the ring the pads sweep glows (by distance from the
 * axle). Heat model
 * and figures: ENGINE_SIM.brakes (est).
 */

export type Axle = 'front' | 'rear';
const G = ENGINE_SIM.glow;
const B = ENGINE_SIM.brakes;
const f = (n: number) => n.toFixed(4);
const vec3 = (v: readonly number[]) => `vec3(${v.map(f).join(', ')})`;

/** Glow level 0…1 per axle (0 = none; set by the brake heat model every frame). */
export const brakeGlow: Record<Axle, { value: number }> = { front: { value: 0 }, rear: { value: 0 } };

export function addBrakeGlow(m: MeshStandardMaterial, axle: Axle) {
  const w = DIMS.wheel[axle];
  const ring = [(w.discDiameter / 2) * B.ring[0], (w.discDiameter / 2) * B.ring[1]];
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uBrakeHeat = brakeGlow[axle];
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vDiscYZ;')
      // World y, z: the donor meshes are quantised (their node scales them back), and a disc
      // only ever moves sideways (the explode) or turns about its axle, so y, z stay put.
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDiscYZ = (modelMatrix * vec4(transformed, 1.0)).yz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
uniform float uBrakeHeat;
varying vec2 vDiscYZ;
vec3 brakeBlackbody(float t) {
  vec3 c = mix(${vec3(G.darkRed)}, ${vec3(G.cherry)}, smoothstep(${f(G.cherryAt[0])}, ${f(G.cherryAt[1])}, t));
  c = mix(c, ${vec3(G.orange)}, smoothstep(${f(G.orangeAt[0])}, ${f(G.orangeAt[1])}, t));
  return c * pow(t, ${G.power.toFixed(2)}) * ${f(B.peak)};
}`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
float discR = length(vDiscYZ - vec2(${f(w.radius)}, ${f(w.axleZ)}));
float brakeT = uBrakeHeat > 0.0 ? uBrakeHeat * smoothstep(${f(ring[0] - 0.008)}, ${f(ring[0] + 0.008)}, discR) * (1.0 - smoothstep(${f(ring[1] - 0.004)}, ${f(ring[1] + 0.004)}, discR)) : 0.0;
totalEmissiveRadiance += brakeT > 0.0 ? brakeBlackbody(brakeT) : vec3(0.0);`,
      );
  };
  m.customProgramCacheKey = () => `brake-glow-${axle}`;
  return m;
}
