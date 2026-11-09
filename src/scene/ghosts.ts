import { AdditiveBlending, Color, DoubleSide, ShaderMaterial, type Material, type Mesh, type MeshStandardMaterial } from 'three';
import { SCENE } from '../config/scene';
import { PARTS } from '../parts/registry';
import type { PartDef } from '../parts/types';
import { partObjects } from './partObjects';

/**
 * Ghost shells: X-ray turns the body panels into them (packaging in place), and while a
 * part is inspected every other part becomes one, so the inspected part is never buried.
 */
export type GhostKind = keyof typeof SCENE.ghosts;

/** X-ray: body panels and the tub; wheels and brakes stay solid. */
const isXrayPart = (def: PartDef) => def.source === 'model' && def.group !== 'wheels' && def.group !== 'suspension';

/** The ghost a part wears, if any. Inspecting outranks X-ray. */
function ghostFor(def: PartDef, xray: boolean, selectedId: string | null): GhostKind | null {
  if (selectedId) return def.id === selectedId ? null : 'isolate';
  return xray && isXrayPart(def) ? 'xray' : null;
}

const COOL = new Color(SCENE.ghosts.xray.cool);

/**
 * Almost clear where a surface faces the camera, glowing at its silhouette (fresnel),
 * added on top of what's behind: stacked shells read as a light outline instead of
 * piling up into an opaque tint. Tinted with the surface's own colour mixed toward a
 * cool white, so dark parts still show.
 */
function ghostMaterial(colour: Color, kind: GhostKind) {
  const style = SCENE.ghosts[kind];
  return new ShaderMaterial({
    uniforms: {
      tint: { value: colour.clone().lerp(COOL, style.tintMix) },
      base: { value: style.base },
      rim: { value: style.rim },
    },
    vertexShader: /* glsl */ `
      #include <common>
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        #include <beginnormal_vertex>
        #include <defaultnormal_vertex>
        #include <begin_vertex>
        #include <project_vertex>
        vNormal = normalize(transformedNormal);
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
    // Not drawn with it (the shader writes its own colour); marks the ghost as see-through
    // for picking.
    opacity: 0,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    // Additive needs no back-to-front order; three would otherwise draw double-sided
    // transparent meshes twice (back faces, then front), doubling the ghosts' draw calls.
    forceSinglePass: true,
  });
}

const ghosts = new Map<Material, Partial<Record<GhostKind, Material>>>();
const originals = new Map<Mesh, { material: Material | Material[]; castShadow: boolean }>();

function ghostOf(m: Material, kind: GhostKind) {
  const byKind = ghosts.get(m) ?? {};
  ghosts.set(m, byKind);
  return (byKind[kind] ??= ghostMaterial((m as MeshStandardMaterial).color ?? COOL, kind));
}

/** Puts every part in the right state: solid, an X-ray ghost or an isolation ghost. */
export function applyGhosts(xray: boolean, selectedId: string | null) {
  for (const def of PARTS) {
    const kind = ghostFor(def, xray, selectedId);
    partObjects.get(def.id)?.content.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      let original = originals.get(mesh);
      if (!kind) {
        if (original) {
          mesh.material = original.material;
          mesh.castShadow = original.castShadow;
          originals.delete(mesh);
        }
        return;
      }
      if (!original) {
        original = { material: mesh.material, castShadow: mesh.castShadow };
        originals.set(mesh, original);
      }
      const m = original.material;
      mesh.material = Array.isArray(m) ? m.map((x) => ghostOf(x, kind)) : ghostOf(m, kind);
      mesh.castShadow = false;
    });
  }
}
