import type { MeshStandardMaterial } from 'three';
import { ENGINE_SIM } from '../config/engine-sim';

const G = ENGINE_SIM.glow;
const f = (n: number) => n.toFixed(4);
const vec3 = (v: readonly number[]) => `vec3(${v.map(f).join(', ')})`;

/** Heat level of the exhaust side, 0…1 (set every frame the engine runs; 0 = no glow at all). */
export const heatUniform = { value: 0 };

/**
 * Hot-metal glow on an exhaust material: emissive radiance from a blackbody-like ramp,
 * stronger at the primaries and turbine housings and fading down the downpipes (by position
 * in engine coordinates: the parts are built there, and exploding moves them as a whole).
 * The base colour, roughness and reflections are untouched, so the metal shows through.
 */
export function addHeatGlow(m: MeshStandardMaterial) {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uHeat = heatUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vHeatPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHeatPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
uniform float uHeat;
varying vec3 vHeatPos;
float heatWeight(vec3 p) {
  float primaries = 1.0 - ${G.primaries.drop.toFixed(3)} * smoothstep(${G.primaries.from.toFixed(3)}, ${G.primaries.to.toFixed(3)}, p.z);
  float down = mix(1.0, ${G.down.floor.toFixed(3)}, smoothstep(${G.down.from.toFixed(3)}, ${G.down.to.toFixed(3)}, p.z));
  return primaries * down;
}
vec3 blackbody(float t) {
  vec3 c = mix(${vec3(G.darkRed)}, ${vec3(G.cherry)}, smoothstep(${f(G.cherryAt[0])}, ${f(G.cherryAt[1])}, t));
  c = mix(c, ${vec3(G.orange)}, smoothstep(${f(G.orangeAt[0])}, ${f(G.orangeAt[1])}, t));
  return c * pow(t, ${G.power.toFixed(2)}) * ${G.peak.toFixed(3)};
}`,
      )
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nfloat heatT = uHeat > 0.0 ? uHeat * heatWeight(vHeatPos) : 0.0;\ntotalEmissiveRadiance += heatT > 0.0 ? blackbody(heatT) : vec3(0.0);')
      // Hot metal dulls: less of the studio in its reflections, so the glow reads as heat.
      .replace(
        '#include <aomap_fragment>',
        `reflectedLight.indirectSpecular *= 1.0 - ${f(G.dull.reflections)} * heatT;
reflectedLight.directSpecular *= 1.0 - ${f(G.dull.highlights)} * heatT;
reflectedLight.directDiffuse *= 1.0 - ${f(G.dull.diffuse)} * heatT;
reflectedLight.indirectDiffuse *= 1.0 - ${f(G.dull.diffuse)} * heatT;
#include <aomap_fragment>`,
      );
  };
  m.customProgramCacheKey = () => 'heat-glow';
  return m;
}
