// Clearance check for the exhaust primaries: tube-to-tube and against nearby engine parts.
//   node --import ./scripts/ts-hooks.mjs scripts/dev/check-headers.mjs
import { DIMS } from '../../src/config/dims.ts';
import { primaries } from '../../src/parts/engine/exhaustLayout.ts';
import { bankAxis, bankOutboard, headDeckA } from '../../src/parts/engine/layout.ts';

const E = DIMS.engine;
const r = E.exhaust.primaryRadius;
const N = 600;
for (const s of ['l', 'r']) {
  const tubes = primaries(s).map((p) => p.curve.getSpacedPoints(N));
  let worst = { d: 9 };
  for (let a = 0; a < tubes.length; a++) {
    for (let b = a + 1; b < tubes.length; b++) {
      for (const p of tubes[a]) for (const q of tubes[b]) {
        const d = p.distanceTo(q);
        if (d < worst.d) worst = { d, a, b, at: p.toArray().map((v) => v.toFixed(3)).join(',') };
      }
    }
  }
  console.log(`[${s}] closest tubes ${worst.a}-${worst.b}: centre gap ${(worst.d * 1000).toFixed(1)} mm (need ≥ ${(2 * r * 1000 + 2).toFixed(0)}) at ${worst.at}`);
  // Obstacles (engine coordinates, left-bank x; mirror for right).
  const sx = s === 'l' ? 1 : -1;
  const M = E.mount, F = E.oilFilter, A = E.auxMotor;
  const boxes = {
    skirt: { x: [0, E.block.skirtHalfWidth + E.block.rib.depth], y: [E.block.panRail.y, 0.113], z: [E.blockRearZ, E.blockFrontZ] },
    panRail: { x: [0, E.block.panRail.halfWidth], y: [E.block.panRail.y, E.block.bottomY], z: [E.blockRearZ, E.blockFrontZ] },
    sumpFlange: { x: [0, E.sump.flange.halfWidth], y: [E.sumpBottomY, E.block.panRail.y], z: [E.blockRearZ, E.blockFrontZ] },
    mountBush: { x: [E.block.skirtHalfWidth, E.block.skirtHalfWidth + M.bracket[0] + M.bushRadius * (1 + M.bushOverlap)], y: [M.y - M.bushLength / 2, M.y + M.bushLength / 2], z: [M.z - M.bracket[2] / 2, M.z + M.bracket[2] / 2] },
    oilFilter: { x: [F.x - F.radius, F.x + F.radius], y: [F.top - F.length, F.top], z: [F.z - F.radius, F.z + F.radius] },
    oilCooler: s === 'r' ? { x: [-(E.oilCooler.centre[0]) - E.oilCooler.size[0] / 2, -(E.oilCooler.centre[0]) + E.oilCooler.size[0] / 2], y: [E.oilCooler.centre[1] - E.oilCooler.size[1] / 2, E.oilCooler.centre[1] + E.oilCooler.size[1] / 2], z: [E.oilCooler.centre[2] - E.oilCooler.size[2] / 2, E.oilCooler.centre[2] + E.oilCooler.size[2] / 2] } : null,
    ecu: { x: [E.ecu.centre[0] - 0.06, E.ecu.centre[0] + 0.06], y: [E.ecu.centre[1] - E.ecu.size[1] / 2, E.ecu.centre[1] + E.ecu.size[1] / 2], z: [E.ecu.centre[2] - 0.1, E.ecu.centre[2] + 0.1] },
    auxMotor: s === 'l' ? { x: [A.centre[0] - A.radius, A.centre[0] + A.radius], y: [A.centre[1] - A.radius, A.centre[1] + A.radius], z: [E.blockFrontZ + A.frontGap - A.length, E.blockFrontZ + A.frontGap] } : null,
  };
  for (const [name, b] of Object.entries(boxes)) {
    if (!b) continue;
    let min = 9;
    for (const t of tubes) for (const p of t) {
      const x = sx * p.x;
      const dx = Math.max(b.x[0] - x, 0, x - b.x[1]);
      const dy = Math.max(b.y[0] - p.y, 0, p.y - b.y[1]);
      const dz = Math.max(b.z[0] - p.z, 0, p.z - b.z[1]);
      min = Math.min(min, Math.hypot(dx, dy, dz) - r);
    }
    console.log(`   ${name.padEnd(11)} clearance ${(min * 1000).toFixed(1)} mm`);
  }
  // Head: outboard face region in bank-local coordinates (skip the first 5 cm from each port).
  let headMin = 9;
  const u = bankAxis(s), v = bankOutboard(s);
  for (const t of tubes) t.forEach((p, i) => {
    if (i < N * 0.05) return;
    const a = p.x * u.x + p.y * u.y, b = p.x * v.x + p.y * v.y;
    if (a < E.deckHeight - 0.02 || a > headDeckA + E.head.height) return;
    headMin = Math.min(headMin, b - E.head.halfWidth - r);
  });
  console.log(`   head side  clearance ${(headMin * 1000).toFixed(1)} mm`);
}
