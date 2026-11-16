// Dev (Playwright MCP run_code, `filename`): phase 5 review shots, desktop 1440×900 (the MCP
// page) and emulated phones (iPhone 13 portrait and landscape, Pixel 7 portrait; a second
// browser context each). `window.__shotTag` names the set ('5a' by default); `window.__shotSkip`
// = 'phones' or 'desktop' leaves that half out. Returns the draw calls seen on each phone.
async (page) => {
  await page.waitForFunction(() => window.__dev && window.__perf && __dev.cameraFeel, null, { timeout: 300000 });
  const tag = (await page.evaluate(() => window.__shotTag)) ?? '5a';
  const skip = await page.evaluate(() => window.__shotSkip ?? '');
  const dir = 'docs/review/f40-phase5';
  const out = {};
  const run = async (p, name, steps) => {
    const shot = async (what, fn) => {
      await p.evaluate(fn);
      await p.evaluate(() => __dev.screenshotReady({ timeout: 120000 }));
      await p.screenshot({ path: `${dir}/${tag}-${name}-${what}.png` });
    };
    for (const [what, fn] of steps) await shot(what, fn);
  };
  const reset = async () => {
    await __dev.setXray(false);
    await __dev.clearSelection();
    await __dev.setSolo(null);
    await __dev.setSoloParts(null);
    await __dev.setChassis(false);
    await __dev.setProgress(0);
    await __dev.engine({ running: false });
  };
  const desktop = [
    ['hero-assembled', async () => { await __dev.view('front34'); }],
    ['rear34-assembled', async () => { await __dev.view('rear34'); }],
    ['engine-bay', async () => { await __dev.view('engine'); }],
    ['chassis', async () => { await __dev.view('chassis'); }],
    ['chassis-front', async () => { await __dev.setCamera([4.6, 2.3, 5.2], [0, 0.45, 0.1]); }],
    ['chassis-side', async () => { await __dev.setCamera([7.2, 1.0, 0], [0, 0.5, 0]); }],
    ['chassis-top', async () => { await __dev.setCamera([0, 8.2, 0.01], [0, 0, 0]); }],
    ['susp-front', async () => { await __dev.setCamera([1.75, 0.75, 2.35], [0.6, 0.33, 1.25]); }],
    ['susp-rear', async () => { await __dev.setCamera([1.9, 0.85, -2.5], [0.58, 0.36, -1.3]); }],
    ['frame-alone', async () => { await __dev.setChassis(false); await __dev.setSolo('frame'); await __dev.setCamera([4.3, 2.7, 4.8], [0, 0.5, 0]); }],
    ['frame-alone-rear', async () => { await __dev.setCamera([-4.0, 2.4, -5.0], [0, 0.5, 0]); }],
    ['xray', async () => { await __dev.setSolo(null); await __dev.setXray(true); await __dev.view('side'); }],
    ['xray-front34', async () => { await __dev.view('front34'); }],
    ['exploded', async () => { await __dev.setXray(false); await __dev.setProgress(1); await __dev.view('front34'); }],
    ['exploded-rear', async () => { await __dev.view('rear34'); }],
    ['exploded-chassis', async () => { await __dev.view('chassis'); }],
  ];
  if (skip !== 'desktop') {
    await page.evaluate(reset);
    await run(page, 'desktop', desktop);
    await page.evaluate(reset);
    await page.evaluate(() => __dev.view('front34'));
  }
  if (skip === 'phones') return out;
  const browser = page.context().browser();
  for (const c of browser.contexts()) if (c !== page.context()) await c.close();
  const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
  const UA_PIXEL = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
  const phones = [
    { name: 'iphone13-portrait', viewport: { width: 390, height: 844 }, dsf: 3, ua: UA_IPHONE },
    { name: 'iphone13-landscape', viewport: { width: 844, height: 390 }, dsf: 3, ua: UA_IPHONE },
    { name: 'pixel7-portrait', viewport: { width: 412, height: 915 }, dsf: 2.625, ua: UA_PIXEL },
  ];
  for (const ph of phones) {
    const ctx = await browser.newContext({ viewport: ph.viewport, deviceScaleFactor: ph.dsf, isMobile: true, hasTouch: true, userAgent: ph.ua });
    const p = await ctx.newPage();
    const r = { errors: [] };
    p.on('pageerror', (e) => r.errors.push(String(e).slice(0, 200)));
    try {
      await p.goto('http://127.0.0.1:5173/?panel=0&guides=0&phone=1', { timeout: 120000 });
      await p.waitForFunction(() => window.__dev && window.__perf && __dev.cameraFeel, null, { timeout: 240000 });
      await run(p, ph.name, [
        ['hero-assembled', async () => { await __dev.view('front34'); }],
        ['chassis', async () => { await __dev.view('chassis'); }],
      ]);
      // The chip itself: open the views, check "Chassis" is there, pressed, on screen.
      await p.evaluate(() => document.querySelector('[aria-controls="view-chips"]')?.click());
      await p.waitForTimeout(600);
      r.chip = await p.evaluate(() => {
        const b = [...document.querySelectorAll('.chip')].find((x) => x.textContent.trim() === 'Chassis');
        const q = b?.getBoundingClientRect();
        return b ? { pressed: b.getAttribute('aria-pressed'), box: [Math.round(q.left), Math.round(q.top), Math.round(q.width), Math.round(q.height)], scrollW: document.documentElement.scrollWidth, innerW: innerWidth, innerH: innerHeight } : null;
      });
      await p.screenshot({ path: `${dir}/${tag}-${ph.name}-chassis-chips.png` });
      await p.evaluate(() => document.querySelector('[aria-controls="view-chips"]')?.click());
      await run(p, ph.name, [
        ['chassis-exploded', async () => { await __dev.setProgress(1); await __dev.view('chassis'); }],
        ['xray', async () => { await __dev.setProgress(0); await __dev.setChassis(false); await __dev.setXray(true); await __dev.view('front34'); }],
      ]);
      await p.evaluate(async () => { await __dev.engine({ rpm: 5200, throttle: 0.6, gear: 4, speedKmh: 180, free: true }); await __dev.setLights(true); await __dev.setFlow(true); });
      await p.waitForTimeout(3000);
      r.callsEverything = await p.evaluate(async () => { let m = 0; for (let i = 0; i < 20; i++) { await new Promise((q) => requestAnimationFrame(() => q())); m = Math.max(m, __perf.calls); } return m; });
      await p.evaluate(async () => { await __dev.view('chassis'); });
      await p.waitForTimeout(2500);
      r.callsChassisEverything = await p.evaluate(async () => { let m = 0; for (let i = 0; i < 20; i++) { await new Promise((q) => requestAnimationFrame(() => q())); m = Math.max(m, __perf.calls); } return m; });
    } catch (e) {
      r.errors.push(String(e).slice(0, 300));
    }
    out[ph.name] = r;
    await ctx.close();
  }
  return out;
}
