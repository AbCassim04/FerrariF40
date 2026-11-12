#!/usr/bin/env node
/**
 * Prepares the licensed body model for the app. Repeatable: `npm run prep:body`.
 * Car-specific inputs (source, normalisation, segmentation, measurements) live in
 * scripts/body-rules.mjs; this script is the pipeline.
 *
 *   assets-src/… (original, never modified; kept out of public/ so it is never shipped)
 *     1. strip any skin, bake every transform into the vertices (model space: the source's
 *        world space after its own root matrix)
 *     2. segment into registry parts: name/material rules, spatial rules per connected piece,
 *        or per triangle where panels are welded together (see docs/body-report.md)
 *     3. normalise to car coordinates: metres, +Y up, +Z forward, +X = car's left, ground at
 *        y = 0, wheelbase centred on z = 0, ONE uniform scale fitted to the real wheelbase
 *     4. join per part + material, meshopt-compress
 *     5. measure wheels, overall size, hinges, firewall and the free engine/transaxle bays
 *   → public/models/body.opt.glb + docs/body-report.md
 */
import { statSync, writeFileSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { compactPrimitive, dedup, flatten, join, meshopt, prune, transformMesh } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { Box3, BufferAttribute, BufferGeometry, DoubleSide, Matrix4, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import { MEASURE, MODEL_ENGINE_BAY, NORMALISE, RULES, SOURCE, TRIS, classifyFallback } from './body-rules.mjs';

const { src: SRC, out: OUT, report: REPORT } = SOURCE;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
await MeshoptEncoder.ready;

const doc = await io.read(SRC);
const root = doc.getRoot();
const log = [];
const say = (s = '') => {
  console.log(s);
  log.push(s);
};
const f3 = (v) => `(${v.map((n) => n.toFixed(4)).join(', ')})`;
const mm = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 1000).toFixed(0)} mm`;
const countPrims = () => root.listMeshes().reduce((s, m) => s + m.listPrimitives().length, 0);
const srcPrims = countPrims();
const srcMaterials = root.listMaterials().length;

// ─── 1. Strip skin, record each mesh node's ancestry, bake transforms ────────

const skins = root.listSkins();
for (const n of root.listNodes()) n.setSkin(null);
for (const s of skins) s.dispose();
let strippedAttrs = 0;
for (const mesh of root.listMeshes()) {
  for (const p of mesh.listPrimitives()) {
    for (const sem of p.listSemantics()) {
      if (/^(JOINTS|WEIGHTS)_\d+$/.test(sem)) {
        p.setAttribute(sem, null);
        strippedAttrs++;
      }
    }
  }
}
const ancestry = new Map();
for (const n of root.listNodes()) {
  const names = [];
  for (let a = n; a; a = a.getParentNode()) names.unshift(a.getName());
  ancestry.set(n, names.join(' / '));
}
const rootMatrix = root.listScenes()[0].listChildren()[0]?.getMatrix();

await doc.transform(flatten());
for (const n of root.listNodes()) {
  const mesh = n.getMesh();
  if (!mesh) continue;
  transformMesh(mesh, n.getWorldMatrix());
  n.setMatrix(new Matrix4().identity().toArray());
}

// ─── 2. Segment into parts (model space) ─────────────────────────────────────

const scene = root.listScenes()[0];
const partNodes = new Map();
const partNode = (id) => {
  if (!partNodes.has(id)) {
    const node = doc.createNode(id);
    scene.addChild(node);
    partNodes.set(id, node);
  }
  return partNodes.get(id);
};
const reportRows = [];
// Debug: `--debug-region=part:x0,x1,y0,y1,z0,z1` lists that part's pieces whose centroid is
// inside the box (model space); `--debug-touch=...` lists every piece whose bounds overlap it.
const debugArg = process.argv.find((a) => /^--debug-(region|touch)=/.test(a));
const DEBUG_REGION = debugArg
  ? (() => {
      const [part, nums] = debugArg.split('=')[1].split(':');
      const [x0, x1, y0, y1, z0, z1] = nums.split(',').map(Number);
      const box = new Box3(new Vector3(x0, y0, z0), new Vector3(x1, y1, z1));
      const touch = debugArg.startsWith('--debug-touch=');
      return { part, inRegion: (piece) => (touch ? box.intersectsBox(piece.box) : box.containsPoint(piece.centroid)) };
    })()
  : null;
const debugPieces = [];
const dropped = [];
let unmatched = 0;
const tyres = [];
const mirrors = [];
const widthBox = new Box3();
const cutStats = [];

for (const node of root.listNodes().filter((n) => n.getMesh() && !partNodes.has(n.getName()))) {
  const name = node.getName();
  const path = ancestry.get(node) ?? name;
  for (const prim of node.getMesh().listPrimitives()) {
    const material = prim.getMaterial()?.getName() ?? '';
    const pieces = splitByComponents(prim);
    const box = new Box3();
    pieces.forEach((p) => box.union(p.box));
    const ctx = { name, path, material, box };
    if (NORMALISE.isTyre(ctx)) tyres.push(box.clone());
    const rule = RULES.find((r) => r.test(ctx));
    const byPart = new Map();
    const add = (part, via, tris) => {
      const key = `${part}\u0000${via}`;
      const acc = byPart.get(key) ?? { part, via, tris: [] };
      for (const t of tris) acc.tris.push(t);
      byPart.set(key, acc);
    };
    const byRegion = [];
    for (const piece of pieces) {
      if (NORMALISE.isMirror(piece)) mirrors.push(piece.box);
      else widthBox.union(piece.box);
      let part = rule ? (rule.split ? rule.split(piece, ctx) : rule.part(ctx)) : undefined;
      let via = rule ? rule.id : 'fallback';
      if (part === TRIS) {
        byRegion.push(...piece.tris);
        continue;
      }
      if (part === undefined) {
        part = classifyFallback(piece, ctx);
        via = rule ? `${rule.id}→fallback` : 'fallback';
      }
      if (DEBUG_REGION && part === DEBUG_REGION.part && DEBUG_REGION.inRegion(piece)) {
        debugPieces.push({ name, material, part, tris: piece.triCount, box: piece.box });
      }
      add(part, via, piece.tris);
    }
    // Welded panels: cut their triangles along the region boundaries (new vertices on the
    // cut), then each new triangle goes to its region. The primitive gains those vertices.
    let source = prim;
    if (byRegion.length) {
      const cut = cutByRegion(prim, byRegion, (p) => rule.tri(p, ctx));
      source = cut.prim;
      for (const [id, tris] of cut.groups) add(id, `${rule.id}/cut`, tris);
      cutStats.push(`${name} [${material}]: ${byRegion.length} triangles → ${cut.count} after cutting (${cut.added} vertices added)`);
    }
    for (const { part, via, tris } of byPart.values()) {
      reportRows.push({ name, material, part: part ?? '(dropped)', via, tris: tris.length });
      if (via.includes('fallback')) unmatched++;
      if (part === null) {
        dropped.push(`${name} [${material}] ${tris.length} tris`);
        continue;
      }
      const sub = subPrimitive(source, tris, part);
      const mesh = doc.createMesh(`${part}:${name}`).addPrimitive(sub);
      partNode(part).addChild(doc.createNode(name).setMesh(mesh));
    }
  }
  node.dispose();
}

if (DEBUG_REGION) {
  const f = (v) => v.toArray().map((n) => n.toFixed(3).padStart(6)).join(' ');
  debugPieces.sort((p, q) => q.tris - p.tris);
  for (const d of debugPieces) console.log(`${d.name.padEnd(12)} ${d.material.padEnd(20)} ${String(d.tris).padStart(6)}  min ${f(d.box.min)}  max ${f(d.box.max)}`);
  process.exit(0);
}

// Old parent nodes (the source's hierarchy) are empty now.
for (const n of scene.listChildren()) if (!partNodes.has(n.getName())) n.dispose();
await doc.transform(prune(), dedup({ keepUniqueNames: true }));

// ─── 3. Normalise: one uniform scale from the wheelbase ──────────────────────

if (tyres.length !== 4) throw new Error(`expected 4 tyres, found ${tyres.length}`);
const wheelOf = (b) => {
  const r = (b.max.z - b.min.z) / 2;
  return { centre: new Vector3((b.min.x + b.max.x) / 2, b.max.y - r, (b.min.z + b.max.z) / 2), r, minY: b.min.y };
};
const raw = Object.fromEntries(
  tyres.map((b) => {
    const w = wheelOf(b);
    return [`${w.centre.z > 0 ? 'f' : 'r'}${w.centre.x > 0 ? 'l' : 'r'}`, w];
  }),
);
if (Object.keys(raw).length !== 4) throw new Error(`tyres don't sit one per corner: ${Object.keys(raw)}`);
const rawAxleF = (raw.fl.centre.z + raw.fr.centre.z) / 2;
const rawAxleR = (raw.rl.centre.z + raw.rr.centre.z) / 2;
const rawWheelbase = rawAxleF - rawAxleR;
if (rawWheelbase <= 0) throw new Error('front wheels are not at +Z; add a 180° yaw to the normalisation');
const scale = NORMALISE.wheelbase / rawWheelbase;
const centre = new Vector3(
  (raw.fl.centre.x + raw.fr.centre.x + raw.rl.centre.x + raw.rr.centre.x) / 4,
  Math.min(...Object.values(raw).map((w) => w.minY)),
  (rawAxleF + rawAxleR) / 2,
);
const N = new Matrix4().makeScale(scale, scale, scale).multiply(new Matrix4().makeTranslation(-centre.x, -centre.y, -centre.z));
for (const node of partNodes.values()) {
  node.traverse((n) => {
    if (n.getMesh()) transformMesh(n.getMesh(), N.toArray());
  });
}
const toCar = (v) => v.clone().applyMatrix4(N);
const boxToCar = (b) => new Box3().setFromPoints([toCar(b.min), toCar(b.max)]);

// ─── 4. Measure (car coordinates) ────────────────────────────────────────────

const parts = [...partNodes.keys()].sort();
const partBox = (id) => subtreeBox(partNodes.get(id));
const visible = parts.filter((id) => id !== MODEL_ENGINE_BAY);
const overall = new Box3();
for (const id of visible) overall.union(partBox(id));
const width = boxToCar(widthBox);

const wheelM = {};
for (const k of ['fl', 'fr', 'rl', 'rr']) {
  const b = partBox(`wheel-${k}`);
  const r = (b.max.z - b.min.z) / 2;
  wheelM[k] = { centre: new Vector3((b.min.x + b.max.x) / 2, b.max.y - r, (b.min.z + b.max.z) / 2), r, width: b.max.x - b.min.x };
}
const axleF = (wheelM.fl.centre.z + wheelM.fr.centre.z) / 2;
const axleR = (wheelM.rl.centre.z + wheelM.rr.centre.z) / 2;
const trackF = wheelM.fl.centre.x - wheelM.fr.centre.x;
const trackR = wheelM.rl.centre.x - wheelM.rr.centre.x;

const bvh = buildBvh(parts.filter((id) => !MEASURE.bayIgnore(id)));
// Firewall: the nearest surface ahead of the rear axle along the centreline (several heights).
const F = MEASURE.firewall;
let firewallZ = Infinity;
let firewallBy = '';
for (let y = F.y[0]; y <= F.y[1] + 1e-9; y += F.step) {
  const hits = [];
  const d = cast(bvh, new Vector3(0, y, axleR), new Vector3(0, 0, 1), hits);
  if (axleR + d < firewallZ) {
    firewallZ = axleR + d;
    firewallBy = `${hits[0].label} at y ${y.toFixed(2)}`;
  }
}
const bays = MEASURE.bays.map((b) =>
  measureBay(bvh, {
    ...b,
    from: axleR,
    to: b.front > 0 ? firewallZ : b.limitZ,
  }),
);

// ─── 5. Join per part + material, compress, write ────────────────────────────

await doc.transform(join({ keepNamed: false }), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(OUT, doc);

// ─── Report ──────────────────────────────────────────────────────────────────

const ref = NORMALISE.reference;
const len = overall.max.z - overall.min.z;
const wid = width.max.x - width.min.x;
const hgt = overall.max.y;
const kb = (p) => `${(statSync(p).size / 1024 / 1024).toFixed(2)} MB`;
say(`# Body model prep report`);
say();
say(`Generated by \`npm run prep:body\` (scripts/prep-body.mjs, rules in scripts/body-rules.mjs). Do not edit by hand.`);
say();
say(`## Asset`);
say(`- Source: \`${SRC}\` — ${kb(SRC)} (untouched): ${SOURCE.credit}`);
say(`- Output: \`${OUT}\` — ${kb(OUT)}`);
say(`- Skins removed: ${skins.length}; JOINTS/WEIGHTS attributes stripped: ${strippedAttrs}`);
say(`- Draw calls (mesh primitives): ${srcPrims} → ${countPrims()}; materials ${srcMaterials} → ${root.listMaterials().length}`);
say();
say(`## Normalisation`);
say(`- Source root matrix ${rootMatrix ? f3(rootMatrix) : '(none)'}: the data is Z-up with −Y forward; the root turns it to +Y up, +Z forward, +X = car's left (verified: headlamps at +Z, tail lamps at −Z, the left-hand-drive controls at +X).`);
say(`- Model space wheelbase ${rawWheelbase.toFixed(4)} → uniform scale ×${scale.toFixed(5)} so it measures ${NORMALISE.wheelbase.toFixed(3)} m. No axis is scaled on its own.`);
say(`- Translate ${f3(centre.clone().multiplyScalar(-1).toArray())} (model units, before scaling): wheel centres' mean x, tyre bottoms on y = 0, wheelbase centred on z = 0.`);
say(`- Car bbox: min ${f3(overall.min.toArray())} max ${f3(overall.max.toArray())}`);
say();
say(`| dimension | model (scaled) | reference | difference |`);
say(`| --- | --- | --- | --- |`);
for (const [label, m, r] of [
  ['wheelbase', axleF - axleR, NORMALISE.wheelbase],
  ['length', len, ref.length],
  ['width (excl. mirrors)', wid, ref.width],
  ['width (incl. mirrors)', overall.max.x - overall.min.x, null],
  ['height', hgt, ref.height],
  ['track front', trackF, ref.trackFront],
  ['track rear', trackR, ref.trackRear],
]) {
  say(`| ${label} | ${m.toFixed(4)} | ${r == null ? '—' : r.toFixed(3)} | ${r == null ? '—' : `${mm(m - r)} (${(((m - r) / r) * 100).toFixed(1)}%)`} |`);
}
say();
say(`## Wheels (car coordinates)`);
say(`| wheel | centre (x, y, z) | tyre radius | width |`);
say(`| --- | --- | --- | --- |`);
for (const [k, w] of Object.entries(wheelM)) say(`| ${k} | ${f3(w.centre.toArray())} | ${w.r.toFixed(4)} | ${w.width.toFixed(3)} |`);
say(`- Axles: front z ${axleF.toFixed(4)}, rear z ${axleR.toFixed(4)} → wheelbase ${(axleF - axleR).toFixed(4)}`);
say(`- Track: front ${trackF.toFixed(4)}, rear ${trackR.toFixed(4)}`);
say();
say(`## Panels (bounding boxes, for hinges and explode)`);
for (const id of ['front-clam', 'rear-clam', 'rear-wing', 'door-l', 'door-r', 'glass', 'body-shell', 'interior', 'undertray', 'model-chassis']) {
  if (!partNodes.has(id)) continue;
  const b = partBox(id);
  say(`- ${id}: min ${f3(b.min.toArray())} max ${f3(b.max.toArray())}`);
}
say();
say(`## Free volumes (against the fixed bodywork, wheels and discs; not the stand-in frame/suspension)`);
say(`- Firewall (bay front wall: nearest surface ahead of the rear axle on the centreline, y ${F.y[0]}…${F.y[1]}): z ${firewallZ.toFixed(3)}, set by ${firewallBy}`);
for (const bay of bays) {
  say(`- ${bay.label}: x ±${bay.halfWidth.toFixed(3)}, y ${bay.bottom.toFixed(3)}…${bay.top.toFixed(3)}, z ${bay.zMin.toFixed(3)}…${bay.zMax.toFixed(3)}`);
  say(`  limits:\n    ${bay.notes}`);
}
say();
say(`## Cut along region boundaries`);
for (const line of cutStats) say(`- ${line}`);
say();
say(`## Hidden: ${MODEL_ENGINE_BAY}`);
say(`The model's stand-in engine (F40_Mechanics.001) and the stand-in powertrain in F40_Mechanics (gearbox,`);
say(`turbos, intercoolers, plenum, wastegates, silencers, driveshafts), kept in the GLB as the dev key-B ghost but`);
say(`never rendered: our procedural powertrain replaces it.`);
say(`${reportRows.filter((r) => r.part === MODEL_ENGINE_BAY).reduce((n, r) => n + r.tris, 0)} triangles. Bounds: min ${f3(partBox(MODEL_ENGINE_BAY).min.toArray())} max ${f3(partBox(MODEL_ENGINE_BAY).max.toArray())}`);
if (dropped.length) {
  say();
  say(`## Dropped geometry`);
  for (const d of dropped) say(`- ${d}`);
}
say();
say(`## Parts`);
say(`| part | primitives | triangles | bbox min | bbox max |`);
say(`| --- | --- | --- | --- | --- |`);
for (const id of parts) {
  const b = partBox(id);
  let prims = 0;
  partNodes.get(id).traverse((c) => (prims += c.getMesh()?.listPrimitives().length ?? 0));
  const tris = reportRows.filter((r) => r.part === id).reduce((s, r) => s + r.tris, 0);
  say(`| ${id} | ${prims} | ${tris} | ${f3(b.min.toArray())} | ${f3(b.max.toArray())} |`);
}
say();
say(`## Source mesh → part (${reportRows.length} rows; ${unmatched} assigned by the spatial fallback)`);
say(`\`via\` = rule id from scripts/body-rules.mjs (\`/tri\`: split per triangle); "fallback" = no rule matched (or the rule deferred).`);
say();
say(`| source node | material | part | via | tris |`);
say(`| --- | --- | --- | --- | --- |`);
for (const r of reportRows) say(`| ${r.name} | ${r.material} | ${r.part} | ${r.via} | ${r.tris} |`);
writeFileSync(REPORT, log.join('\n') + '\n');
console.error(`\nwrote ${OUT} and ${REPORT}`);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function subtreeBox(n) {
  const box = new Box3();
  const v = new Vector3();
  const el = [];
  n.traverse((c) => {
    const mesh = c.getMesh();
    if (!mesh) return;
    const m = new Matrix4().fromArray(c.getWorldMatrix());
    for (const p of mesh.listPrimitives()) {
      const pos = p.getAttribute('POSITION');
      for (let i = 0; i < pos.getCount(); i++) box.expandByPoint(v.fromArray(pos.getElement(i, el)).applyMatrix4(m));
    }
  });
  return box;
}

/**
 * Connected pieces of a primitive, with each triangle's centroid. Vertices are welded by
 * position first so UV seams don't split a panel into fragments.
 */
function splitByComponents(prim) {
  const pos = prim.getAttribute('POSITION');
  const idx = prim.getIndices();
  const nv = pos.getCount();
  const parent = new Int32Array(nv).map((_, i) => i);
  const find = (i) => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  const union = (a, b) => {
    a = find(a);
    b = find(b);
    if (a !== b) parent[b] = a;
  };
  const el = [];
  const seen = new Map();
  for (let i = 0; i < nv; i++) {
    pos.getElement(i, el);
    const key = `${Math.round(el[0] * 1e4)},${Math.round(el[1] * 1e4)},${Math.round(el[2] * 1e4)}`;
    const j = seen.get(key);
    if (j === undefined) seen.set(key, i);
    else union(i, j);
  }
  const triCount = idx ? idx.getCount() / 3 : nv / 3;
  const vi = (t, k) => (idx ? idx.getScalar(t * 3 + k) : t * 3 + k);
  for (let t = 0; t < triCount; t++) {
    union(vi(t, 0), vi(t, 1));
    union(vi(t, 0), vi(t, 2));
  }
  const comps = new Map();
  const v = new Vector3();
  for (let t = 0; t < triCount; t++) {
    const c = find(vi(t, 0));
    let comp = comps.get(c);
    if (!comp) comps.set(c, (comp = { tris: [], triCentroids: [], box: new Box3(), sum: new Vector3(), n: 0 }));
    comp.tris.push(t);
    const tc = new Vector3();
    for (let k = 0; k < 3; k++) {
      v.fromArray(pos.getElement(vi(t, k), el));
      comp.box.expandByPoint(v);
      comp.sum.add(v);
      tc.add(v);
      comp.n++;
    }
    comp.triCentroids.push(tc.divideScalar(3));
  }
  return [...comps.values()].map((c) => ({
    tris: c.tris,
    triCentroids: c.triCentroids,
    box: c.box,
    centroid: c.sum.divideScalar(c.n),
    triCount: c.tris.length,
  }));
}

/**
 * Cuts a primitive's triangles (`tris`) along the boundaries between the regions
 * `classify` assigns to points. A triangle whose corners all fall in one region keeps it;
 * otherwise the edges that change region are bisected to the boundary and the triangle is
 * split there (two regions), or subdivided at its edge midpoints first (three or more).
 * Returns a clone of the primitive with the new vertices appended (all attributes
 * interpolated) and every original triangle still in place, plus the new triangles
 * (indices into the clone) grouped by region.
 */
function cutByRegion(prim, tris, classify) {
  const idx = prim.getIndices();
  const semantics = prim.listSemantics();
  const src = Object.fromEntries(semantics.map((s) => [s, prim.getAttribute(s)]));
  const size = Object.fromEntries(semantics.map((s) => [s, src[s].getElementSize()]));
  const base = src.POSITION.getCount();
  /** Vertex data: originals read lazily, new ones stored. */
  const extra = Object.fromEntries(semantics.map((s) => [s, []]));
  const el = [];
  const read = (s, v) => (v < base ? src[s].getElement(v, []) : extra[s][v - base]);
  const pos = (v) => new Vector3().fromArray(read('POSITION', v));
  const classOf = new Map();
  const cls = (v) => {
    if (!classOf.has(v)) classOf.set(v, classify(pos(v)));
    return classOf.get(v);
  };
  const lerpVertex = (a, b, t) => {
    const v = base + extra.POSITION.length;
    for (const s of semantics) {
      const A = read(s, a);
      const B = read(s, b);
      const out = A.map((x, k) => x + (B[k] - x) * t);
      if (s === 'NORMAL' || s === 'TANGENT') {
        const len = Math.hypot(out[0], out[1], out[2]) || 1;
        for (let k = 0; k < 3; k++) out[k] /= len;
      }
      extra[s].push(out);
    }
    return v;
  };
  const midCache = new Map();
  const midpoint = (a, b) => {
    const key = a < b ? `${a}/${b}` : `${b}/${a}`;
    if (!midCache.has(key)) midCache.set(key, lerpVertex(a, b, 0.5));
    return midCache.get(key);
  };
  const cutCache = new Map();
  /** Point on edge a→b where the region changes from a's (bisection). Shared by both sides. */
  const cutPoint = (a, b) => {
    const key = a < b ? `${a}/${b}` : `${b}/${a}`;
    if (cutCache.has(key)) return cutCache.get(key);
    const pa = pos(a);
    const pb = pos(b);
    const ca = cls(a);
    let lo = 0;
    let hi = 1;
    const p = new Vector3();
    for (let i = 0; i < 16; i++) {
      const m = (lo + hi) / 2;
      if (classify(p.lerpVectors(pa, pb, m)) === ca) lo = m;
      else hi = m;
    }
    const v = lerpVertex(a, b, (lo + hi) / 2);
    cutCache.set(key, v);
    return v;
  };
  const groups = new Map();
  const emit = (id, a, b, c) => {
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push([a, b, c]);
  };
  const split = (a, b, c, depth) => {
    const [ca, cb, cc] = [cls(a), cls(b), cls(c)];
    if (ca === cb && cb === cc) return emit(ca, a, b, c);
    if (ca === cb || cb === cc || ca === cc) {
      // Rotate (keeping the winding) so the odd corner is last.
      const [p0, p1, p2] = ca === cb ? [a, b, c] : cb === cc ? [b, c, a] : [c, a, b];
      const q0 = cutPoint(p0, p2);
      const q1 = cutPoint(p1, p2);
      emit(cls(p2), q0, q1, p2);
      emit(cls(p0), p0, p1, q1);
      emit(cls(p0), p0, q1, q0);
      return;
    }
    if (depth >= 3) {
      const centroid = pos(a).add(pos(b)).add(pos(c)).divideScalar(3);
      return emit(classify(centroid), a, b, c);
    }
    const [ab, bc, ca2] = [midpoint(a, b), midpoint(b, c), midpoint(c, a)];
    split(a, ab, ca2, depth + 1);
    split(ab, b, bc, depth + 1);
    split(ca2, bc, c, depth + 1);
    split(ab, bc, ca2, depth + 1);
  };
  const vi = (t, k) => (idx ? idx.getScalar(t * 3 + k) : t * 3 + k);
  for (const t of tris) split(vi(t, 0), vi(t, 1), vi(t, 2), 0);

  // The clone: original vertices + new ones; original triangles + new ones.
  const out = prim.clone();
  const added = extra.POSITION.length;
  const buffer = root.listBuffers()[0];
  for (const s of semantics) {
    const arr = new Float32Array((base + added) * size[s]);
    for (let v = 0; v < base; v++) arr.set(src[s].getElement(v, el), v * size[s]);
    extra[s].forEach((e, k) => arr.set(e, (base + k) * size[s]));
    out.setAttribute(s, doc.createAccessor(`${s}-cut`).setType(src[s].getType()).setArray(arr).setBuffer(buffer));
  }
  const origCount = idx ? idx.getCount() / 3 : base / 3;
  const all = [];
  for (let t = 0; t < origCount; t++) all.push(vi(t, 0), vi(t, 1), vi(t, 2));
  const result = new Map();
  let next = origCount;
  for (const [id, list] of groups) {
    result.set(id, list.map(() => next++));
    for (const tri of list) all.push(...tri);
  }
  out.setIndices(doc.createAccessor('indices-cut').setType('SCALAR').setArray(new Uint32Array(all)).setBuffer(buffer));
  return { prim: out, groups: result, count: next - origCount, added };
}

/** New primitive with only the given triangles (attributes compacted). */
function subPrimitive(prim, tris, part) {
  const idx = prim.getIndices();
  const all = idx ? idx.getCount() / 3 : prim.getAttribute('POSITION').getCount() / 3;
  const sub = prim.clone();
  if (tris.length === all) return sub;
  const src = idx ? idx.getArray() : null;
  const out = new Uint32Array(tris.length * 3);
  tris.forEach((t, i) => {
    for (let k = 0; k < 3; k++) out[i * 3 + k] = src ? src[t * 3 + k] : t * 3 + k;
  });
  const acc = doc.createAccessor(`${part}-indices`).setType('SCALAR').setArray(out);
  if (idx) acc.setBuffer(idx.getBuffer());
  else acc.setBuffer(root.listBuffers()[0]);
  sub.setIndices(acc);
  compactPrimitive(sub);
  return sub;
}

function buildBvh(ids) {
  const positions = [];
  const labels = [];
  const v = new Vector3();
  const el = [];
  for (const id of ids) {
    partNodes.get(id).traverse((n) => {
      const mesh = n.getMesh();
      if (!mesh) return;
      const label = `${id}/${n.getName()}`;
      const m = new Matrix4().fromArray(n.getWorldMatrix());
      for (const p of mesh.listPrimitives()) {
        const pos = p.getAttribute('POSITION');
        const idx = p.getIndices();
        const count = idx ? idx.getCount() : pos.getCount();
        for (let i = 0; i < count; i++) {
          v.fromArray(pos.getElement(idx ? idx.getScalar(i) : i, el)).applyMatrix4(m);
          positions.push(v.x, v.y, v.z);
        }
        for (let t = 0; t < count / 3; t++) labels.push(label);
      }
    });
  }
  const geom = new BufferGeometry();
  geom.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  // Indirect keeps the triangle order, so hit.faceIndex maps back to its label.
  geom.boundsTree = new MeshBVH(geom, { indirect: true });
  const mesh = new Mesh(geom, new MeshBasicMaterial({ side: DoubleSide }));
  mesh.raycast = acceleratedRaycast;
  mesh.userData.labels = labels;
  return mesh;
}

/** Distance to the first surface along a ray (Infinity if none); records what was hit. */
function cast(mesh, origin, dir, hits) {
  const rc = new Raycaster(origin, dir);
  rc.firstHitOnly = true;
  const hit = rc.intersectObject(mesh)[0];
  if (!hit) return Infinity;
  hits?.push({ d: hit.distance, label: mesh.userData.labels[hit.faceIndex], point: hit.point });
  return hit.distance;
}

/** The surface that set a limit: the closest hit, with how many rays it stopped. */
function limiter(hits) {
  if (!hits.length) return 'nothing';
  hits.sort((a, b) => a.d - b.d);
  const best = hits[0];
  const n = hits.filter((h) => h.label === best.label).length;
  return `${best.label} at (${best.point.toArray().map((v) => v.toFixed(3)).join(', ')}), stops ${n}/${hits.length} rays`;
}

/**
 * Largest empty box, symmetric about x = 0, with one face on the rear-axle plane:
 * `front: +1` grows forward (engine bay), `-1` rearward (transaxle bay). The region is
 * voxelised (VOXEL m); a voxel is occupied if any visible model triangle passes through
 * it. Every candidate (half width, bottom, top) is pushed as far as it will go along z,
 * using a 3D prefix sum for constant-time emptiness tests, and the largest volume wins.
 */
function measureBay(mesh, { front, from, to, minHeight = 0, minHalfWidth = 0, yMax = Infinity, label }) {
  const VOXEL = 0.02;
  const R = { x: [-0.8, 0.8], y: [0.05, 1.15], z: front > 0 ? [from, to] : [to, from] };
  const n = { x: Math.round((R.x[1] - R.x[0]) / VOXEL), y: Math.round((R.y[1] - R.y[0]) / VOXEL), z: Math.round((R.z[1] - R.z[0]) / VOXEL) };
  const bvh = mesh.geometry.boundsTree;
  const identity = new Matrix4();
  // Summed-volume table with a zero border: S[(x+1),(y+1),(z+1)].
  const sx = n.x + 1, sy = n.y + 1, sz = n.z + 1;
  const S = new Int32Array(sx * sy * sz);
  const at = (x, y, z) => (x * sy + y) * sz + z;
  const box = new Box3();
  for (let x = 0; x < n.x; x++) {
    for (let y = 0; y < n.y; y++) {
      for (let z = 0; z < n.z; z++) {
        box.min.set(R.x[0] + x * VOXEL, R.y[0] + y * VOXEL, R.z[0] + z * VOXEL);
        box.max.set(box.min.x + VOXEL, box.min.y + VOXEL, box.min.z + VOXEL);
        const occ = bvh.intersectsBox(box, identity) ? 1 : 0;
        S[at(x + 1, y + 1, z + 1)] =
          occ + S[at(x, y + 1, z + 1)] + S[at(x + 1, y, z + 1)] + S[at(x + 1, y + 1, z)] -
          S[at(x, y, z + 1)] - S[at(x, y + 1, z)] - S[at(x + 1, y, z)] + S[at(x, y, z)];
      }
    }
  }
  // Occupied voxels in [x0,x1) × [y0,y1) × [z0,z1).
  const count = (x0, x1, y0, y1, z0, z1) =>
    S[at(x1, y1, z1)] - S[at(x0, y1, z1)] - S[at(x1, y0, z1)] - S[at(x1, y1, z0)] +
    S[at(x0, y0, z1)] + S[at(x0, y1, z0)] + S[at(x1, y0, z0)] - S[at(x0, y0, z0)];
  const cx = n.x / 2;
  if (process.env.DEBUG_BAY) {
    const want = process.env.DEBUG_BAY.split(',').map(Number).filter((v) => v >= R.z[0] && v < R.z[1]);
    for (const zv of want) {
      const z = Math.floor((zv - R.z[0]) / VOXEL);
      const rows = [];
      for (let y = n.y - 1; y >= 0; y--) {
        let row = '';
        for (let x = 0; x < n.x; x++) row += count(x, x + 1, y, y + 1, z, z + 1) ? '#' : '.';
        rows.push(`${(R.y[0] + y * VOXEL).toFixed(2)} ${row}`);
      }
      console.log(`${label} slice z=${(R.z[0] + z * VOXEL).toFixed(3)} (x ${R.x[0]}…${R.x[1]})\n${rows.join('\n')}`);
    }
  }
  let best = null;
  for (let w = 1; w <= cx; w++) {
    for (let y0 = 0; y0 < n.y; y0++) {
      for (let y1 = y0 + 1; y1 <= n.y; y1++) {
        if (R.y[0] + y1 * VOXEL > yMax + 1e-9) break;
        // Length along z, measured from the axle plane outwards.
        let len = 0;
        while (len < n.z) {
          const [z0, z1] = front > 0 ? [len, len + 1] : [n.z - len - 1, n.z - len];
          if (count(cx - w, cx + w, y0, y1, z0, z1)) break;
          len++;
        }
        if (!len) break; // taller boxes with this bottom only get blocked sooner
        if ((y1 - y0) * VOXEL < minHeight || w * VOXEL < minHalfWidth) continue;
        const vol = 2 * w * (y1 - y0) * len;
        if (!best || vol > best.vol) best = { vol, w, y0, y1, len };
      }
    }
  }
  if (!best) throw new Error(`${label}: no free box found`);
  const halfWidth = best.w * VOXEL;
  const bottom = R.y[0] + best.y0 * VOXEL;
  const top = R.y[0] + best.y1 * VOXEL;
  const farZ = from + front * best.len * VOXEL;
  const [zMin, zMax] = front > 0 ? [from, farZ] : [farZ, from];
  // Name what bounds each face: rays from just inside the box, through each face.
  const mid = new Vector3(0, (bottom + top) / 2, (zMin + zMax) / 2);
  const probe = (origin, dir) => {
    const hits = [];
    cast(mesh, origin, dir, hits);
    return limiter(hits);
  };
  const notes = [
    `${front > 0 ? 'front' : 'rear'}: ${probe(new Vector3(0, mid.y, from), new Vector3(0, 0, front))}`,
    `top: ${probe(mid, new Vector3(0, 1, 0))}`,
    `bottom: ${probe(mid, new Vector3(0, -1, 0))}`,
    `side (+x): ${probe(mid, new Vector3(1, 0, 0))}`,
    `search: voxel ${VOXEL} m, height ≥ ${minHeight} m, half width ≥ ${minHalfWidth} m${Number.isFinite(yMax) ? `, top ≤ ${yMax} m` : ''}, z limited to ${to.toFixed(3)}; volume ${(best.vol * VOXEL ** 3 * 1000).toFixed(0)} L`,
  ].join('\n    ');
  return { label, halfWidth, bottom, top, zMin, zMax, notes };
}
