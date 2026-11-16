// Dev (Playwright MCP run_code, `filename`): brake glow at three heats and cool (front left,
// through the spokes), then the hold-release check: hold full heat, release it, run at 158 km/h
// exploded with no braking and read the heat and glow (both must be 0).
async (page) => {
  await page.waitForFunction(() => window.__dev && __dev.setLamps, null, { timeout: 300000 });
  const prefix = globalThis.BRAKE_PREFIX ?? 'wip-fix-brake';
  const shot = async (name) => {
    await page.evaluate(() => __dev.screenshotReady({ timeout: 90000 }));
    await page.screenshot({ path: `docs/review/f40-phase9/${prefix}-${name}.png` });
  };
  const out = {};
  await page.evaluate(() => __dev.setProgress(0));
  await page.evaluate(() => __dev.setCamera([1.75, 0.42, 2.0], [0.75, 0.32, 1.225]));
  for (const [h, name] of [[0, 'cool'], [0.45, 'warm'], [0.75, 'hot'], [1.0, 'max']]) {
    out[name] = await page.evaluate((h) => __dev.engine({ rpm: 1000, throttle: 0, gear: 0, speedKmh: 0, crankAngle: 40, brakeHeat: [h, h * 0.7] }).then((r) => r.brakeGlow), h);
    await page.waitForTimeout(800);
    await shot(name);
  }
  // Hold release: the review's sequence (hold max, release in a pose, then 158 km/h exploded).
  await page.evaluate(() => __dev.engine({ rpm: 1000, throttle: 0, gear: 0, speedKmh: 0, crankAngle: 40, brakeHeat: null }));
  out.released = await page.evaluate(() => __dev.engine({ rpm: 7000, throttle: 1, boost: 1.0, gear: 3, speedKmh: 158, free: true }).then((r) => ({ heat: r.brakeHeat, glow: r.brakeGlow, brake: r.brake })));
  await page.evaluate(() => __dev.setProgress(1));
  await page.evaluate(() => __dev.setCamera([2.9, 1.0, 2.825], [1.3, 0.4, 1.225]));
  await page.waitForTimeout(3000);
  out.explodedAfter3s = await page.evaluate(() => __dev.engine({}).then((r) => ({ heat: r.brakeHeat, glow: r.brakeGlow })));
  await page.screenshot({ path: `docs/review/f40-phase9/${prefix}-exploded-158.png` });
  await page.evaluate(() => __dev.setProgress(0));
  await page.evaluate(() => __dev.engine({ running: false }));
  return out;
}
