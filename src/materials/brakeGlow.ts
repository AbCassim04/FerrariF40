import type { MeshStandardMaterial } from 'three';
import { DIMS } from '../config/dims';
import { ENGINE_SIM } from '../config/engine-sim';

/**
 * Brake glow (9C; reworked in the phase 9 fix-up the way the exhaust's heat glow was in 8D):
 * hard braking heats the discs' friction rings, which glow as hot metal on the exhaust's
 * blackbody-like ramp (dark red → cherry → orange only near the top), front and rear apart.
 *
 *   - Only the ring the pads sweep glows, by distance from the axle; across it the temperature
 *     peaks mid-ring and falls toward the hub and the outer edge (`ENGINE_SIM.brakes.profile`).
 *   - The disc's own texture modulates its brightness (vents, grooves and drillings stay
 *     darker), and the metal stays lit underneath: its lighting only dulls partly with heat, as
 *     on the exhaust, so it reads as glowing metal rather than red paint.
 *   - Nothing at all below the glow threshold (the heat model's `from`): a cool disc is the
 *     plain donor disc.
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
  const R = w.discDiameter / 2;
  const ring = [R * B.ring[0], R * B.ring[1]];
  const mid = (ring[0] + ring[1]) / 2;
  const half = (ring[1] - ring[0]) / 2;
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
float brakeT = 0.0;
float brakeSurface = 1.0;
if (uBrakeHeat > 0.0) {
  // Across the friction ring: hottest mid-ring, cooler toward the hub and the rim, nothing off it.
  float x = (length(vDiscYZ - vec2(${f(w.radius)}, ${f(w.axleZ)})) - ${f(mid)}) / ${f(half)};
  float across = clamp(1.0 - pow(abs(x), ${f(B.profile.power)}) * ${f(1 - B.profile.edge)}, 0.0, 1.0) * (1.0 - smoothstep(0.92, 1.06, abs(x)));
  brakeT = uBrakeHeat * across;
  // The disc's own surface: its darker drillings and grooves glow less (they are holes or recessed).
  float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
  brakeSurface = mix(${f(B.texture.min)}, 1.0, smoothstep(${f(B.texture.dark)}, ${f(B.texture.bright)}, lum));
}
totalEmissiveRadiance += brakeT > 0.0 ? brakeBlackbody(brakeT) * brakeSurface : vec3(0.0);`,
      )
      // Hot metal dulls a little (as the exhaust): its own finish stays visible under the glow.
      .replace(
        '#include <aomap_fragment>',
        `reflectedLight.indirectSpecular *= 1.0 - ${f(G.dull.reflections)} * brakeT;
reflectedLight.directSpecular *= 1.0 - ${f(G.dull.highlights)} * brakeT;
reflectedLight.directDiffuse *= 1.0 - ${f(G.dull.diffuse)} * brakeT;
reflectedLight.indirectDiffuse *= 1.0 - ${f(G.dull.diffuse)} * brakeT;
#include <aomap_fragment>`,
      );
  };
  m.customProgramCacheKey = () => `brake-glow-${axle}`;
  return m;
}
