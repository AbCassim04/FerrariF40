// Dev (Playwright MCP run_code, `filename`): 9B review shots and layout checks on emulated
// phones (iPhone 13 portrait and landscape, Pixel 7 portrait). Each phone gets its own context;
// the page loads with the engine running, then: the control bar's overflow and the Flow
// button's box, flames assembled (rear ¾), flow assembled at full boost (wastegate), flow
// exploded at full boost, and the draw calls with flow on, exploded and running.
async (page) => {
  const browser = page.context().browser();
  for (const c of browser.contexts()) if (c !== page.context()) await c.close();
  const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
  const UA_PIXEL = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
  const phones = [
    { name: 'iphone13-portrait', viewport: { width: 390, height: 844 }, dsf: 3, ua: UA_IPHONE },
    { name: 'iphone13-landscape', viewport: { width: 844, height: 390 }, dsf: 3, ua: UA_IPHONE },
    { name: 'pixel7-portrait', viewport: { width: 412, height: 915 }, dsf: 2.625, ua: UA_PIXEL },
  ];
  const out = {};
  // Optional: only these phones (set on window by a preceding run_code, else all).
  const only = await page.evaluate(() => window.__phoneOnly ?? null);
  for (const ph of phones.filter((x) => !only || only.includes(x.name))) {
    const ctx = await browser.newContext({ viewport: ph.viewport, deviceScaleFactor: ph.dsf, isMobile: true, hasTouch: true, userAgent: ph.ua });
    const p = await ctx.newPage();
    const r = { errors: [] };
    p.on('pageerror', (e) => r.errors.push(String(e).slice(0, 200)));
    try {
      await p.goto('http://127.0.0.1:5173/?panel=0&guides=0&phone=1', { timeout: 120000 });
      await p.waitForFunction(() => window.__dev && window.__perf && __dev.cameraFeel, null, { timeout: 240000 });
      const shot = async (what) => {
        await p.evaluate(() => __dev.screenshotReady({ timeout: 90000 }));
        await p.screenshot({ path: `docs/review/f40-phase9/9b-${ph.name}-${what}.png` });
      };
      // The Flow button: in the bar with the engine off; while driving, wherever X-ray is (the "more" sheet in portrait).
      const box = () =>
        p.evaluate(() => {
          const vis = (el) => el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
          const f = [...document.querySelectorAll('.flow-btn')].find(vis);
          if (!f) return null;
          const r = f.getBoundingClientRect();
          const others = [...document.querySelectorAll('button')].filter((b) => b !== f && vis(b)).map((b) => b.getBoundingClientRect());
          const hit = others.filter((o) => o.left < r.right - 1 && r.left < o.right - 1 && o.top < r.bottom - 1 && r.top < o.bottom - 1).length;
          return { box: [r.left, r.top, r.width, r.height].map(Math.round), overlaps: hit, scrollW: document.documentElement.scrollWidth, innerW: innerWidth };
        });
      r.layoutOff = await box();
      await p.evaluate(() => __dev.engine({ rpm: 6500, throttle: 0, crankAngle: 20 }));
      await p.waitForTimeout(800);
      r.layoutDriving = await box();
      if (!r.layoutDriving) {
        await p.locator('.more-btn').first().tap();
        await p.waitForTimeout(600);
        r.layoutDriving = { inMore: await box() };
        await shot('more-sheet');
        // The open sheet covers its own button: close it from script.
        await p.evaluate(() => document.querySelector('.more-btn')?.click());
        await p.waitForTimeout(400);
      }
      await p.evaluate(() => __dev.setCamera([1.9, 0.75, -4.9], [0, 0.35, -2.0]));
      await p.evaluate(() => __dev.engine({ rpm: 6500, throttle: 0, crankAngle: 20, flame: { age: 0.13, strength: 1, length: 0.45 } }));
      await shot('flames');
      await p.evaluate(() => __dev.setFlow(true));
      await p.evaluate(() => __dev.engine({ rpm: 6500, throttle: 1, boost: 1.1, crankAngle: 300, timeScale: 'strokes' }));
      await p.evaluate(() => __dev.setCamera([-1.2, 2.0, -3.9], [0, 0.35, -1.6]));
      await shot('flow-boost');
      await p.evaluate(() => __dev.setProgress(1));
      await p.evaluate(() => __dev.view('rear34'));
      await p.evaluate(() => __dev.fit());
      await p.waitForTimeout(800);
      await shot('flow-exploded');
      r.calls = await p.evaluate(() => window.__perf.calls);
    } catch (e) {
      r.errors.push(String(e).slice(0, 200));
    }
    out[ph.name] = r;
    await ctx.close();
  }
  return out;
}
