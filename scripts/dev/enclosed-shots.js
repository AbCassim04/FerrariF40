// Dev (Playwright MCP run_code, `filename`): the enclosed parts (SCENE.enclosed) skipped vs forced
// shown, from every side and close into the bay; pairs land in docs/review/f40-phase9/enclosed/
// and scripts/dev/enclosed-diff.mjs compares them. Assembled, engine running (held, crank posed).
async (page) => {
  await page.waitForFunction(() => window.__dev && __dev.showEnclosed, null, { timeout: 300000 });
  const views = {
    front34: null,
    rear34: null,
    side: null,
    top: null,
    engine: null,
    'left-low': [[3.0, 0.12, -0.6], [0, 0.18, -0.6]],
    'right-low': [[-3.0, 0.12, -1.2], [0, 0.18, -1.2]],
    'rear-low': [[0.3, 0.1, -3.6], [0, 0.22, -1.6]],
    'rear-grille': [[-0.2, 0.62, -2.9], [0, 0.5, -1.6]],
    'louvres-close': [[0.25, 1.55, -1.75], [0, 0.55, -1.15]],
    'louvres-side': [[1.1, 1.35, -1.3], [0, 0.5, -1.1]],
    'rear-arch': [[1.7, 0.35, -1.7], [0.4, 0.35, -1.25]],
    'cabin-back': [[0.3, 0.95, 0.1], [0, 0.6, -1.0]],
  };
  await page.evaluate(() => __dev.engine({ rpm: 3000, throttle: 0.2, gear: 0, speedKmh: 0, crankAngle: 40 }));
  const out = {};
  for (const [name, cam] of Object.entries(views)) {
    if (cam) await page.evaluate(([p, t]) => __dev.setCamera(p, t), cam);
    else await page.evaluate((v) => __dev.view(v), name);
    for (const shown of [false, true]) {
      const r = await page.evaluate((s) => __dev.showEnclosed(s), shown);
      await page.evaluate(() => __dev.screenshotReady({ timeout: 90000 }));
      await page.screenshot({ path: `docs/review/f40-phase9/enclosed/${name}-${shown ? 'shown' : 'hidden'}.png` });
      out[`${name}-${shown}`] = r.hidden;
    }
  }
  await page.evaluate(() => __dev.showEnclosed(false));
  return out;
}
