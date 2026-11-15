// Dev (Playwright MCP run_code, `filename`): 9C review shots on the desktop page (1440×900):
// every donor badge close up (found by clustering the badge meshes' vertices, shot from
// outside the car), each wheel assembled and exploded, brake glow at three heats, the cockpit
// at idle and at 7000 rpm in 3rd, headlamps down / rising / up with the lights on, doors open.
async (page) => {
  for (const c of page.context().browser().contexts()) if (c !== page.context()) await c.close();
  await page.reload({ timeout: 180000 });
  await page.waitForFunction(() => window.__dev && window.__perf && __dev.cameraFeel, null, { timeout: 300000 });
  const shot = async (name) => {
    await page.evaluate(() => __dev.screenshotReady({ timeout: 90000 }));
    await page.screenshot({ path: `docs/review/f40-phase9/9c-desktop-${name}.png` });
  };
  const out = {};
  await page.evaluate(() => __dev.engine({ rpm: 1000, throttle: 0, gear: 0, speedKmh: 0, crankAngle: 40 }));
  // Badges: clusters of badge vertices (10 cm cells, merged by flood fill), world space.
  const badges = await page.evaluate(() => {
    const pts = [];
    for (const o of window.__partObjects.values())
      o.content.traverse((x) => {
        if (!x.isMesh) return;
        let n = x;
        while (n && !/^badges__/.test(n.name)) n = n.parent;
        if (!n) return;
        x.updateWorldMatrix(true, false);
        const a = x.geometry.attributes.position;
        const v = new x.position.constructor();
        for (let i = 0; i < a.count; i += 3) pts.push(v.fromBufferAttribute(a, i).applyMatrix4(x.matrixWorld).toArray());
      });
    const key = (p) => p.map((c) => Math.floor(c / 0.1)).join(',');
    const cells = new Map();
    for (const p of pts) (cells.get(key(p)) ?? cells.set(key(p), []).get(key(p))).push(p);
    const seen = new Set();
    const groups = [];
    for (const k of cells.keys()) {
      if (seen.has(k)) continue;
      const stack = [k];
      const g = [];
      seen.add(k);
      while (stack.length) {
        const c = stack.pop();
        g.push(...cells.get(c));
        const [i, j, l] = c.split(',').map(Number);
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let d = -1; d <= 1; d++) {
          const n = `${i + a},${j + b},${l + d}`;
          if (cells.has(n) && !seen.has(n)) (seen.add(n), stack.push(n));
        }
      }
      const c = g.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]).map((v) => v / g.length);
      groups.push(c.map((v) => +v.toFixed(3)));
    }
    return groups;
  });
  out.badges = badges;
  for (const [i, c] of badges.entries()) {
    // From outside: sideways for badges near the sides, else from the front or the back.
    const side = Math.abs(c[0]) > 0.6;
    const pos = side ? [c[0] + Math.sign(c[0]) * 0.45, c[1] + 0.12, c[2] + 0.05] : [c[0] + 0.05, c[1] + 0.15, c[2] + Math.sign(c[2]) * 0.45];
    await page.evaluate(([p, t]) => __dev.setCamera(p, t), [pos, c]);
    await shot(`badge-${i + 1}`);
  }
  // Wheels, assembled and exploded.
  for (const [c, x, z] of [['fl', 1, 1], ['fr', -1, 1], ['rl', 1, -1], ['rr', -1, -1]]) {
    await page.evaluate(([x, z]) => __dev.setCamera([x * 2.0, 0.6, z * 1.225 + z * 0.9], [x * 0.78, 0.33, z * 1.225]), [x, z]);
    await shot(`wheel-${c}`);
  }
  await page.evaluate(() => __dev.setProgress(1));
  for (const [c, x, z] of [['fl', 1, 1], ['rr', -1, -1]]) {
    await page.evaluate(([x, z]) => __dev.setCamera([x * 2.9, 1.0, z * 1.225 + z * 1.6], [x * 1.3, 0.4, z * 1.225]), [x, z]);
    await shot(`wheel-${c}-exploded`);
  }
  await page.evaluate(() => __dev.setProgress(0));
  // Brake glow at three heats (front left, through the spokes).
  await page.evaluate(() => __dev.setCamera([1.75, 0.42, 2.0], [0.75, 0.32, 1.225]));
  for (const [h, name] of [[0.45, 'warm'], [0.75, 'hot'], [1.0, 'max']]) {
    await page.evaluate((h) => __dev.engine({ rpm: 1000, throttle: 0, gear: 0, speedKmh: 0, crankAngle: 40, brakeHeat: [h, h * 0.7] }), h);
    await page.waitForTimeout(1000);
    await shot(`brake-glow-${name}`);
  }
  await page.evaluate(() => __dev.engine({ rpm: 1000, throttle: 0, gear: 0, speedKmh: 0, crankAngle: 40, brakeHeat: null }));
  // Cockpit: idle, then 7000 rpm in 3rd.
  await page.evaluate(() => __dev.view('cockpit'));
  await page.waitForTimeout(2000);
  await shot('cockpit-idle');
  await page.evaluate(() => __dev.engine({ rpm: 7000, throttle: 1, boost: 1.0, gear: 3, speedKmh: 158, crankAngle: 40 }));
  await page.waitForTimeout(2000);
  await shot('cockpit-7000');
  await page.evaluate(() => __dev.setCamera([0.33, 0.83, 0.42], [0.32, 0.745, 0.69]));
  await shot('gauges-7000');
  // Headlamps down, rising, up (lights on).
  await page.evaluate(() => __dev.engine({ rpm: 1000, throttle: 0, gear: 0, speedKmh: 0, crankAngle: 40 }));
  await page.evaluate(() => __dev.setCamera([1.8, 1.05, 4.0], [0.3, 0.55, 1.6]));
  await shot('lamps-down');
  await page.evaluate(() => __dev.setLights(true));
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'docs/review/f40-phase9/9c-desktop-lamps-rising.png' });
  await page.waitForTimeout(2500);
  await shot('lamps-up');
  await page.evaluate(() => __dev.view('front34'));
  await shot('lights-on');
  await page.evaluate(() => __dev.setDoors(true));
  await page.waitForTimeout(2500);
  await shot('doors-open');
  out.callsDoorsLights = await page.evaluate(() => __perf.calls);
  await page.evaluate(() => __dev.setDoors(false));
  await page.evaluate(() => __dev.setLights(false));
  return out;
}
