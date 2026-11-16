#!/usr/bin/env node
/**
 * 9C: takes the parts we use from the donor model into one file, so they can all be removed
 * in one step (delete public/models/donor.opt.glb and the `donor` code paths). Repeatable:
 * `npm run prep:donor`.
 *
 *   Donor: "Ferrari F40 | www.vecarz.com" by Nic Cheung (https://sketchfab.com/heynic),
 *   CC BY 4.0, https://sketchfab.com/3d-models/ferrari-f40-wwwvecarzcom-ee082e412b0a4b2090e8492117841e95
 *   (copied untouched to assets-src/models/f40/donor-vecarz.glb). Modified: parts taken out,
 *   moved and scaled onto our car, textures resized and re-encoded.
 *
 *   1. bake every node's world transform into its vertices (the donor's model space)
 *   2. normalise to our car coordinates the way prep-body does ours: ONE uniform scale fitted
 *      to the real 2450 mm wheelbase (measured between the donor's tyre centres), wheelbase
 *      centred on z = 0, ground at y = 0
 *   3. wheels and brakes, per corner: tyre, rim and centre-lock nut → `wheel-<c>`, disc →
 *      `brake-disc-<c>`, caliper → `caliper-<c>`, each corner scaled about its wheel centre so
 *      the tyre has the DIMS diameter (17 in rim, 245/40 front, 335/35 rear), moved onto our
 *      wheel centre (the model's half track and axle, the tyre standing on the ground)
 *   4. badges, gauge faces and lamps (with only their own artwork): split into connected
 *      pieces, each placed on the panel it sits on (`badges__<panel>`, `lamps__<panel>`,
 *      `gauges__interior`), at the normalised position (+ a small offset onto our surface).
 *      The lamps (phase 9 fix-up): the rear tail / brake, indicator / reversing and fog lamps
 *      and the front indicators and side repeaters, with the donor's lens artwork
 *   5. textures → WebP, at most 1024 px (512 where it is never seen close)
 *   → public/models/donor.opt.glb, and a report on stdout (the scaling, sizes)
 *
 * The donor's raised pop-up pods are only a reference (scripts/dev/pod-fit.mjs fits our pods'
 * raise to them); our own pods are split from the body model (body-rules).
 *
 * Nothing is drawn, traced or generated: only artwork that ships in the donor is used.
 */
import { statSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, join, meshopt, prune, transformMesh } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { Box3, Matrix4, Vector3 } from 'three';
import { panelAt } from './body-rules.mjs';
import { DONOR } from './donor-rules.mjs';

const SRC = 'assets-src/models/f40/donor-vecarz.glb';
const OUT = 'public/models/donor.opt.glb';

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(SRC);
const root = doc.getRoot();
const scene = root.getDefaultScene() ?? root.listScenes()[0];
const report = [];
const log = (s) => (report.push(s), console.log(s));

// ─── 1. bake ──────────────────────────────────────────────────────────────────
const sources = new Map();
for (const node of root.listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  sources.set(node.getName(), { node, world: new Matrix4().fromArray(node.getWorldMatrix()), material: mesh.listPrimitives()[0]?.getMaterial()?.getName() ?? '' });
}

/** World-space box of a source node. */
function boxOf(name, extra = new Matrix4()) {
  const { node, world } = sources.get(name);
  const M = extra.clone().multiply(world);
  const box = new Box3();
  const v = new Vector3();
  for (const p of node.getMesh().listPrimitives()) {
    const a = p.getAttribute('POSITION');
    for (let i = 0; i < a.getCount(); i++) box.expandByPoint(v.fromArray(a.getElement(i, [])).applyMatrix4(M));
  }
  return box;
}

// ─── 2. normalise ─────────────────────────────────────────────────────────────
const tyres = [...sources.entries()].filter(([, s]) => s.material === DONOR.wheels.tyre).map(([n]) => n);
const centres = tyres.map((n) => boxOf(n).getCenter(new Vector3()));
const frontZ = Math.max(...centres.map((c) => c.z));
const rearZ = Math.min(...centres.map((c) => c.z));
const scale = DONOR.wheelbase / (frontZ - rearZ);
const N = new Matrix4().makeScale(scale, scale, scale).multiply(new Matrix4().makeTranslation(0, 0, -(frontZ + rearZ) / 2));
log(`Normalisation: donor wheelbase ${(frontZ - rearZ).toFixed(4)} m → ${DONOR.wheelbase} (× ${scale.toFixed(5)}), z shift ${(-(frontZ + rearZ) / 2).toFixed(4)} m`);

const quadrant = (c) => `${c.z >= 0 ? 'f' : 'r'}${c.x >= 0 ? 'l' : 'r'}`;
const out = new Map();
/** Adds a copy of a source node's mesh, transformed by M · world, under the output node `group`. */
function take(name, group, M = N) {
  const { node, world } = sources.get(name);
  const copy = node.getMesh().clone();
  transformMesh(copy, M.clone().multiply(world).elements);
  if (!out.has(group)) out.set(group, doc.createNode(group));
  out.get(group).addChild(doc.createNode(name).setMesh(copy));
}

// ─── 3. wheels and brakes ─────────────────────────────────────────────────────
const W = DONOR.wheels;
const byCorner = new Map();
for (const [name, s] of sources) {
  const role = Object.entries(W.roles).find(([, mat]) => mat === s.material)?.[0];
  if (!role) continue;
  const c = quadrant(boxOf(name, N).getCenter(new Vector3()));
  if (!byCorner.has(c)) byCorner.set(c, {});
  byCorner.get(c)[role] = name;
}
for (const [c, roles] of [...byCorner].sort()) {
  const axle = c[0] === 'f' ? 'front' : 'rear';
  const target = W.target[axle];
  const tyreBox = boxOf(roles.tyre, N);
  const centre = tyreBox.getCenter(new Vector3());
  const size = tyreBox.getSize(new Vector3());
  const diameter = (size.y + size.z) / 2;
  const k = target.diameter / diameter;
  const to = new Vector3((c[1] === 'l' ? 1 : -1) * target.centreX, target.diameter / 2, (c[0] === 'f' ? 1 : -1) * DONOR.wheelbase / 2);
  const M = new Matrix4().makeTranslation(to.x, to.y, to.z).multiply(new Matrix4().makeScale(k, k, k)).multiply(new Matrix4().makeTranslation(-centre.x, -centre.y, -centre.z)).multiply(N);
  for (const role of ['tyre', 'rim', 'nut']) if (roles[role]) take(roles[role], `wheel-${c}`, M);
  if (roles.disc) take(roles.disc, `brake-disc-${c}`, M);
  if (roles.caliper) take(roles.caliper, `caliper-${c}`, M);
  const disc = roles.disc ? boxOf(roles.disc, M).getSize(new Vector3()) : null;
  log(
    `wheel-${c}: tyre Ø ${(diameter * 1000).toFixed(1)} × ${(size.x * 1000).toFixed(1)} mm normalised → × ${k.toFixed(4)} = Ø ${(target.diameter * 1000).toFixed(1)} × ${(size.x * k * 1000).toFixed(1)} mm (DIMS ${target.widthMm} wide); ` +
      `centre (${centre.x.toFixed(3)}, ${centre.y.toFixed(3)}, ${centre.z.toFixed(3)}) → (${to.x.toFixed(3)}, ${to.y.toFixed(3)}, ${to.z.toFixed(3)})` +
      (disc ? `; disc Ø ${((Math.max(disc.y, disc.z)) * 1000).toFixed(0)} mm` : ''),
  );
}

// ─── 4. badges, gauges, lamps ────────────────────────────────────────────────
/** Splits a source node's mesh into connected pieces (welded by position), each a new mesh, transformed by M · world. */
function pieces(name, M = N) {
  const { node, world } = sources.get(name);
  const result = [];
  const MW = M.clone().multiply(world);
  for (const prim of node.getMesh().listPrimitives()) {
    const pos = prim.getAttribute('POSITION');
    const idx = prim.getIndices()?.getArray() ?? Uint32Array.from({ length: pos.getCount() }, (_, i) => i);
    const key = (i) => pos.getElement(i, []).map((v) => Math.round(v * 1e5)).join(',');
    const weld = new Map();
    const id = new Int32Array(pos.getCount());
    for (let i = 0; i < pos.getCount(); i++) {
      const k = key(i);
      if (!weld.has(k)) weld.set(k, weld.size);
      id[i] = weld.get(k);
    }
    const parent = Int32Array.from({ length: weld.size }, (_, i) => i);
    const find = (a) => (parent[a] === a ? a : (parent[a] = find(parent[a])));
    for (let t = 0; t < idx.length; t += 3) {
      const a = find(id[idx[t]]);
      parent[find(id[idx[t + 1]])] = a;
      parent[find(id[idx[t + 2]])] = a;
    }
    const groups = new Map();
    for (let t = 0; t < idx.length; t += 3) {
      const r = find(id[idx[t]]);
      if (!groups.has(r)) groups.set(r, []);
      groups.get(r).push(idx[t], idx[t + 1], idx[t + 2]);
    }
    const uv = prim.getAttribute('TEXCOORD_0');
    for (const tris of groups.values()) {
      const c = new Vector3();
      const v = new Vector3();
      const t = [0, 0];
      for (const i of tris) {
        c.add(v.fromArray(pos.getElement(i, [])).applyMatrix4(MW));
        if (uv) uv.getElement(i, []).forEach((x, k) => (t[k] += x / tris.length));
      }
      c.divideScalar(tris.length);
      result.push({ prim, tris, centroid: c, uv: t });
    }
  }
  return { MW, list: result };
}

/** A new node holding the given triangles of a primitive (re-indexed, compacted later by prune/dedup). */
function nodeFromTris(name, prim, tris, MW) {
  const p = prim.clone();
  p.setIndices(doc.createAccessor().setType('SCALAR').setArray(Uint32Array.from(tris)));
  const mesh = doc.createMesh(name).addPrimitive(p);
  transformMesh(mesh, MW.elements);
  return doc.createNode(name).setMesh(mesh);
}

/** Flips a primitive's v texture coordinates (once per accessor: pieces of one mesh share it). */
const flipped = new Set();
function flipV(prim) {
  const uv = prim.getAttribute('TEXCOORD_0');
  if (!uv || flipped.has(uv)) return;
  flipped.add(uv);
  const a = uv.getArray();
  for (let i = 1; i < a.length; i += 2) a[i] = 1 - a[i];
}

const placed = {};
const skipped = {};
for (const [kind, rule] of Object.entries(DONOR.accessories)) {
  for (const [name, s] of sources) {
    const wanted = rule.nodes ? rule.nodes.includes(name) : rule.materials.includes(s.material);
    if (!wanted || rule.skip?.includes(name)) continue;
    const { MW, list } = pieces(name);
    if (rule.flipV) for (const p of sources.get(name).node.getMesh().listPrimitives()) flipV(p);
    list.forEach((piece, i) => {
      // Pieces left out (the donor's own fixed needles).
      const skip = rule.skipPieces;
      if (skip && piece.tris.length / 3 <= skip.maxTris && Math.hypot(piece.uv[0] - skip.uv[0], piece.uv[1] - skip.uv[1]) < skip.within) {
        skipped[kind] = (skipped[kind] ?? 0) + 1;
        return;
      }
      const panel = rule.panel ?? panelAt(piece.centroid);
      const group = `${kind}__${panel}`;
      if (!out.has(group)) out.set(group, doc.createNode(group));
      const offset = rule.offset?.[panel];
      const M = offset ? new Matrix4().makeTranslation(...offset).multiply(MW) : MW;
      out.get(group).addChild(nodeFromTris(`${name}_${i}`, piece.prim, piece.tris, M));
      placed[group] = (placed[group] ?? 0) + piece.tris.length / 3;
    });
  }
}
for (const [g, n] of Object.entries(placed).sort()) log(`${g}: ${n} triangles`);
for (const [k, n] of Object.entries(skipped)) log(`${k}: ${n} pieces left out`);

// ─── keep only what we took ───────────────────────────────────────────────────
for (const child of scene.listChildren()) scene.removeChild(child);
for (const node of out.values()) scene.addChild(node);
await doc.transform(prune(), dedup());

// ─── tyres: matte rubber, and a tread normal map from the donor's own tread texture ─────────
// The donor gives its tyres a metal / roughness map that makes them mirror-like (fully
// metallic, roughness ≤ 0.3) and no normal map. The normal map is derived from the tread's
// base colour (brightness as height, Sobel slopes), so it only carries the donor's own pattern.
const tyreMat = root.listMaterials().find((m) => m.getName() === DONOR.wheels.tyre);
if (tyreMat) {
  const base = tyreMat.getBaseColorTexture();
  const { data, info } = await sharp(base.getImage()).greyscale().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const at = (x, y) => data[((y + h) % h) * w + ((x + w) % w)] / 255;
  const nm = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1)) * DONOR.tread.strength;
      const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1)) * DONOR.tread.strength;
      const n = new Vector3(-dx, dy, 1).normalize();
      nm.set([Math.round((n.x * 0.5 + 0.5) * 255), Math.round((n.y * 0.5 + 0.5) * 255), Math.round((n.z * 0.5 + 0.5) * 255)], (y * w + x) * 3);
    }
  const png = await sharp(nm, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
  tyreMat.setNormalTexture(doc.createTexture('tread-normal').setImage(png).setMimeType('image/png'));
  tyreMat.setMetallicRoughnessTexture(null).setMetallicFactor(0).setRoughnessFactor(DONOR.tread.roughness);
  log(`tyres: metal / roughness map dropped (metallic 0, roughness ${DONOR.tread.roughness}); tread normal map ${w}×${h} derived from the tread texture`);
}
await doc.transform(prune());

// ─── 5. textures ─────────────────────────────────────────────────────────────
const small = new Set(DONOR.smallTextures);
for (const tex of root.listTextures()) {
  const users = tex.listParents().filter((p) => p.propertyType === 'Material').map((m) => m.getName());
  const max = users.some((u) => small.has(u)) ? 512 : 1024;
  const meta = await sharp(tex.getImage()).metadata();
  const f = Math.min(1, max / Math.max(meta.width, meta.height));
  const img = await sharp(tex.getImage()).resize(Math.round(meta.width * f), Math.round(meta.height * f)).webp({ quality: 82 }).toBuffer();
  tex.setImage(img).setMimeType('image/webp');
  log(`texture (${users.join(', ')}): ${meta.width}×${meta.height} → ${Math.round(meta.width * f)}×${Math.round(meta.height * f)} WebP ${(img.byteLength / 1024).toFixed(0)} KB`);
}
doc.createExtension(ALL_EXTENSIONS.find((E) => E.EXTENSION_NAME === 'EXT_texture_webp')).setRequired(true);
// One mesh per material per output node (the pieces were split only to place them).
await doc.transform(join({ keepNamed: false }), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(OUT, doc);
log(`→ ${OUT}: ${(statSync(OUT).size / 1024).toFixed(0)} KB`);
