// Dev: summary of a glTF/GLB: nodes with meshes (world bbox, triangles, materials), materials (textures), textures (size, type).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import draco3d from 'draco3d';
import { Box3, Matrix4, Vector3 } from 'three';

const file = process.argv[2];
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'draco3d.decoder': await draco3d.createDecoderModule() });
await MeshoptDecoder.ready;
const doc = await io.read(file);
const root = doc.getRoot();
const texName = (t) => (t ? `${t.getName() || t.getURI() || '?'}` : '-');
console.log('## textures');
for (const t of root.listTextures()) {
  const img = t.getImage();
  const size = t.getSize();
  console.log(`${texName(t)}\t${t.getMimeType()}\t${size?.join('x')}\t${(img?.byteLength / 1024).toFixed(0)} KB`);
}
console.log('## materials');
for (const m of root.listMaterials()) {
  const parts = [];
  if (m.getBaseColorTexture()) parts.push(`base:${texName(m.getBaseColorTexture())}`);
  if (m.getNormalTexture()) parts.push(`normal:${texName(m.getNormalTexture())}`);
  if (m.getMetallicRoughnessTexture()) parts.push(`mr:${texName(m.getMetallicRoughnessTexture())}`);
  if (m.getEmissiveTexture()) parts.push(`em:${texName(m.getEmissiveTexture())}`);
  if (m.getOcclusionTexture()) parts.push(`ao:${texName(m.getOcclusionTexture())}`);
  console.log(`${m.getName()}\tcol ${m.getBaseColorFactor().map((v) => v.toFixed(2)).join(',')}\tmet ${m.getMetallicFactor()} rough ${m.getRoughnessFactor()}\t${m.getAlphaMode()}\t${parts.join(' ')}`);
}
console.log('## mesh nodes');
const wm = (n) => new Matrix4().fromArray(n.getWorldMatrix());
let total = 0;
for (const n of root.listNodes()) {
  const mesh = n.getMesh();
  if (!mesh) continue;
  const M = wm(n);
  const box = new Box3();
  let tris = 0;
  const mats = new Set();
  for (const p of mesh.listPrimitives()) {
    const pos = p.getAttribute('POSITION');
    const v = new Vector3();
    for (let i = 0; i < pos.getCount(); i++) box.expandByPoint(v.fromArray(pos.getElement(i, [])).applyMatrix4(M));
    tris += (p.getIndices()?.getCount() ?? pos.getCount()) / 3;
    mats.add(p.getMaterial()?.getName());
  }
  total += tris;
  const f = (x) => x.toFixed(3);
  console.log(`${n.getName()}\t${tris}\t[${f(box.min.x)},${f(box.min.y)},${f(box.min.z)}]..[${f(box.max.x)},${f(box.max.y)},${f(box.max.z)}]\t${[...mats].join('|')}`);
}
console.log('total tris', total);
