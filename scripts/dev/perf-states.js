// Dev (Playwright MCP run_code, `filename`): draw calls and triangles per frame in the review
// states, desktop top tier (load the page with ?tier=0), front ¾ view. Each state is sampled over
// `FRAMES` frames (shadow passes come and go while the car rolls): min / max calls, max triangles.
// Running: 4th at 180 km/h, half throttle, the crank turning (as in the 9A–9C figures).
async (page) => {
  const FRAMES = 40;
  await page.waitForFunction(() => window.__dev && window.__perf && __dev.cameraFeel, null, { timeout: 300000 });
  const sample = () =>
    page.evaluate(async (n) => {
      const calls = [];
      const tris = [];
      for (let i = 0; i < n; i++) {
        await new Promise((r) => requestAnimationFrame(() => r()));
        calls.push(__perf.calls);
        tris.push(__perf.triangles);
      }
      return { min: Math.min(...calls), max: Math.max(...calls), trisM: +(Math.max(...tris) / 1e6).toFixed(2) };
    }, FRAMES);
  const out = {};
  const reset = async () => {
    await page.evaluate(async () => {
      await __dev.setFlow(false);
      await __dev.setXray(false);
      await __dev.setLights(false);
      await __dev.setChassis(false);
      await __dev.setProgress(0);
      await __dev.engine({ running: false });
      await __dev.view('front34');
    });
    await page.waitForTimeout(1500);
  };
  const run = () => page.evaluate(() => __dev.engine({ rpm: 5200, throttle: 0.5, gear: 4, speedKmh: 180, free: true }));
  await reset();
  out.idle = await sample();
  await run();
  await page.waitForTimeout(1000);
  out.running = await sample();
  await page.evaluate(() => __dev.setLights(true));
  await page.waitForTimeout(2500);
  out.runningLights = await sample();
  await page.evaluate(() => __dev.setFlow(true));
  await page.waitForTimeout(1000);
  out.runningLightsFlow = await sample();
  await page.evaluate(() => __dev.setLights(false));
  await page.evaluate(async () => {
    await __dev.setProgress(1);
    await __dev.fit();
  });
  await page.waitForTimeout(1500);
  out.explodedRunningFlow = await sample();
  await page.evaluate(() => __dev.setLights(true));
  await page.waitForTimeout(2500);
  out.explodedRunningLightsFlow = await sample();
  // Phase 5: the Chassis view (body off), running with lights and Flow, assembled and exploded.
  await reset();
  await run();
  await page.evaluate(async () => {
    await __dev.setLights(true);
    await __dev.view('chassis');
  });
  await page.waitForTimeout(2500);
  out.chassisRunningLights = await sample();
  await page.evaluate(() => __dev.setFlow(true));
  await page.waitForTimeout(1000);
  out.chassisRunningLightsFlow = await sample();
  await page.evaluate(async () => {
    await __dev.setProgress(1);
    await __dev.fit();
  });
  await page.waitForTimeout(1500);
  out.chassisExplodedRunningLightsFlow = await sample();
  await reset();
  return out;
}
