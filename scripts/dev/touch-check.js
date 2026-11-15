// Dev (Playwright MCP run_code, `filename`): 9A two-finger checks for every profile, on an
// emulated phone page found among the browser's contexts (the one whose URL has `phone=1`).
// Per profile: two fingers land 120 px apart left of centre, spread to 240 px (pinch zoom
// toward their midpoint), slide 80 px down together (pan), then one lifts and the other drags
// 90 px sideways (must not rotate), then it lifts. Reported: how far the world point under the
// pinch midpoint moved on screen during the pinch (px), the camera's distance before / after,
// the view's turn while the second finger lands, while one lifts, and during the one-finger
// drag after the pinch (all should be ~0).
async (page) => {
  const phone = page.context().browser().contexts().flatMap((c) => c.pages()).find((p) => p.url().includes('phone=1'));
  if (!phone) return 'no phone page';
  const cdp = await phone.context().newCDPSession(phone);
  const vp = await phone.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id, radiusX: 8, radiusY: 8, force: 1 })) });
  const dir = () => phone.evaluate(() => { const c = window.__controls.camera; const d = c.getWorldDirection(new c.position.constructor()); return [d.x, d.y, d.z]; });
  const turn = (a, b) => (Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])) * 180) / Math.PI;
  const dist = () => phone.evaluate(() => { const c = __dev.getCamera(); return Math.hypot(...c.position.map((v, i) => v - c.target[i])); });
  const out = {};
  for (const profile of ['classic', 'anchored', 'grab']) {
    await phone.evaluate((p) => __dev.cameraFeel(p), profile);
    await phone.evaluate(() => __dev.view('front34'));
    await phone.waitForTimeout(1500);
    await phone.evaluate(() => __dev.screenshotReady({ timeout: 90000 }));
    const cx = vp.w * 0.38;
    const cy = vp.h * 0.5;
    const anchor = await phone.evaluate(([x, y]) => __dev.pick(x, y)?.point ?? null, [cx, cy]);
    const d0 = await dist();
    const a0 = await dir();
    // First finger, then the second lands (no move in between).
    await touch('touchStart', [[cx - 60, cy]]);
    await phone.waitForTimeout(80);
    await touch('touchStart', [[cx - 60, cy], [cx + 60, cy]]);
    await phone.waitForTimeout(250);
    const a1 = await dir();
    // Pinch out about the midpoint.
    for (let k = 1; k <= 8; k++) {
      await touch('touchMove', [[cx - 60 - 7.5 * k, cy], [cx + 60 + 7.5 * k, cy]]);
      await phone.waitForTimeout(50);
    }
    await phone.waitForTimeout(500);
    const after = anchor ? await phone.evaluate((p) => __dev.project(p), anchor) : null;
    // Pan: both down 80 px.
    for (let k = 1; k <= 8; k++) {
      await touch('touchMove', [[cx - 120, cy + 10 * k], [cx + 120, cy + 10 * k]]);
      await phone.waitForTimeout(50);
    }
    await phone.waitForTimeout(400);
    const a2 = await dir();
    // One finger lifts, then the other drags sideways.
    await touch('touchEnd', [[cx - 120, cy + 80]]);
    await phone.waitForTimeout(200);
    const a3 = await dir();
    for (let k = 1; k <= 6; k++) {
      await touch('touchMove', [[cx - 120 + 15 * k, cy + 80]]);
      await phone.waitForTimeout(50);
    }
    await phone.waitForTimeout(400);
    const a4 = await dir();
    await touch('touchEnd', []);
    await phone.waitForTimeout(1200);
    out[profile] = {
      pinchPointDriftPx: after ? Math.round(Math.hypot(after[0] - cx, after[1] - cy)) : null,
      distance: [+d0.toFixed(2), +(await dist()).toFixed(2)],
      turnSecondFingerLandsDeg: +turn(a0, a1).toFixed(2),
      turnOneLiftsDeg: +turn(a2, a3).toFixed(2),
      turnOneFingerDragAfterPinchDeg: +turn(a3, a4).toFixed(2),
    };
  }
  return out;
}
