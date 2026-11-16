// Dev (Playwright MCP run_code, `filename`): a flame pop, frame by frame (the pop posed at six
// points of its life, strength 1, 0.5 m), from the rear ¾ and from the side. Desktop page.
async (page) => {
  await page.waitForFunction(() => window.__dev && __dev.setLamps, null, { timeout: 300000 });
  const ages = [0.04, 0.12, 0.25, 0.45, 0.65, 0.85];
  const views = { rear34: [[-1.25, 0.55, -3.55], [0.0, 0.3, -2.25]], side: [[-1.6, 0.42, -2.55], [0.0, 0.3, -2.3]] };
  const prefix = globalThis.FLAME_PREFIX ?? 'wip-fix-flame';
  for (const [name, [pos, target]] of Object.entries(views)) {
    await page.evaluate(([p, t]) => __dev.setCamera(p, t), [pos, target]);
    for (const [k, age] of ages.entries()) {
      await page.evaluate((age) => __dev.engine({ rpm: 6000, throttle: 0, gear: 0, speedKmh: 0, crankAngle: 40, flame: { age, strength: 1, length: 0.5 } }), age);
      await page.evaluate(() => __dev.screenshotReady({ timeout: 90000 }));
      await page.screenshot({ path: `docs/review/f40-phase9/${prefix}-${name}-${k + 1}.png` });
    }
  }
  return 'ok';
}
