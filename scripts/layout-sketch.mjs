#!/usr/bin/env node
/**
 * F40 layout sketch: to-scale top and side views with the measured bays, the model's
 * stand-in powertrain (hidden ghost) and stand-in frame/suspension as placement guides,
 * the engine as built (from DIMS) and the planned envelope of every part still to build.
 * Each envelope is clash-tested against the fixed bodywork and the wheels (BVH, real
 * triangles); touching the stand-in chassis is reported separately (our spaceframe and
 * suspension replace it).
 *
 *   node --import ./scripts/ts-hooks.mjs scripts/layout-sketch.mjs
 *   → docs/f40-layout-1.svg, docs/f40-layout-2.svg, docs/f40-layout-key.json
 *
 * The planned envelopes are proposals for review (docs/F40-PLAN.md); once approved they
 * move into src/config/dims.ts.
 */
import { writeFileSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { Box3, BufferAttribute, BufferGeometry, Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { DIMS } from '../src/config/dims.ts';

const E = DIMS.engine;
const B = DIMS.bays;
const AXLE_R = DIMS.axle.rearZ;
const AXLE_F = DIMS.axle.frontZ;
const CY = E.crankHeight;
const W = DIMS.wheel;

// ─── The engine as built (from DIMS, assembled pose) ─────────────────────────

const cos = Math.cos(E.halfBank);
const sin = Math.sin(E.halfBank);
const coverTopY = CY + E.coverTopY;
const halfCovers = E.widthAcrossCovers / 2;
const BUILT = [
  { id: 'engine-block', g: 'built', x: [-E.block.skirtHalfWidth, E.block.skirtHalfWidth], y: [CY + E.block.panRail.y, CY + E.deckHeight * cos + E.block.deckHalfWidth * sin], z: [E.blockRearZ, E.blockFrontZ] },
  { id: 'heads + cam covers', g: 'built', x: [-halfCovers, halfCovers], y: [CY + E.deckHeight * cos - E.head.halfWidth * sin, coverTopY], z: [E.blockRearZ, E.blockFrontZ] },
  { id: 'belt cover + belts', g: 'built', x: [-halfCovers, halfCovers], y: [CY - 0.06, coverTopY], z: [E.blockFrontZ, E.frontZ] },
  { id: 'dry-sump-pan', g: 'built', x: [-E.sump.flange.halfWidth, E.sump.flange.halfWidth], y: [CY + E.sumpBottomY, CY + E.block.panRail.y], z: [E.blockRearZ, E.blockFrontZ] },
];

// ─── Planned envelopes (car coordinates, metres, assembled) ──────────────────
// box: x [min,max] (left side; `mirror` adds the right), y, z. `rx`: tilt about z (deg).
// `via`: what it is placed against (stand-in ghost, bay, reference figure).
// `contacts`: model parts it is designed to touch (through the bulkhead, through the grille, a caliper on its disc).

const PLAN = [
  // Phase 2 — engine completion: intake, ignition, ancillaries
  { id: 'intake-plenum', g: 'intake', x: [-0.12, 0.12], y: [0.58, 0.74], z: [-0.86, -0.47], via: 'in the V, under the shelf (0.79) and the Lexan' },
  { id: 'intake-runners', g: 'intake', mirror: true, x: [0.02, 0.13], y: [0.42, 0.62], z: [-0.83, -0.5], via: 'one per port, into the plenum' },
  { id: 'throttle-bodies', g: 'intake', x: [-0.1, 0.1], y: [0.6, 0.72], z: [-0.95, -0.86], via: 'rear of the plenum, fed by the intercooler pipes' },
  { id: 'fuel-rail', g: 'intake', mirror: true, x: [0.04, 0.12], y: [0.46, 0.54], z: [-0.84, -0.5] },
  { id: 'distributor', g: 'engine', mirror: true, x: [0.06, 0.16], y: [0.62, 0.72], z: [-0.92, -0.84], via: 'est: driven off each bank’s cam at the flywheel end' },
  { id: 'alternator', g: 'engine', x: [0.12, 0.26], y: [0.14, 0.27], z: [-0.47, -0.4], via: 'belt-driven at the timing end, low on the left' },
  { id: 'oil-tank', g: 'engine', x: [0.34, 0.44], y: [0.47, 0.72], z: [-1.08, -0.8], via: 'open question: position not found; proposed beside the left bank, above the manifold' },
  // Phase 3 — turbos, intercoolers, exhaust
  { id: 'exhaust-manifold', g: 'exhaust', mirror: true, x: [0.22, 0.4], y: [0.2, 0.45], z: [-1.2, -0.47], via: '4-into-1, outboard and below each bank, back to its turbo' },
  { id: 'turbocharger', g: 'turbo', mirror: true, x: [0.24, 0.46], y: [0.36, 0.6], z: [-1.42, -1.18], via: 'ghost turbos, moved inboard of the rear coilovers' },
  { id: 'wastegate', g: 'turbo', mirror: true, x: [0.2, 0.28], y: [0.36, 0.48], z: [-1.56, -1.44], via: 'one per turbo (mitorosso says one valve: open question)' },
  { id: 'intercooler', g: 'turbo', mirror: true, x: [0.2, 0.58], y: [0.6, 0.78], z: [-1.64, -1.42], via: 'ghost intercoolers, over the turbos, under the rear deck' },
  { id: 'charge-pipes', g: 'turbo', mirror: true, x: [0.03, 0.26], y: [0.52, 0.66], z: [-1.42, -0.92], via: 'compressor → intercooler → throttle bodies, over the gearbox' },
  { id: 'downpipe', g: 'exhaust', mirror: true, x: [0.18, 0.34], y: [0.3, 0.46], z: [-1.7, -1.42] },
  { id: 'silencer', g: 'exhaust', x: [-0.34, 0.34], y: [0.46, 0.7], z: [-1.88, -1.7], via: 'ghost silencer box across the tail' },
  { id: 'tailpipes', g: 'exhaust', x: [-0.25, 0.25], y: [0.33, 0.5], z: [-2.1, -1.84], via: 'three: two from the silencer, the centre one from the wastegates', contacts: ['rear-clam'] },
  // Phase 4 — transmission
  { id: 'flywheel+twin-plate-clutch', g: 'transmission', x: [-0.12, 0.12], y: [CY - 0.12, CY + 0.12], z: [-0.96, -0.86], via: 'behind the block, on the crank axis' },
  { id: 'bellhousing', g: 'transmission', x: [-0.16, 0.16], y: [0.14, 0.42], z: [-1.0, -0.86] },
  { id: 'gearbox-casing', g: 'transmission', x: [-0.17, 0.17], y: [0.25, 0.5], z: [-1.8, -1.0], via: 'ghost gearbox: 5-speed, diff on the axle line; over the diffuser' },
  { id: 'lsd', g: 'transmission', x: [-0.13, 0.13], y: [0.2, 0.44], z: [-1.34, -1.11], via: 'limited-slip diff on the rear axle line' },
  { id: 'driveshaft', g: 'transmission', mirror: true, x: [0.19, 0.66], y: [0.28, 0.37], z: [-1.27, -1.18], via: 'diff flange to the hub, near horizontal (wheel centre 0.325)' },
  { id: 'gearbox-oil-cooler', g: 'transmission', x: [0.24, 0.36], y: [0.28, 0.36], z: [-1.72, -1.58], via: 'ref: left side' },
  { id: 'shift-linkage', g: 'transmission', x: [0.0, 0.08], y: [0.16, 0.26], z: [-1.0, 0.25], via: 'gate to selector along the tunnel', contacts: ['body-shell', 'interior'] },
  // Phase 5 — chassis, suspension, brakes
  { id: 'frame-rear-lower-rail', g: 'chassis', mirror: true, x: [0.3, 0.35], y: [0.12, 0.17], z: [-2.0, -0.32], via: 'stand-in rail; runs on through the bulkhead', contacts: ['body-shell'] },
  { id: 'frame-rear-upper-rail', g: 'chassis', mirror: true, x: [0.41, 0.46], y: [0.39, 0.45], z: [-2.0, -0.36], via: 'stand-in rail moved outboard of the exhaust manifold; through the bulkhead', contacts: ['body-shell'] },
  { id: 'frame-axle-crossmember', g: 'chassis', x: [-0.42, 0.42], y: [0.72, 0.76], z: [-1.32, -1.27], via: 'stand-in crossmember over the axle' },
  { id: 'rear-coilover', g: 'suspension', mirror: true, x: [0.47, 0.6], y: [0.24, 0.78], z: [-1.3, -1.2], via: 'stand-in coilover' },
  { id: 'rear-wishbones', g: 'suspension', mirror: true, x: [0.3, 0.6], y: [0.16, 0.5], z: [-1.42, -1.15], via: 'behind the bay liner (ends z −1.14); ball joints inside the rim', contacts: ['wheel-rl', 'wheel-rr'] },
  { id: 'rear-upright', g: 'suspension', mirror: true, x: [0.62, 0.72], y: [0.18, 0.5], z: [-1.32, -1.13] },
  { id: 'brake-caliper-rear', g: 'suspension', mirror: true, x: [0.68, 0.74], y: [0.36, 0.46], z: [-1.36, -1.17], via: '4-piston, straddling the disc’s upper rear', contacts: ['brake-disc-rl', 'brake-disc-rr'] },
  { id: 'frame-roll-structure', g: 'chassis', x: [-0.45, 0.45], y: [0.15, 1.02], z: [-0.38, -0.32], via: 'hoop behind the seats, inside the bulkhead', contacts: ['body-shell', 'interior', 'glass'] },
  { id: 'frame-front-rail', g: 'chassis', mirror: true, x: [0.38, 0.43], y: [0.13, 0.18], z: [0.75, 2.0], via: 'est: under the footwell and the front compartment', contacts: ['body-shell', 'interior'] },
  { id: 'front-wishbones', g: 'suspension', mirror: true, x: [0.47, 0.66], y: [0.18, 0.51], z: [1.15, 1.4], via: 'stand-in wishbones, through the wheelhouse liner', contacts: ['wheel-fl', 'wheel-fr', 'body-shell'] },
  { id: 'front-coilover', g: 'suspension', mirror: true, x: [0.52, 0.62], y: [0.26, 0.62], z: [1.18, 1.27], via: 'stand-in coilover, through the wheelhouse liner', contacts: ['body-shell'] },
  { id: 'front-upright', g: 'suspension', mirror: true, x: [0.64, 0.73], y: [0.2, 0.47], z: [1.13, 1.33], contacts: ['body-shell'] },
  { id: 'brake-caliper-front', g: 'suspension', mirror: true, x: [0.69, 0.75], y: [0.36, 0.43], z: [1.07, 1.26], via: '4-piston, straddling the disc', contacts: ['brake-disc-fl', 'brake-disc-fr', 'body-shell'] },
  { id: 'steering-rack', g: 'suspension', x: [-0.4, 0.4], y: [0.29, 0.36], z: [1.32, 1.39], via: 'stand-in tie rods' },
  { id: 'radiator', g: 'cooling', x: [-0.36, 0.36], y: [0.22, 0.42], z: [2.0, 2.12], via: 'stand-in radiator in the nose' },
  // Phase 6 — cooling, fuel, electrics
  { id: 'ecu', g: 'engine', mirror: true, x: [0.34, 0.41], y: [0.5, 0.66], z: [-0.74, -0.55], via: 'est: high on the bay walls, ahead of the oil tank' },
];

const COLOURS = {
  built: '#e8eaee', engine: '#c9ced6', intake: '#a6c8ff', exhaust: '#e0a05a', turbo: '#ff8a3d',
  transmission: '#8fb3d9', chassis: '#9d8fd9', suspension: '#b7d97a', cooling: '#59c3c3',
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
const STANDIN = 'model-chassis';

// ─── Clash-test each envelope ────────────────────────────────────────────────

const mirrorOf = (p) => (p.mirror ? [{ ...p, side: 'l' }, { ...p, side: 'r', x: [-p.x[1], -p.x[0]], rx: p.rx ? -p.rx : 0 }] : [p]);
const built = BUILT.flatMap(mirrorOf);
const envelopes = PLAN.flatMap(mirrorOf);
const results = [];
for (const e of [...built, ...envelopes]) {
  const size = new Vector3(e.x[1] - e.x[0], e.y[1] - e.y[0], e.z[1] - e.z[0]);
  const centre = new Vector3((e.x[0] + e.x[1]) / 2, (e.y[0] + e.y[1]) / 2, (e.z[0] + e.z[1]) / 2);
  const local = new Box3(size.clone().multiplyScalar(-0.5), size.clone().multiplyScalar(0.5));
  const toCar = new Matrix4().compose(centre, new Quaternion().setFromEuler(new Euler(0, 0, ((e.rx ?? 0) * Math.PI) / 180)), new Vector3(1, 1, 1));
  const touching = [...bvhs].filter(([, bvh]) => bvh.intersectsBox(local, toCar)).map(([id]) => id);
  const aabb = local.clone().applyMatrix4(toCar);
  const where = (id) => {
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
  };
  e.contacts = touching.filter((id) => (e.contacts ?? []).includes(id));
  e.hits = touching.filter((id) => id !== STANDIN && !e.contacts.includes(id));
  e.standin = touching.includes(STANDIN);
  results.push({ name: e.id + (e.side ? `-${e.side}` : ''), group: e.g, hits: e.hits.map(where), contacts: e.contacts, standin: e.standin ? where(STANDIN) : null });
}

// ─── Silhouettes and guides ───────────────────────────────────────────────────

const BIN = 0.02;
function silhouettes(view) {
  const nb = Math.round((view.z[1] - view.z[0]) / BIN);
  const side = Array.from({ length: nb }, () => ({ lo: Infinity, hi: -Infinity }));
  const top = Array.from({ length: nb }, () => 0);
  for (const [id, pos] of parts) {
    if (/^(wheel|brake-disc)-|model-engine-bay|model-chassis/.test(id)) continue;
    for (let i = 0; i < pos.length; i += 3) {
      const b = Math.floor((pos[i + 2] - view.z[0]) / BIN);
      if (b < 0 || b >= nb) continue;
      side[b].lo = Math.min(side[b].lo, pos[i + 1]);
      side[b].hi = Math.max(side[b].hi, pos[i + 1]);
      if (pos[i + 1] > 0.2) top[b] = Math.max(top[b], Math.abs(pos[i]));
    }
  }
  return { side, top };
}
/** Occupied 4 cm cells of a model part (for the faint guides). */
function cells(id) {
  const out = new Set();
  const pos = parts.get(id);
  for (let i = 0; i < pos.length; i += 3) out.add([pos[i], pos[i + 1], pos[i + 2]].map((v) => Math.floor(v / 0.04)).join(','));
  return out;
}
const ghost = cells('model-engine-bay');
const standin = cells(STANDIN);

// ─── SVG ─────────────────────────────────────────────────────────────────────

const FIGURES = [
  {
    file: 'docs/f40-layout-1.svg',
    title: 'Figure 1 — engine bay: engine as built, intake, turbos, intercoolers, transmission, exhaust',
    groups: ['built', 'engine', 'intake', 'turbo', 'transmission', 'exhaust'],
    view: { z: [-2.25, -0.25], scale: 360 },
    skip: /^shift-linkage/,
  },
  {
    file: 'docs/f40-layout-2.svg',
    title: 'Figure 2 — frame, suspension, brakes, radiator, shift linkage (whole car; built engine for reference)',
    view: { z: [-2.25, 2.35], scale: 170 },
    groups: ['built', 'chassis', 'suspension', 'transmission', 'cooling'],
    only: /^(engine-block|heads|frame|rear-|front-|brake|steering|radiator|shift|driveshaft|gearbox-casing)/,
  },
];

let n = 0;
const keyRows = [];
for (const fig of FIGURES) {
  const { view } = fig;
  const S = view.scale;
  const M = 48;
  const Wd = Math.round((view.z[1] - view.z[0]) * S) + 2 * M;
  const TOP_H = Math.round(2.2 * S);
  const SIDE_H = Math.round(1.25 * S);
  const FIG_H = 40 + TOP_H + 30 + SIDE_H + 60;
  const sx = (z) => M + (z - view.z[0]) * S;
  const ty = (x) => 40 + (1.1 - x) * S; // top view, +X (car's left) up
  const sy = (y) => 40 + TOP_H + 30 + (1.25 - y) * S;
  const { side: sideSil, top: topSil } = silhouettes(view);
  const env = [...built, ...envelopes].filter((e) => fig.groups.includes(e.g) && (!fig.skip || !fig.skip.test(e.id)) && (!fig.only || fig.only.test(e.id)));
  const o = [];
  const add = (str) => o.push(str);
  add(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Wd} ${FIG_H}" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="11">`);
  add(`<rect width="${Wd}" height="${FIG_H}" fill="#0f1115"/>`);
  add(`<text x="${M}" y="22" fill="#e8e9ec" font-size="14">${fig.title}</text>`);
  add(`<text x="${M}" y="${ty(1.1) + 14}" fill="#8a8f99">TOP (car's left +X up)</text>`);
  add(`<text x="${M}" y="${sy(1.25) + 14}" fill="#8a8f99">SIDE (from the left)</text>`);
  const step = view.scale > 300 ? 0.1 : 0.5;
  for (let z = Math.ceil(view.z[0] / step) * step; z <= view.z[1] + 1e-9; z = Math.round((z + step) * 100) / 100) {
    const major = Math.abs(z * 2 - Math.round(z * 2)) < 1e-6;
    add(`<line x1="${sx(z)}" y1="${ty(1.1)}" x2="${sx(z)}" y2="${ty(-1.1)}" stroke="${major ? '#252a33' : '#171a20'}"/>`);
    add(`<line x1="${sx(z)}" y1="${sy(1.25)}" x2="${sx(z)}" y2="${sy(0)}" stroke="${major ? '#252a33' : '#171a20'}"/>`);
    if (major) add(`<text x="${sx(z)}" y="${sy(0) + 16}" fill="#6b717c" text-anchor="middle">z ${z.toFixed(1)}</text>`);
  }
  for (let y = 0.2; y <= 1.2; y = Math.round((y + 0.2) * 10) / 10) add(`<text x="${M - 6}" y="${sy(y) + 4}" fill="#6b717c" text-anchor="end">${y.toFixed(1)}</text>`);
  add(`<line x1="${sx(view.z[0])}" y1="${sy(0)}" x2="${sx(view.z[1])}" y2="${sy(0)}" stroke="#3a404b"/>`);
  const up = [];
  const dn = [];
  sideSil.forEach((b, i) => {
    if (!Number.isFinite(b.hi)) return;
    const z = view.z[0] + (i + 0.5) * BIN;
    up.push(`${sx(z)},${sy(b.hi)}`);
    dn.unshift(`${sx(z)},${sy(b.lo)}`);
  });
  add(`<polygon points="${[...up, ...dn].join(' ')}" fill="#181b22" stroke="#3d4452"/>`);
  const tu = topSil.map((x, i) => `${sx(view.z[0] + (i + 0.5) * BIN)},${ty(x)}`);
  const td = topSil.map((x, i) => `${sx(view.z[0] + (i + 0.5) * BIN)},${ty(-x)}`).reverse();
  add(`<polygon points="${[...tu, ...td].join(' ')}" fill="#181b22" stroke="#3d4452"/>`);
  for (const [set, colour, opacity] of [[standin, '#9d8fd9', 0.1], [ghost, '#5fd0ff', 0.08]]) {
    for (const c of set) {
      const [x, y, z] = c.split(',').map((v) => Number(v) * 0.04);
      if (z < view.z[0] || z > view.z[1]) continue;
      add(`<rect x="${sx(z)}" y="${ty(x + 0.04)}" width="${0.04 * S}" height="${0.04 * S}" fill="${colour}" opacity="${opacity}"/>`);
      add(`<rect x="${sx(z)}" y="${sy(y + 0.04)}" width="${0.04 * S}" height="${0.04 * S}" fill="${colour}" opacity="${opacity}"/>`);
    }
  }
  for (const [axle, w] of [[AXLE_R, W.rear], [AXLE_F, W.front]]) {
    if (axle < view.z[0] || axle > view.z[1]) continue;
    const r = DIMS.model.tyreRadius;
    add(`<circle cx="${sx(axle)}" cy="${sy(w.centreY)}" r="${r * S}" fill="none" stroke="#4b5260" stroke-width="2"/>`);
    for (const sgn of [1, -1]) add(`<rect x="${sx(axle - r)}" y="${ty(sgn * w.centreX + 0.16)}" width="${2 * r * S}" height="${0.32 * S}" fill="none" stroke="#4b5260" stroke-width="2"/>`);
  }
  const bayColour = { engine: '#5fd0ff', engineTall: '#a78bff', transaxle: '#5fffb0' };
  for (const [name, b] of Object.entries({ engine: B.engine, engineTall: B.engineTall, transaxle: B.transaxle })) {
    const [cx, cy, cz] = b.centre;
    const [w, h, d] = b.size;
    const c = bayColour[name];
    add(`<rect x="${sx(cz - d / 2)}" y="${ty(cx + w / 2)}" width="${d * S}" height="${w * S}" fill="none" stroke="${c}" stroke-width="1.5" stroke-dasharray="6 4"/>`);
    add(`<rect x="${sx(cz - d / 2)}" y="${sy(cy + h / 2)}" width="${d * S}" height="${h * S}" fill="none" stroke="${c}" stroke-width="1.5" stroke-dasharray="6 4"/>`);
  }
  for (const [z, label] of [[AXLE_R, 'rear axle'], [B.firewallZ, 'bay front wall'], [AXLE_F, 'front axle']]) {
    if (z < view.z[0] || z > view.z[1]) continue;
    add(`<line x1="${sx(z)}" y1="${ty(1.1)}" x2="${sx(z)}" y2="${sy(0)}" stroke="#ffd166" stroke-dasharray="2 4"/>`);
    add(`<text x="${sx(z) + 4}" y="${ty(1.1) + 28}" fill="#ffd166">${label}</text>`);
  }
  const numbers = new Map();
  for (const e of env) {
    if (!numbers.has(e.id)) {
      numbers.set(e.id, ++n);
      const both = [...built, ...envelopes].filter((x) => x.id === e.id);
      keyRows.push({
        n,
        fig: FIGURES.indexOf(fig) + 1,
        id: e.id,
        group: e.g,
        mirror: !!e.mirror,
        x: e.x,
        y: e.y,
        z: e.z,
        via: e.via ?? '',
        hits: [...new Set(both.flatMap((x) => x.hits))],
        contacts: [...new Set(both.flatMap((x) => x.contacts))],
        standin: both.some((x) => x.standin),
      });
    }
    const num = numbers.get(e.id);
    const c = COLOURS[e.g];
    const clash = e.hits.length > 0;
    const stroke = clash ? '#ff4d4d' : c;
    const cx = (e.x[0] + e.x[1]) / 2;
    const cy = (e.y[0] + e.y[1]) / 2;
    const zc = (e.z[0] + e.z[1]) / 2;
    const dash = e.g === 'built' ? '' : ' stroke-dasharray="4 2"';
    add(`<rect x="${sx(e.z[0])}" y="${ty(e.x[1])}" width="${(e.z[1] - e.z[0]) * S}" height="${(e.x[1] - e.x[0]) * S}" fill="${c}" fill-opacity="${e.g === 'built' ? 0.28 : 0.14}" stroke="${stroke}" stroke-width="${clash ? 1.8 : 1.1}"${dash}/>`);
    if (e.side !== 'r') {
      add(`<rect x="${sx(e.z[0])}" y="${sy(e.y[1])}" width="${(e.z[1] - e.z[0]) * S}" height="${(e.y[1] - e.y[0]) * S}" fill="${c}" fill-opacity="${e.g === 'built' ? 0.28 : 0.14}" stroke="${stroke}" stroke-width="${clash ? 1.8 : 1.1}"${dash}/>`);
      for (const [mx, my] of [[sx(zc), ty(cx)], [sx(zc), sy(cy)]]) {
        add(`<circle cx="${mx}" cy="${my}" r="8" fill="#0f1115" stroke="${stroke}"/><text x="${mx}" y="${my + 3.5}" fill="${clash ? '#ff8080' : '#e8e9ec'}" font-size="9.5" text-anchor="middle">${num}</text>`);
      }
    }
  }
  let lx = M;
  let ly = FIG_H - 26;
  const legend = (sym, label, w = 170) => {
    if (lx + w > Wd - 8) {
      lx = M;
      ly += 16;
    }
    add(`${sym(lx, ly)}<text x="${lx + 22}" y="${ly}" fill="#c4c8cf">${label}</text>`);
    lx += w;
  };
  for (const [name, c] of Object.entries(bayColour)) legend((x, y) => `<line x1="${x}" y1="${y - 4}" x2="${x + 18}" y2="${y - 4}" stroke="${c}" stroke-width="1.5" stroke-dasharray="6 4"/>`, `bay: ${name}`, 150);
  legend((x, y) => `<rect x="${x}" y="${y - 9}" width="12" height="10" fill="#e8eaee" fill-opacity="0.28" stroke="#e8eaee"/>`, 'built', 80);
  legend((x, y) => `<rect x="${x}" y="${y - 9}" width="12" height="10" fill="none" stroke="#c9ced6" stroke-dasharray="4 2"/>`, 'planned', 100);
  legend((x, y) => `<rect x="${x}" y="${y - 9}" width="12" height="10" fill="none" stroke="#ff4d4d" stroke-width="2"/>`, 'touches body/wheels', 180);
  legend((x, y) => `<rect x="${x}" y="${y - 9}" width="12" height="10" fill="#5fd0ff" opacity="0.4"/>`, 'stand-in powertrain', 180);
  legend((x, y) => `<rect x="${x}" y="${y - 9}" width="12" height="10" fill="#9d8fd9" opacity="0.4"/>`, 'stand-in frame/suspension', 200);
  add(`</svg>`);
  writeFileSync(fig.file, o.join('\n'));
}
writeFileSync('docs/f40-layout-key.json', JSON.stringify(keyRows, null, 1));

for (const r of results) {
  const tag = r.hits.length ? 'CLASH' : 'ok   ';
  const notes = [r.contacts.length ? `contacts (expected): ${r.contacts.join(', ')}` : '', r.standin ? 'touches stand-in chassis' : ''].filter(Boolean).join('; ');
  console.log(`${tag} ${r.name.padEnd(30)} ${r.group.padEnd(13)}${notes ? ` (${notes})` : ''}${r.hits.map((w) => `\n        ${w}`).join('')}`);
}
console.error('wrote docs/f40-layout-1.svg, docs/f40-layout-2.svg, docs/f40-layout-key.json');
