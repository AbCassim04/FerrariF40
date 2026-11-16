import { useGLTF } from '@react-three/drei';
import { Group, MeshStandardMaterial, type Mesh, type Object3D } from 'three';
import { asset } from '../lib/asset';
import type { Vec3 } from '../config/dims';
import { LIGHTS } from '../config/details';
import { addBrakeGlow, type Axle } from '../materials/brakeGlow';

/**
 * 9C: parts taken from the donor model ("Ferrari F40 | www.vecarz.com" by Nic Cheung, CC BY 4.0,
 * modified), prepped by scripts/prep-donor.mjs into car coordinates. Its top-level nodes are
 * named for where they go:
 *   - `<part id>`: replaces that body-model part's own meshes (the wheels, the brake discs) or
 *     is a part of its own (the calipers);
 *   - `<kind>__<part id>`: added to that part (badges on their panels, gauge faces in the
 *     cockpit), so they ride with it in the explode;
 *   - `pod-<s>`: the pop-up pods' lenses and lamp faces (see engine/Lights.tsx).
 * Everything donor-derived is in that one file and reaches the scene only through here.
 */
export const DONOR_URL = asset('models/donor.opt.glb');

useGLTF.preload(DONOR_URL);

/** The body model's materials the donor replaces, per part ('*' = every part). */
const REPLACED: Record<string, string[]> = {
  '*': ['F40_Logos'],
  interior: ['super_gauges', 'F40_Strelki'],
  // Phase 9 fix-up: the donor's lamps with real lenses replace the flat ones (the rear fogs
  // are pieces of F40_Vehiclelight there: see REPLACED_REGIONS).
  'rear-clam': ['super_brakelight', 'super_reverselight', 'super_signal_L'],
  'front-clam': ['super_signal_L', 'F40_Vehiclelight'],
};

export const replacedMaterials = (partId: string) => new Set([...(REPLACED['*'] ?? []), ...(REPLACED[partId] ?? [])]);

/** Body-model triangles the donor replaces where the material also covers other things (car coordinates). */
export interface ReplacedRegion {
  material: string;
  min: Vec3;
  max: Vec3;
}
/** The rear clam's F40_Vehiclelight is the bumper's two fog lamps (replaced) and the number-plate lamps (kept). */
const REPLACED_REGIONS: Record<string, ReplacedRegion[]> = {
  'rear-clam': [
    { material: 'F40_Vehiclelight', min: [0.6, 0.3, -2.1], max: [0.82, 0.42, -1.95] },
    { material: 'F40_Vehiclelight', min: [-0.82, 0.3, -2.1], max: [-0.6, 0.42, -1.95] },
  ],
};
export const replacedRegions = (partId: string) => REPLACED_REGIONS[partId] ?? [];

const tuned = new WeakSet<object>();

export function useDonor() {
  const gltf = useGLTF(DONOR_URL, false, true);
  const nodes = gltf.nodes as Record<string, Object3D>;
  if (!tuned.has(nodes)) {
    tuned.add(nodes);
    tune(nodes);
  }
  return nodes;
}

const LENS = LIGHTS.lens;
const f = (n: number) => n.toFixed(4);

/** Phase 9 fix-up: how bright each lamp role glows now (set by engine/Lights.tsx every frame). */
export const lampLevels = { uTail: { value: 0 }, uInd: { value: 0 }, uRev: { value: 0 }, uFog: { value: 0 } };

/**
 * Lamp lenses from the donor's lamp atlases (rear: material_7, front: material_14), by atlas
 * region. Rear atlas (v flipped, as prepped): the red round lens (u < 0.5, v > 0.5: tail and
 * brake), the amber one (u > 0.5, v > 0.5: indicator) with its clear centre (reversing), the
 * red rectangle (v 0.2–0.5: rear fog) and the plain strips the lamps' barrels map to (v < 0.2:
 * amber left, red right). Front atlas: the indicator rectangle and the round side repeater.
 * Unlit: deep coloured glass with a reflector behind it (a parallax copy of the lens pattern,
 * view directions from screen-space derivatives). Lit: a glow from the bulb behind the centre,
 * in the lens's own colour. One draw per atlas per panel, as the donor's other pieces.
 */
function lampMaterial(src: MeshStandardMaterial, atlas: 'rear' | 'front') {
  const m = src.clone();
  // material_14 carries its artwork in the emissive map (its base map is an alpha mask), with a
  // texture transform (v + 0.14) that doesn't fit the prepped UVs (checked by ray hits on the
  // indicator: its face maps straight onto the amber rectangle). Its own texture is reset: the
  // donor's material is never drawn (a clone of the texture uploaded black).
  if (atlas === 'front' && src.emissiveMap) {
    m.map = src.emissiveMap;
    m.map.offset.set(0, 0);
    m.map.repeat.set(1, 1);
    m.map.rotation = 0;
  }
  Object.assign(m, { emissiveMap: null, alphaMap: null, metalnessMap: null, roughnessMap: null, transparent: false, opacity: 1, depthWrite: true, metalness: 0, roughness: LENS.roughness });
  m.color.set('#ffffff');
  m.emissive.set('#000000');
  m.name = `lamp-lens-${atlas}`;
  const regions =
    atlas === 'rear'
      ? `if (luv.y < 0.2) { face = 0.0; level = luv.x < 0.5 ? uInd : uTail; }
         else if (luv.y < 0.5) { lc = vec2(0.295, 0.35); lr = vec2(0.28, 0.14); level = uFog; }
         else if (luv.x < 0.5) { lc = vec2(0.25, 0.75); lr = vec2(0.24); level = uTail; }
         else { lc = vec2(0.75, 0.75); lr = vec2(0.24); level = length(luv - lc) < 0.105 ? uRev : uInd; }`
      : `if (luv.y > 0.4) { lc = vec2(0.87, 0.527); lr = vec2(0.1); } else { lc = vec2(0.645, 0.2); lr = vec2(0.24, 0.13); }
         level = uInd;`;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, lampLevels);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTail;\nuniform float uInd;\nuniform float uRev;\nuniform float uFog;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
vec3 lensTex = diffuseColor.rgb;
diffuseColor.rgb = pow(lensTex, vec3(${f(LENS.deep)})) * ${f(LENS.body)};`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
{
  vec2 luv = vMapUv;
  // The view in the lens's own (u, v) frame, from screen-space derivatives (before any branch).
  vec3 lp = -vViewPosition;
  vec3 ldp1 = dFdx(lp);
  vec3 ldp2 = dFdy(lp);
  vec2 lduv1 = dFdx(luv);
  vec2 lduv2 = dFdy(luv);
  vec3 lN = normalize(normal);
  vec3 lT = cross(ldp2, lN) * lduv1.x + cross(lN, ldp1) * lduv2.x;
  vec3 lB = cross(ldp2, lN) * lduv1.y + cross(lN, ldp1) * lduv2.y;
  float linv = inversesqrt(max(max(dot(lT, lT), dot(lB, lB)), 1e-20));
  vec3 lV = normalize(vViewPosition);
  vec2 lpar = vec2(dot(lV, lT), dot(lV, lB)) * linv / max(abs(dot(lV, lN)), 0.3);
  vec2 lc = vec2(0.5);
  vec2 lr = vec2(1.0);
  float level = 0.0;
  float face = 1.0;
  ${regions}
  vec2 q = (luv - lc) / lr;
  // The reflector behind: the lens pattern magnified, seen deeper (it slides against the ribs).
  vec2 qIn = q - lpar * ${f(LENS.depth)};
  vec2 uvIn = lc + qIn * lr / ${f(LENS.magnify)};
  vec3 inner = textureGrad(map, uvIn, lduv1 / ${f(LENS.magnify)}, lduv2 / ${f(LENS.magnify)}).rgb;
  float bowl = 1.0 - smoothstep(0.55, 1.05, length(qIn));
  vec3 hue = lensTex / max(max(lensTex.r, max(lensTex.g, lensTex.b)), 0.15);
  float lum = dot(inner, vec3(0.2126, 0.7152, 0.0722));
  vec2 qb = q - lpar * ${f(LENS.depth * 0.7)};
  float bulb = mix(${f(LENS.bulb.rim)}, 1.0, exp(-dot(qb, qb) * ${f(LENS.bulb.width)}));
  totalEmissiveRadiance += face * inner * inner * bowl * ${f(LENS.ambient)};
  totalEmissiveRadiance += hue * level * mix(0.35, bulb * (0.65 + 0.7 * lum), face);
}`,
      );
  };
  m.customProgramCacheKey = () => `lamp-lens-${atlas}`;
  return m;
}

/** Brake discs: one material per axle, each with its own glow (front and rear heat differ). Lamps: their lens material. */
function tune(nodes: Record<string, Object3D>) {
  const lamps = new Map<string, MeshStandardMaterial>();
  for (const [name, node] of Object.entries(nodes)) {
    if (!/^lamps__/.test(name)) continue;
    node.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      const src = mesh.material as MeshStandardMaterial;
      if (!lamps.has(src.uuid)) lamps.set(src.uuid, lampMaterial(src, src.name === 'material_14' ? 'front' : 'rear'));
      mesh.material = lamps.get(src.uuid)!;
    });
  }
  const perAxle = new Map<string, MeshStandardMaterial>();
  for (const [name, node] of Object.entries(nodes)) {
    const m = /^brake-disc-([fr])[lr]$/.exec(name);
    if (!m) continue;
    const axle: Axle = m[1] === 'f' ? 'front' : 'rear';
    node.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      const src = mesh.material as MeshStandardMaterial;
      const key = `${axle}:${src.uuid}`;
      if (!perAxle.has(key)) perAxle.set(key, addBrakeGlow(src.clone(), axle));
      mesh.material = perAxle.get(key)!;
    });
  }
  // Wheels and brakes cast shadows; the badges and gauge faces are flat on their panels.
  // (Top-level nodes only: `nodes` also lists every child by its own name.)
  for (const [name, node] of Object.entries(nodes).filter(([n]) => /^(wheel|brake-disc|caliper)-|__/.test(n)))
    node.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      mesh.receiveShadow = true;
      mesh.castShadow = /^(wheel|brake-disc|caliper)-/.test(name);
    });
}

/** What the donor gives a body part: a replacement (`replace`), and additions riding on it. */
export function donorFor(nodes: Record<string, Object3D>, partId: string) {
  const replace = nodes[partId] ?? null;
  const extras = Object.keys(nodes).filter((k) => k.endsWith(`__${partId}`));
  return { replace, extras: extras.map((k) => nodes[k]) };
}

/** A part's own copy of a donor node (geometry and materials shared). */
export function donorCopy(node: Object3D) {
  const g = new Group();
  g.name = node.name;
  for (const c of node.children) g.add(c.clone(true));
  return g;
}
