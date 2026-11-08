import { AdditiveBlending, Color, DoubleSide, ShaderMaterial, type Material, type Mesh, type MeshStandardMaterial } from 'three';
import { PARTS } from '../parts/registry';
import type { PartDef } from '../parts/types';
import { partObjects } from './partObjects';

/** X-ray: body panels and the tub go see-through in place; wheels and brakes stay solid. */
export const isXrayPart = (def: PartDef) => def.source === 'model' && def.group !== 'wheels' && def.group !== 'suspension';

/** Ghost tint: each panel's own colour, mixed toward a cool white so dark panels still show. */
const COOL = new Color('#a9c8dc');
const TINT_MIX = 0.25;

/**
 * Ghost shell: almost clear where a panel faces the camera, glowing at its silhouette
 * (fresnel), added on top of what's behind. Many stacked panels then still read as a
 * light outline of the car instead of piling up into an opaque tint.
 */
function ghostMaterial(colour: Color) {
  return new ShaderMaterial({
    uniforms: { tint: { value: colour.clone().lerp(COOL, TINT_MIX) }, base: { value: 0.008 }, rim: { value: 0.34 } },
    vertexShader: /* glsl */ `
      #include <common>
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        #include <begin_vertex>
        #include <project_vertex>
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mvPosition.xyz);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 tint;
      uniform float base;
      uniform float rim;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float f = 1.0 - abs(dot(normalize(vNormal), normalize(vView)));
        gl_FragColor = vec4(tint * (base + rim * f * f * f), 1.0);
      }`,
    transparent: true,
    // Not drawn with it (the shader writes its own alpha); marks the ghost as see-through for picking.
    opacity: 0,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  });
}

const ghosts = new Map<Material, Material>();
const originals = new Map<Mesh, { material: Material | Material[]; castShadow: boolean }>();

function ghostOf(m: Material) {
  let g = ghosts.get(m);
  if (!g) {
    g = ghostMaterial((m as MeshStandardMaterial).color ?? COOL);
    ghosts.set(m, g);
  }
  return g;
}

/** Swaps the X-ray parts' materials for ghost shells (or back). */
export function applyXray(on: boolean) {
  for (const def of PARTS) {
    if (!isXrayPart(def)) continue;
    partObjects.get(def.id)?.content.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      if (on && !originals.has(mesh)) {
        originals.set(mesh, { material: mesh.material, castShadow: mesh.castShadow });
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(ghostOf) : ghostOf(mesh.material);
        mesh.castShadow = false;
      } else if (!on && originals.has(mesh)) {
        const { material, castShadow } = originals.get(mesh)!;
        mesh.material = material;
        mesh.castShadow = castShadow;
        originals.delete(mesh);
      }
    });
  }
}
