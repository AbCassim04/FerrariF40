import { CanvasTexture, NoColorSpace, RepeatWrapping, SRGBColorSpace } from 'three';

/** Procedural textures drawn on a canvas, so the project ships no image assets. */

function canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D) => void, srgb: boolean) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d')!);
  const tex = new CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/**
 * 2×2 twill weave: each tow passes over two and under two, shifted one cell per row,
 * which gives carbon its diagonal stepping. `lo`/`hi` are grey levels (0–255) across
 * each tow, so the same pattern serves as albedo and roughness.
 */
function drawTwill(ctx: CanvasRenderingContext2D, size: number, tows: number, lo: number, hi: number) {
  const cell = size / tows;
  for (let row = 0; row < tows; row++) {
    for (let col = 0; col < tows; col++) {
      const warp = (row + col) % 4 < 2;
      const x = col * cell;
      const y = row * cell;
      const g = warp ? ctx.createLinearGradient(x, y, x + cell, y) : ctx.createLinearGradient(x, y, x, y + cell);
      g.addColorStop(0, grey(lo));
      g.addColorStop(0.5, grey(hi));
      g.addColorStop(1, grey(lo));
      ctx.fillStyle = g;
      ctx.fillRect(x, y, cell, cell);
    }
  }
}

function grey(v: number) {
  return `rgb(${v},${v},${v})`;
}

export function carbonWeaveTextures(repeat: number) {
  const size = 256;
  const tows = 16;
  const map = canvasTexture(size, (ctx) => drawTwill(ctx, size, tows, 14, 40), true);
  const roughness = canvasTexture(size, (ctx) => drawTwill(ctx, size, tows, 150, 90), false);
  for (const t of [map, roughness]) t.repeat.set(repeat, repeat);
  return { map, roughness };
}

/** Fine streaks along U for a brushed-metal roughness map. */
export function brushedRoughnessTexture(repeat: number) {
  const size = 256;
  const tex = canvasTexture(
    size,
    (ctx) => {
      ctx.fillStyle = grey(110);
      ctx.fillRect(0, 0, size, size);
      for (let y = 0; y < size; y++) {
        // Deterministic pseudo-random streak brightness per row.
        const n = Math.sin(y * 12.9898) * 43758.5453;
        const v = 80 + Math.floor((n - Math.floor(n)) * 70);
        ctx.fillStyle = grey(v);
        ctx.fillRect(0, y, size, 1);
      }
    },
    false,
  );
  tex.repeat.set(repeat, repeat);
  return tex;
}
