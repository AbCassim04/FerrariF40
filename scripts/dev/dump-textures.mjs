// Dev: writes the textures of the named materials of a glTF/GLB to <outDir> as PNG, and prints
// each material's factors (to look at a model's artwork before taking any of it).
//   node scripts/dev/dump-textures.mjs <file.glb> <outDir> <material> [<material> …]
import { mkdirSync, writeFileSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';

const [file, outDir, ...names] = process.argv.slice(2);
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(file);
mkdirSync(outDir, { recursive: true });
for (const m of doc.getRoot().listMaterials()) {
  if (names.length && !names.includes(m.getName())) continue;
  const info = m.getBaseColorTextureInfo();
  console.log(
    `${m.getName()}: base ${m.getBaseColorFactor().map((v) => v.toFixed(3))} emissive ${m.getEmissiveFactor().map((v) => v.toFixed(3))} metal ${m.getMetallicFactor()} rough ${m.getRoughnessFactor().toFixed(3)} ${m.getAlphaMode()} cutoff ${m.getAlphaCutoff()} double ${m.getDoubleSided()} texCoord ${info?.getTexCoord() ?? '-'}`,
  );
  const slots = { base: m.getBaseColorTexture(), emissive: m.getEmissiveTexture(), normal: m.getNormalTexture(), mr: m.getMetallicRoughnessTexture() };
  for (const [slot, tex] of Object.entries(slots)) {
    if (!tex) continue;
    const png = await sharp(tex.getImage()).png().toBuffer();
    const path = `${outDir}/${m.getName()}-${slot}.png`;
    writeFileSync(path, png);
    const meta = await sharp(tex.getImage()).metadata();
    console.log(`  ${slot}: ${meta.width}×${meta.height} ${meta.channels} ch → ${path}`);
  }
}
