// Dev: tiles images into one sheet (crop box x,y,w,h applied to each, `cols` across, scaled by `scale`).
//   node scripts/dev/montage.mjs <out.png> <x,y,w,h> <cols> <scale> <in.png> [<in.png> …]
import sharp from 'sharp';

const [out, crop, colsArg, scaleArg, ...files] = process.argv.slice(2);
const [x, y, w, h] = crop.split(',').map(Number);
const cols = Number(colsArg);
const scale = Number(scaleArg);
const tw = Math.round(w * scale);
const th = Math.round(h * scale);
const tiles = await Promise.all(files.map((f) => sharp(f).extract({ left: x, top: y, width: w, height: h }).resize(tw, th).png().toBuffer()));
const rows = Math.ceil(files.length / cols);
await sharp({ create: { width: tw * cols + 4 * (cols - 1), height: th * rows + 4 * (rows - 1), channels: 3, background: '#222' } })
  .composite(tiles.map((input, i) => ({ input, left: (i % cols) * (tw + 4), top: Math.floor(i / cols) * (th + 4) })))
  .png()
  .toFile(out);
console.log(out, tw * cols, th * rows);
