// Dev (9C): fits the pop-up pod's raise motion (a turn about a transverse hinge) by matching our
// lowered left pod shell (body model, front clam) to the donor's raised one (normalised as
// prep-donor does). Prints the angle, the hinge (y, z) and the fit error.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { Box3, Matrix4, Vector3 } from 'three';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const verts = async (file, pick, M = new Matrix4()) => {
  const doc = await io.read(file);
  const out = [];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const W = M.clone().multiply(new Matrix4().fromArray(node.getWorldMatrix()));
    for (const p of mesh.listPrimitives()) {
      const pos = p.getAttribute('POSITION');
      const vs = [];
      for (let i = 0; i < pos.getCount(); i++) vs.push(new Vector3().fromArray(pos.getElement(i, [])).applyMatrix4(W));
      out.push(...pick(node, p, vs));
    }
  }
  return out;
};
const S = 0.99448, DZ = 0.0876;
const box = new Box3(new Vector3(0.5, 0.4, 1.57), new Vector3(0.86, 0.69, 1.88));
const N = new Matrix4().makeScale(S, S, S).multiply(new Matrix4().makeTranslation(0, 0, DZ));
// Reference pieces: argv[2] = 'lens' (the donor's raised lens Object_126 vs our lowered pod lens,
// both the same 34-triangle mesh) or 'shell' (Object_124 vs our pod's paint shell).
const which = process.argv[2] ?? 'lens';
const REF = { lens: { donor: 'Object_126', ours: 'F40_Window.001' }, shell: { donor: 'Object_124', ours: 'material' } }[which];
const raised = await verts('assets-src/models/f40/donor-vecarz.glb', (n, p, vs) => (n.getName() === REF.donor ? vs : []), N);
/** Vertices of the connected pieces (welded by position) of a primitive that lie wholly inside `box`. */
function inside(p, vs) {
  const idx = p.getIndices().getArray();
  const key = (v) => v.toArray().map((x) => Math.round(x * 2e4)).join(',');
  const weld = new Map();
  const id = vs.map((v) => (weld.has(key(v)) ? weld.get(key(v)) : (weld.set(key(v), weld.size), weld.size - 1)));
  const par = Int32Array.from({ length: weld.size }, (_, i) => i);
  const find = (a) => (par[a] === a ? a : (par[a] = find(par[a])));
  for (let t = 0; t < idx.length; t += 3) {
    const r = find(id[idx[t]]);
    par[find(id[idx[t + 1]])] = r;
    par[find(id[idx[t + 2]])] = r;
  }
  const groups = new Map();
  vs.forEach((v, i) => {
    const r = find(id[i]);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(v);
  });
  return [...groups.values()].filter((g) => g.every((v) => box.containsPoint(v))).flat();
}
const lowered = await verts('public/models/body.opt.glb', (n, p, vs) => (p.getMaterial()?.getName() === REF.ours ? inside(p, vs) : []));
const centroid = (a) => a.reduce((s, v) => s.add(v), new Vector3()).divideScalar(a.length);
const cR = centroid(raised);
const nn = (set, p) => Math.min(...set.map((q) => q.distanceToSquared(p)));
let best = null;
// Both ways (each vertex set to the other), over the full half turn either side.
for (let deg = -120; deg <= 120; deg += 0.5) {
  const R = new Matrix4().makeRotationX((deg * Math.PI) / 180);
  const moved = lowered.map((v) => v.clone().applyMatrix4(R));
  const t = cR.clone().sub(centroid(moved));
  const placed = moved.map((v) => v.clone().add(t));
  const err = Math.sqrt((placed.reduce((s, v) => s + nn(raised, v), 0) + raised.reduce((s, v) => s + nn(placed, v), 0)) / (placed.length + raised.length));
  if (!best || err < best.err) best = { deg, t, err };
}
// Fixed point of p → R p + t in the y–z plane: the hinge line.
const a = (best.deg * Math.PI) / 180;
const [c, s] = [Math.cos(a), Math.sin(a)];
// (I − R) h = t, with R acting on (y, z): y' = c y − s z, z' = s y + c z.
const A = [[1 - c, s], [-s, 1 - c]];
const det = A[0][0] * A[1][1] - A[0][1] * A[1][0];
const hy = (best.t.y * A[1][1] - A[0][1] * best.t.z) / det;
const hz = (A[0][0] * best.t.z - A[1][0] * best.t.y) / det;
console.log(JSON.stringify({ which, lowered: lowered.length, raised: raised.length, angleDeg: best.deg, hinge: { y: +hy.toFixed(4), z: +hz.toFixed(4) }, xShift: +best.t.x.toFixed(4), rmsErrorMm: +(best.err * 1000).toFixed(1) }));

// Same mesh both sides (equal vertex counts)? Try the vertices in order: the best turn about x
// and shift by least squares (2D Procrustes in y–z), and its error.
if (lowered.length === raised.length) {
  const cl = centroid(lowered);
  let sxx = 0, sxy = 0;
  lowered.forEach((p, i) => {
    const a = [p.y - cl.y, p.z - cl.z];
    const b = [raised[i].y - cR.y, raised[i].z - cR.z];
    sxx += a[0] * b[0] + a[1] * b[1];
    sxy += a[0] * b[1] - a[1] * b[0];
  });
  const ang = Math.atan2(sxy, sxx);
  const R = new Matrix4().makeRotationX(ang);
  const t = cR.clone().sub(cl.clone().applyMatrix4(R));
  const rms = Math.sqrt(lowered.reduce((s, p, i) => s + p.clone().applyMatrix4(R).add(t).distanceToSquared(raised[i]), 0) / lowered.length);
  const [c, s2] = [Math.cos(ang), Math.sin(ang)];
  const det2 = (1 - c) ** 2 + s2 ** 2;
  console.log(JSON.stringify({ inOrder: { angleDeg: +((ang * 180) / Math.PI).toFixed(2), hinge: { y: +(((1 - c) * t.y - s2 * t.z) / det2).toFixed(4), z: +(((1 - c) * t.z + s2 * t.y) / det2).toFixed(4) }, rmsErrorMm: +(rms * 1000).toFixed(2) } }));
}
