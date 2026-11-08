#!/usr/bin/env node
/**
 * Milestone-2 layout sketch: to-scale top and side views of the rear of the car with the
 * measured bays, the original car's engine-bay dressing (hidden model-engine-bay) as a
 * placement guide, and the planned envelope of every major powertrain part. Each
 * envelope is clash-tested against the visible body-model geometry (BVH).
 *
 *   node scripts/layout-sketch.mjs  →  docs/m2-layout-{1,2}.svg + docs/m2-layout-key.json
 *
 * The planned envelopes below are proposals for review; once approved they move into
 * src/config/dims.ts and this script reads them from there.
 */
import { writeFileSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { Box3, BufferAttribute, BufferGeometry, Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { MeshBVH } from 'three-mesh-bvh';

// ─── Reference values (from dims.ts / docs/body-report.md) ───────────────────

const AXLE_R = -1.3275;
const AXLE_F = 1.3275;
const FIREWALL = -0.338;
const BAYS = {
  'engineBay (tall core)': { x: 0.34, y: [0.13, 0.75], z: [-1.328, -0.348] },
  'engineBayWide (lower)': { x: 0.48, y: [0.13, 0.59], z: [-1.328, -0.588] },
  transaxleBay: { x: 0.5, y: [0.21, 0.65], z: [-1.768, -1.328] },
};
const WHEEL = { rear: { x: 0.8112, y: 0.3602, r: 0.357, w: 0.36 }, front: { x: 0.8466, y: 0.3241, r: 0.321, w: 0.282 } };

// ─── Planned envelopes (car coordinates, metres) ─────────────────────────────
// box: x [min,max] (left side; `mirror` adds the right), y, z. `rx`: tilt about z (deg).

const CRANK_Y = 0.275;
const PLAN = [
  // 2a engine core
  { id: 'engine-block', g: 'engine', x: [-0.27, 0.27], y: [0.2, 0.47], z: [-1.12, -0.4] },
  { id: 'crankshaft', g: 'engine', x: [-0.09, 0.09], y: [CRANK_Y - 0.09, CRANK_Y + 0.09], z: [-1.14, -0.38] },
  { id: 'cylinder-head', g: 'engine', mirror: true, x: [0.12, 0.3], y: [0.43, 0.6], z: [-1.11, -0.41] },
  { id: 'cam-cover', g: 'engine', mirror: true, x: [0.13, 0.29], y: [0.56, 0.64], z: [-1.1, -0.42] },
  { id: 'timing-cover', g: 'engine', x: [-0.26, 0.26], y: [0.2, 0.62], z: [-0.4, -0.36] },
  { id: 'dry-sump-pan', g: 'engine', x: [-0.22, 0.22], y: [0.145, 0.2], z: [-1.08, -0.42] },
  { id: 'water-pump', g: 'engine', mirror: true, x: [0.12, 0.24], y: [0.24, 0.34], z: [-0.42, -0.36] },
  { id: 'aux-emotor', g: 'hybrid', x: [0.14, 0.3], y: [0.16, 0.28], z: [-0.52, -0.36] },
  // 2b intake, fuel, exhaust
  { id: 'intake-plenum-cover', g: 'engine', x: [-0.24, 0.24], y: [0.6, 0.82], z: [-1.05, -0.38] },
  { id: 'throttle-body', g: 'engine', mirror: true, x: [0.11, 0.21], y: [0.7, 0.79], z: [-1.1, -1.03] },
  { id: 'intake-tube', g: 'engine', mirror: true, x: [0.13, 0.31], y: [0.62, 0.79], z: [-1.42, -1.08] },
  { id: 'airbox', g: 'engine', mirror: true, x: [0.15, 0.37], y: [0.5, 0.7], z: [-1.78, -1.42] },
  { id: 'headers', g: 'exhaust', mirror: true, x: [0.27, 0.42], y: [0.22, 0.46], z: [-1.05, -0.45] },
  { id: 'catalyst', g: 'exhaust', mirror: true, x: [0.29, 0.42], y: [0.17, 0.3], z: [-1.28, -1.05] },
  { id: 'exhaust-pipe', g: 'exhaust', mirror: true, x: [0.32, 0.5], y: [0.2, 0.28], z: [-1.7, -1.28] },
  { id: 'silencer', g: 'exhaust', mirror: true, x: [0.585, 0.8], y: [0.27, 0.41], z: [-1.92, -1.74] },
  { id: 'exhaust-tips', g: 'exhaust', mirror: true, x: [0.583, 0.812], y: [0.264, 0.384], z: [-2.07, -1.98] },
  // 2c transmission + hybrid
  { id: 'flywheel+clutch', g: 'transmission', x: [-0.13, 0.13], y: [0.145, 0.405], z: [-1.2, -1.12] },
  { id: 'bellhousing', g: 'transmission', x: [-0.2, 0.2], y: [0.15, 0.46], z: [-1.26, -1.2] },
  { id: 'dct-casing', g: 'transmission', x: [-0.2, 0.2], y: [0.18, 0.58], z: [-1.8, -1.26] },
  { id: 'driveshaft', g: 'transmission', mirror: true, x: [0.2, 0.7], y: [0.29, 0.4], z: [-1.38, -1.28] },
  { id: 'main-emotor', g: 'hybrid', x: [-0.12, 0.12], y: [0.32, 0.56], z: [-1.96, -1.8] },
  { id: 'inverter', g: 'hybrid', mirror: true, x: [0.03, 0.19], y: [0.58, 0.65], z: [-1.4, -1.16] },
  { id: 'oil-tank', g: 'engine', x: [-0.1, 0.1], y: [0.58, 0.74], z: [-1.78, -1.46] },
  // 2d cooling, fuel, rear chassis, rear suspension
  // 70 mm core, top leaning out 30°, inboard of the side-intake grille (inner face x ≈ 0.67)
  { id: 'radiator', g: 'cooling', mirror: true, x: [0.56, 0.63], y: [0.3, 0.6], z: [-0.9, -0.55], rx: -30 },
  { id: 'fuel-tank', g: 'chassis', x: [-0.46, 0.46], y: [0.12, 0.47], z: [-0.33, -0.14] },
  { id: 'rear-subframe', g: 'chassis', mirror: true, x: [0.4, 0.48], y: [0.26, 0.34], z: [-2.0, -1.1] },
  { id: 'rear-bumper-beam', g: 'chassis', x: [-0.62, 0.62], y: [0.42, 0.52], z: [-2.1, -2.02] },
  { id: 'rear-wishbones', g: 'suspension', mirror: true, x: [0.2, 0.68], y: [0.16, 0.56], z: [-1.5, -1.15] },
  { id: 'rear-coilover', g: 'suspension', mirror: true, x: [0.38, 0.56], y: [0.2, 0.62], z: [-1.42, -1.3] },
  { id: 'rear-upright', g: 'suspension', mirror: true, x: [0.66, 0.77], y: [0.16, 0.56], z: [-1.45, -1.2] },
  { id: 'rear-brake-disc', g: 'suspension', mirror: true, x: [0.77, 0.81], y: [0.17, 0.55], z: [-1.52, -1.14] },
  // battery: on the underbody (y ≈ 0.10) under the cabin floor; the top steps up with the floor
  { id: 'battery-pack', g: 'hybrid', x: [-0.45, 0.45], y: [0.11, 0.13], z: [-0.1, 0.55] },
  { id: 'battery-pack-front', g: 'hybrid', x: [-0.45, 0.45], y: [0.13, 0.152], z: [0.36, 0.55] },
];

const COLOURS = {
  engine: '#c9ced6', exhaust: '#e0a05a', transmission: '#8fb3d9', hybrid: '#ff8a3d',
  cooling: '#59c3c3', chassis: '#9d8fd9', suspension: '#b7d97a',
};

// ─── Load the prepped body model (car coordinates) ───────────────────────────

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
await MeshoptDecoder.ready;
const doc = await io.read('public/models/body.opt.glb');
const parts = new Map();
for (const node of doc.getRoot().listScenes()[0].listChildren()) {
  const tris = [];
  const v = new Vector3();
  const el = [];
  node.traverse((n) => {
    const mesh = n.getMesh();
    if (!mesh) return;
    const m = new Matrix4().fromArray(n.getWorldMatrix());
    for (const p of mesh.listPrimitives()) {
      const pos = p.getAttribute('POSITION');
      const idx = p.getIndices();
      const count = idx ? idx.getCount() : pos.getCount();
      for (let i = 0; i < count; i++) {
        v.fromArray(pos.getElement(idx ? idx.getScalar(i) : i, el)).applyMatrix4(m);
        tris.push(v.x, v.y, v.z);
      }
    }
  });
  parts.set(node.getName(), new Float32Array(tris));
}
const bvhs = new Map();
for (const [id, pos] of parts) {
  if (id === 'model-engine-bay') continue;
  const geom = new BufferGeometry();
  geom.setAttribute('position', new BufferAttribute(pos, 3));
  bvhs.set(id, new MeshBVH(geom));
}

// ─── Clash-test each envelope ────────────────────────────────────────────────

const envelopes = PLAN.flatMap((p) => (p.mirror ? [{ ...p, side: 'l' }, { ...p, side: 'r', x: [-p.x[1], -p.x[0]], rx: p.rx ? -p.rx : 0 }] : [p]));
const results = [];
for (const e of envelopes) {
  const size = new Vector3(e.x[1] - e.x[0], e.y[1] - e.y[0], e.z[1] - e.z[0]);
  const centre = new Vector3((e.x[0] + e.x[1]) / 2, (e.y[0] + e.y[1]) / 2, (e.z[0] + e.z[1]) / 2);
  const local = new Box3(size.clone().multiplyScalar(-0.5), size.clone().multiplyScalar(0.5));
  // Box space → car space (tilt about the z axis through the centre).
  const toCar = new Matrix4().compose(centre, new Quaternion().setFromEuler(new Euler(0, 0, ((e.rx ?? 0) * Math.PI) / 180)), new Vector3(1, 1, 1));
  const hits = [...bvhs].filter(([, bvh]) => bvh.intersectsBox(local, toCar)).map(([id]) => id);
  // Where each hit is: extent of the touching triangles, clipped to the (axis-aligned) envelope.
  const aabb = local.clone().applyMatrix4(toCar);
  const where = hits.map((id) => {
    const b = new Box3();
    bvhs.get(id).shapecast({
      intersectsBounds: (bounds) => bounds.intersectsBox(aabb),
      intersectsTriangle: (tri) => {
        if (aabb.intersectsTriangle(tri)) b.expandByPoint(tri.a).expandByPoint(tri.b).expandByPoint(tri.c);
      },
    });
    b.intersect(aabb);
    const f = (a, c) => `${a.toFixed(2)}…${c.toFixed(2)}`;
    return b.isEmpty() ? `${id} (tilted box only)` : `${id} x ${f(b.min.x, b.max.x)} y ${f(b.min.y, b.max.y)} z ${f(b.min.z, b.max.z)}`;
  });
  results.push({ name: e.id + (e.side ? `-${e.side}` : ''), group: e.g, hits, where });
  e.hits = hits;
}

// ─── Silhouettes (body, excluding wheels/calipers/hidden dressing) ───────────

const BIN = 0.02;
const VIEW = { z: [-2.25, 0.62] }; // rear half plus the cabin floor (battery)
const nb = Math.round((VIEW.z[1] - VIEW.z[0]) / BIN);
const sideSil = Array.from({ length: nb }, () => ({ lo: Infinity, hi: -Infinity }));
const topSil = Array.from({ length: nb }, () => 0);
for (const [id, pos] of parts) {
  if (/^(wheel|caliper)-|model-engine-bay/.test(id)) continue;
  for (let i = 0; i < pos.length; i += 3) {
    const b = Math.floor((pos[i + 2] - VIEW.z[0]) / BIN);
    if (b < 0 || b >= nb) continue;
    sideSil[b].lo = Math.min(sideSil[b].lo, pos[i + 1]);
    sideSil[b].hi = Math.max(sideSil[b].hi, pos[i + 1]);
    if (pos[i + 1] > 0.2) topSil[b] = Math.max(topSil[b], Math.abs(pos[i]));
  }
}
// Original dressing as a ghost: occupied 4 cm cells of the hidden node.
const ghost = new Set();
{
  const pos = parts.get('model-engine-bay');
  for (let i = 0; i < pos.length; i += 3) ghost.add([pos[i], pos[i + 1], pos[i + 2]].map((v) => Math.floor(v / 0.04)).join(','));
}

// ─── SVG: two figures (powertrain core; exhaust + chassis), each top + side ──

const FIGURES = [
  { title: 'Figure 1 — powertrain core: engine, intake, transmission, hybrid', groups: ['engine', 'transmission', 'hybrid'], skip: /^battery/ },
  { title: 'Figure 2 — exhaust, cooling, rear chassis + suspension, fuel tank, battery', groups: ['exhaust', 'cooling', 'chassis', 'suspension', 'hybrid'], only: /^(battery|headers|catalyst|exhaust|silencer|radiator|fuel|rear-)/ },
];
const S = 300; // px per metre
const M = 48;
const W = Math.round((VIEW.z[1] - VIEW.z[0]) * S) + 2 * M;
const TOP_H = Math.round(2.2 * S);
const SIDE_H = Math.round(1.2 * S);
const FIG_H = 40 + TOP_H + 30 + SIDE_H + 40;
const sx = (z) => M + (z - VIEW.z[0]) * S;

let n = 0;
const keyRows = [];
const svgs = [];
for (const fig of FIGURES) {
  const env = envelopes.filter((e) => fig.groups.includes(e.g) && (!fig.skip || !fig.skip.test(e.id)) && (!fig.only || fig.only.test(e.id)));
  const ty = (x) => 40 + (1.1 - x) * S; // top view, +X (car's left) up
  const sy = (y) => 40 + TOP_H + 30 + (1.2 - y) * S;
  const o = [];
  const add = (str) => o.push(str);
  add(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${FIG_H}" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="11">`);
  add(`<rect width="${W}" height="${FIG_H}" fill="#0f1115"/>`);
  add(`<text x="${M}" y="22" fill="#e8e9ec" font-size="14">${fig.title}</text>`);
  add(`<text x="${M}" y="${ty(1.1) + 14}" fill="#8a8f99">TOP (car's left +X up)</text>`);
  add(`<text x="${M}" y="${sy(1.2) + 14}" fill="#8a8f99">SIDE (from the left)</text>`);
  // grid + ticks
  for (let z = -2.2; z <= VIEW.z[1] + 1e-9; z = Math.round((z + 0.1) * 10) / 10) {
    const major = Math.abs(z * 2 - Math.round(z * 2)) < 1e-6;
    add(`<line x1="${sx(z)}" y1="${ty(1.1)}" x2="${sx(z)}" y2="${ty(-1.1)}" stroke="${major ? '#252a33' : '#171a20'}"/>`);
    add(`<line x1="${sx(z)}" y1="${sy(1.2)}" x2="${sx(z)}" y2="${sy(0)}" stroke="${major ? '#252a33' : '#171a20'}"/>`);
    if (major) add(`<text x="${sx(z)}" y="${sy(0) + 16}" fill="#6b717c" text-anchor="middle">z ${z.toFixed(1)}</text>`);
  }
  for (let y = 0.2; y <= 1.2; y = Math.round((y + 0.2) * 10) / 10) add(`<text x="${M - 6}" y="${sy(y) + 4}" fill="#6b717c" text-anchor="end">${y.toFixed(1)}</text>`);
  add(`<line x1="${sx(VIEW.z[0])}" y1="${sy(0)}" x2="${sx(VIEW.z[1])}" y2="${sy(0)}" stroke="#3a404b"/>`);
  // silhouettes
  const up = [], dn = [];
  sideSil.forEach((b, i) => {
    if (!Number.isFinite(b.hi)) return;
    const z = VIEW.z[0] + (i + 0.5) * BIN;
    up.push(`${sx(z)},${sy(b.hi)}`);
    dn.unshift(`${sx(z)},${sy(b.lo)}`);
  });
  add(`<polygon points="${[...up, ...dn].join(' ')}" fill="#181b22" stroke="#3d4452"/>`);
  const tu = topSil.map((x, i) => `${sx(VIEW.z[0] + (i + 0.5) * BIN)},${ty(x)}`);
  const td = topSil.map((x, i) => `${sx(VIEW.z[0] + (i + 0.5) * BIN)},${ty(-x)}`).reverse();
  add(`<polygon points="${[...tu, ...td].join(' ')}" fill="#181b22" stroke="#3d4452"/>`);
  // ghost dressing
  for (const c of ghost) {
    const [x, y, z] = c.split(',').map((v) => Number(v) * 0.04);
    if (z < VIEW.z[0] || z > VIEW.z[1]) continue;
    add(`<rect x="${sx(z)}" y="${ty(x + 0.04)}" width="${0.04 * S}" height="${0.04 * S}" fill="#9aa0aa" opacity="0.07"/>`);
    add(`<rect x="${sx(z)}" y="${sy(y + 0.04)}" width="${0.04 * S}" height="${0.04 * S}" fill="#9aa0aa" opacity="0.07"/>`);
  }
  // rear wheel
  const w = WHEEL.rear;
  add(`<circle cx="${sx(AXLE_R)}" cy="${sy(w.y)}" r="${w.r * S}" fill="none" stroke="#4b5260" stroke-width="2"/>`);
  for (const sgn of [1, -1]) add(`<rect x="${sx(AXLE_R - w.r)}" y="${ty(sgn * w.x + w.w / 2)}" width="${2 * w.r * S}" height="${w.w * S}" fill="none" stroke="#4b5260" stroke-width="2"/>`);
  // bays
  const bayColour = { 'engineBay (tall core)': '#5fd0ff', 'engineBayWide (lower)': '#a78bff', transaxleBay: '#5fffb0' };
  for (const [name, b] of Object.entries(BAYS)) {
    const c = bayColour[name];
    add(`<rect x="${sx(b.z[0])}" y="${ty(b.x)}" width="${(b.z[1] - b.z[0]) * S}" height="${2 * b.x * S}" fill="none" stroke="${c}" stroke-width="1.5" stroke-dasharray="6 4"/>`);
    add(`<rect x="${sx(b.z[0])}" y="${sy(b.y[1])}" width="${(b.z[1] - b.z[0]) * S}" height="${(b.y[1] - b.y[0]) * S}" fill="none" stroke="${c}" stroke-width="1.5" stroke-dasharray="6 4"/>`);
  }
  for (const [z, label] of [[AXLE_R, 'rear axle'], [FIREWALL, 'firewall']]) {
    add(`<line x1="${sx(z)}" y1="${ty(1.1)}" x2="${sx(z)}" y2="${sy(0)}" stroke="#ffd166" stroke-dasharray="2 4"/>`);
    add(`<text x="${sx(z) + 4}" y="${ty(1.1) + 28}" fill="#ffd166">${label}</text>`);
  }
  // envelopes with numbered markers (one number per part; mirrored sides share it)
  const numbers = new Map();
  for (const e of env) {
    if (!numbers.has(e.id)) {
      numbers.set(e.id, ++n);
      const both = envelopes.filter((x) => x.id === e.id);
      const hits = [...new Set(both.flatMap((x) => x.hits))];
      keyRows.push({ n, fig: FIGURES.indexOf(fig) + 1, id: e.id, group: e.g, mirror: !!e.mirror, x: e.x, y: e.y, z: e.z, rx: e.rx ?? 0, hits });
    }
    const num = numbers.get(e.id);
    const c = COLOURS[e.g];
    const clash = e.hits.length > 0;
    const stroke = clash ? '#ff4d4d' : c;
    const t = (e.rx ?? 0) * (Math.PI / 180);
    const halfW = ((e.x[1] - e.x[0]) / 2) * Math.cos(t) + ((e.y[1] - e.y[0]) / 2) * Math.abs(Math.sin(t));
    const halfH = ((e.y[1] - e.y[0]) / 2) * Math.cos(t) + ((e.x[1] - e.x[0]) / 2) * Math.abs(Math.sin(t));
    const cx = (e.x[0] + e.x[1]) / 2;
    const cy = (e.y[0] + e.y[1]) / 2;
    const zc = (e.z[0] + e.z[1]) / 2;
    add(`<rect x="${sx(e.z[0])}" y="${ty(cx + halfW)}" width="${(e.z[1] - e.z[0]) * S}" height="${2 * halfW * S}" fill="${c}" fill-opacity="0.16" stroke="${stroke}" stroke-width="${clash ? 1.8 : 1.1}"/>`);
    if (e.side !== 'r') {
      add(`<rect x="${sx(e.z[0])}" y="${sy(cy + halfH)}" width="${(e.z[1] - e.z[0]) * S}" height="${2 * halfH * S}" fill="${c}" fill-opacity="0.16" stroke="${stroke}" stroke-width="${clash ? 1.8 : 1.1}"/>`);
    }
    if (e.side !== 'r') {
      for (const [mx, my] of [[sx(zc), ty(cx)], [sx(zc), sy(cy)]]) {
        add(`<circle cx="${mx}" cy="${my}" r="8" fill="#0f1115" stroke="${stroke}"/><text x="${mx}" y="${my + 3.5}" fill="${clash ? '#ff8080' : '#e8e9ec'}" font-size="9.5" text-anchor="middle">${num}</text>`);
      }
    }
  }
  // legend
  let lx = M;
  const ly = FIG_H - 12;
  for (const [name, c] of Object.entries(bayColour)) {
    add(`<line x1="${lx}" y1="${ly - 4}" x2="${lx + 18}" y2="${ly - 4}" stroke="${c}" stroke-width="1.5" stroke-dasharray="6 4"/><text x="${lx + 22}" y="${ly}" fill="#c4c8cf">${name}</text>`);
    lx += 190;
  }
  add(`<rect x="${lx}" y="${ly - 9}" width="10" height="10" fill="none" stroke="#ff4d4d" stroke-width="2"/><text x="${lx + 14}" y="${ly}" fill="#ff8080">touches body model</text>`);
  lx += 150;
  add(`<rect x="${lx}" y="${ly - 9}" width="10" height="10" fill="#9aa0aa" opacity="0.35"/><text x="${lx + 14}" y="${ly}" fill="#c4c8cf">original dressing</text>`);
  add(`</svg>`);
  svgs.push(o.join('\n'));
}
svgs.forEach((svg, i) => writeFileSync(`docs/m2-layout-${i + 1}.svg`, svg));
writeFileSync('docs/m2-layout-key.json', JSON.stringify(keyRows, null, 1));

for (const r of results) console.log(`${r.hits.length ? 'CLASH' : 'ok   '} ${r.name.padEnd(22)} ${r.group.padEnd(13)}${r.where.map((w) => `\n        ${w}`).join('')}`);
console.error('wrote docs/m2-layout-1.svg, docs/m2-layout-2.svg, docs/m2-layout-key.json');
