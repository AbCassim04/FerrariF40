// Dev: compares docs/review/f40-phase9/enclosed/<view>-hidden.png with <view>-shown.png: pixels
// that differ by more than `T` (any channel, 0–255), their share, the largest difference, and
// where (box). Writes <view>-diff.png (differences ×8, red) for any view that differs.
import { readdirSync } from 'node:fs';
import sharp from 'sharp';

const DIR = 'docs/review/f40-phase9/enclosed';
const T = 6;
for (const f of readdirSync(DIR).filter((f) => f.endsWith('-hidden.png')).sort()) {
  const view = f.replace('-hidden.png', '');
  const [a, b] = await Promise.all([`${DIR}/${view}-hidden.png`, `${DIR}/${view}-shown.png`].map((p) => sharp(p).removeAlpha().raw().toBuffer({ resolveWithObject: true })));
  const { width: w, height: h } = a.info;
  let n = 0;
  let max = 0;
  const box = [w, h, 0, 0];
  const diff = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    const d = Math.max(...[0, 1, 2].map((c) => Math.abs(a.data[i * 3 + c] - b.data[i * 3 + c])));
    max = Math.max(max, d);
    diff[i * 3] = Math.min(255, d * 8);
    if (d > T) {
      n++;
      const x = i % w;
      const y = Math.floor(i / w);
      box[0] = Math.min(box[0], x);
      box[1] = Math.min(box[1], y);
      box[2] = Math.max(box[2], x);
      box[3] = Math.max(box[3], y);
    }
  }
  if (n) await sharp(diff, { raw: { width: w, height: h, channels: 3 } }).png().toFile(`${DIR}/${view}-diff.png`);
  console.log(`${view}\t${n} px over ${T} (${((n / (w * h)) * 100).toFixed(3)} %)\tmax ${max}${n ? `\tbox ${box.join(',')}` : ''}`);
}
