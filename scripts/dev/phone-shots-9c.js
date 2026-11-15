// Dev (Playwright MCP run_code, `filename`): 9C review shots on emulated phones (iPhone 13
// portrait and landscape, Pixel 7 portrait; `window.__phoneOnly` narrows them). Per phone: the
// "more" sheet / card with the Lights and Doors switches (their boxes, overlaps, sideways
// scroll), the cockpit view at 7000 rpm in 3rd, lights up from the front ¾, doors open, a
// front wheel close up with hot brakes, and the draw calls with everything on.
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
  const only = await page.evaluate(() => window.__phoneOnly ?? null);
  const out = {};
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
        await p.screenshot({ path: `docs/review/f40-phase9/9c-${ph.name}-${what}.png` });
      };
      await p.evaluate(() => __dev.engine({ rpm: 7000, throttle: 1, boost: 1, gear: 3, speedKmh: 158, crankAngle: 40 }));
      await p.waitForTimeout(800);
      // "more" with Lights and Doors.
      await p.evaluate(() => document.querySelector('.more-btn')?.click());
      await p.waitForTimeout(700);
      r.more = await p.evaluate(() => {
        const rows = [...document.querySelectorAll('.more__row')].map((row) => row.querySelector('.more__label')?.firstChild?.textContent?.trim()).filter(Boolean);
        const sw = [...document.querySelectorAll('.more .switch')].map((b) => b.getBoundingClientRect()).map((b) => [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]);
        return { rows, switches: sw, scrollW: document.documentElement.scrollWidth, innerW: innerWidth };
      });
      await shot('more');
      await p.evaluate(() => document.querySelector('.more-btn')?.click());
      await p.waitForTimeout(500);
      await p.evaluate(() => __dev.view('cockpit'));
      await p.waitForTimeout(2500);
      await shot('cockpit-7000');
      await p.evaluate(() => __dev.engine({ rpm: 1000, throttle: 0, gear: 0, speedKmh: 0, crankAngle: 40 }));
      await p.evaluate(() => __dev.setLights(true));
      await p.evaluate(() => __dev.view('front34'));
      await p.waitForTimeout(2500);
      await shot('lights-up');
      await p.evaluate(() => __dev.setDoors(true));
      await p.waitForTimeout(2500);
      await shot('doors-open');
      await p.evaluate(() => __dev.setDoors(false));
      await p.evaluate(() => __dev.setCamera([1.9, 0.45, 2.1], [0.75, 0.32, 1.225]));
      await p.evaluate(() => __dev.engine({ rpm: 1000, throttle: 0, gear: 0, speedKmh: 0, crankAngle: 40, brakeHeat: [0.85, 0.6] }));
      await p.waitForTimeout(1500);
      await shot('wheel-hot');
      await p.evaluate(() => __dev.engine({ rpm: 5200, throttle: 0.6, gear: 4, speedKmh: 180, brakeHeat: null }));
      await p.evaluate(() => __dev.setFlow(true));
      await p.evaluate(() => __dev.view('front34'));
      await p.waitForTimeout(3000);
      r.callsEverything = await p.evaluate(() => ({ calls: __perf.calls, tier: __perf.tier ?? null }));
    } catch (e) {
      r.errors.push(String(e).slice(0, 200));
    }
    out[ph.name] = r;
    await ctx.close();
  }
  return out;
}
