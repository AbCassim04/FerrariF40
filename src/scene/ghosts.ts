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

/** 9B: the pipes the gas flows through; with Flow on they turn to ghosts so the flow inside shows (not the turbos: their nested housings stack into a glare). */
export const FLOW_PARTS = new Set(
  ['exhaust-manifold', 'downpipe', 'wastegate', 'turbo-inlet', 'charge-pipes', 'intercooler'].flatMap((id) => [`${id}-l`, `${id}-r`]).concat(['silencer', 'tailpipes', 'wastegate-pipe', 'intake-plenum', 'intake-runners-l', 'intake-runners-r', 'throttle-bodies']),
);

/** The ghost a mesh wears, if any. Inspecting outranks X-ray. While the engine runs, X-ray also sees through its casings; with Flow on, through the pipes. */
function ghostFor(def: PartDef, mesh: Mesh, xray: boolean, selectedId: string | null, running: boolean, flow: boolean): GhostKind | null {
  if (selectedId) return def.id === selectedId ? null : 'isolate';
  if (!xray) return null;
  if (flow && FLOW_PARTS.has(def.id)) return 'flow';
  // Phase 5B: the frame shows as a skeleton through whatever is in front of it.
  if (def.group === 'frame') return 'frame';
  return isXrayPart(def) || (running && mesh.userData.xrayShell) ? 'xray' : null;
}

const COOL = new Color(SCENE.ghosts.xray.cool);

/**
 * Almost clear where a surface faces the camera, glowing at its silhouette (fresnel),
 * added on top of what's behind: stacked shells read as a light outline instead of
 * piling up into an opaque tint. Tinted with the surface's own colour mixed toward a
 * cool white, so dark parts still show.
 */
function ghostMaterial(colour: Color, kind: GhostKind, vertexColors: boolean) {
  const style = SCENE.ghosts[kind];
  return new ShaderMaterial({
    uniforms: {
      tint: { value: colour.clone().lerp(COOL, style.tintMix) },
      cool: { value: COOL },
      tintMix: { value: style.tintMix },
      base: { value: style.base },
      rim: { value: style.rim },
    },
    // Merged model meshes carry their colours per vertex: tint each vertex as its own material would.
    vertexColors,
    vertexShader: /* glsl */ `
      #include <common>
      uniform vec3 tint;
      uniform vec3 cool;
      uniform float tintMix;
      varying vec3 vNormal;
      varying vec3 vView;
      varying vec3 vTint;
      void main() {
        #include <beginnormal_vertex>
        #include <defaultnormal_vertex>
        #include <begin_vertex>
        #include <project_vertex>
        vNormal = normalize(transformedNormal);
        vView = normalize(-mvPosition.xyz);
        #ifdef USE_COLOR
          vTint = mix(color, cool, tintMix);
        #else
          vTint = tint;
        #endif
      }`,
    fragmentShader: /* glsl */ `
      uniform float base;
      uniform float rim;
      varying vec3 vNormal;
      varying vec3 vView;
      varying vec3 vTint;
      void main() {
        float f = 1.0 - abs(dot(normalize(vNormal), normalize(vView)));
        gl_FragColor = vec4(vTint * (base + rim * f * f * f), 1.0);
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
    // The frame's skeleton is seen through solid parts too.
    depthTest: !('noDepth' in style && style.noDepth),
  });
}

const ghosts = new Map<Material, Partial<Record<GhostKind, Material>>>();
const originals = new Map<Mesh, { material: Material | Material[]; castShadow: boolean }>();

function ghostOf(m: Material, kind: GhostKind) {
  const byKind = ghosts.get(m) ?? {};
  ghosts.set(m, byKind);
  return (byKind[kind] ??= ghostMaterial((m as MeshStandardMaterial).color ?? COOL, kind, !!m.userData.ghostVertexColors));
}

/** Puts every part in the right state: solid, an X-ray ghost or an isolation ghost. */
export function applyGhosts(xray: boolean, selectedId: string | null, running = false, flow = false) {
  for (const def of PARTS) {
    partObjects.get(def.id)?.content.traverse((o) => {
      const mesh = o as Mesh;
      // Effects riding on a part (the flames) keep their own material.
      if (!mesh.isMesh || mesh.userData.effect) return;
      const kind = ghostFor(def, mesh, xray, selectedId, running, flow);
      let original = originals.get(mesh);
      if (!kind) {
        if (original) {
          mesh.material = original.material;
          // Phase 5: scene/Enclosed.tsx may have taken the mesh out of the shadow passes (or put it back) meanwhile.
          mesh.userData.ghosted = false;
          mesh.castShadow = mesh.userData.noShadow ? false : (mesh.userData.castWanted ?? original.castShadow);
          originals.delete(mesh);
        }
        return;
      }
      if (!original) {
        original = { material: mesh.material, castShadow: mesh.castShadow };
        originals.set(mesh, original);
        mesh.userData.ghosted = true;
      }
      const m = original.material;
      mesh.material = Array.isArray(m) ? m.map((x) => ghostOf(x, kind)) : ghostOf(m, kind);
      mesh.castShadow = false;
    });
  }
}
