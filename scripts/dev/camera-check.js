// Dev (Playwright MCP run_code, `filename`): the 9A camera check for every profile on the
// current page: from the front ¾ view, 5 zoom-ins (one 100 px wheel notch each) at off-centre
// points, then a 45° orbit (a left drag of 1/8 of the canvas height). Per frame the camera's
// view direction is sampled. Reported: the largest per-frame turn while only zooming (a zoom
// or a re-anchor must not turn the view: ~0), the largest and median per-frame turn during the
// orbit (a jump stands out against the median), the camera's distance to its pivot, and where
// the car's centre ends up (fraction of the canvas; the middle 60 % is 0.2–0.8).
async (page) => {
  const cdp = await page.context().newCDPSession(page);
  const vp = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  const out = {};
  for (const profile of ['classic', 'anchored', 'grab']) {
    await page.evaluate((p) => __dev.cameraFeel(p), profile);
    await page.evaluate(() => __dev.view('front34'));
    await page.waitForTimeout(1500);
    await page.evaluate(() => __dev.screenshotReady({ timeout: 60000 }));
    await page.evaluate(() => {
      const cam = window.__controls.camera;
      const s = (window.__camSamples = []);
      const loop = () => {
        const d = cam.getWorldDirection(new cam.position.constructor());
        s.push({ phase: window.__camPhase, t: performance.now(), d: [d.x, d.y, d.z] });
        if (window.__camSampling) requestAnimationFrame(loop);
      };
      window.__camSampling = true;
      window.__camPhase = 'zoom';
      requestAnimationFrame(loop);
    });
    const points = [[0.25, 0.3], [0.72, 0.35], [0.3, 0.68], [0.68, 0.62], [0.42, 0.4]];
    for (const [fx, fy] of points) {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: vp.w * fx, y: vp.h * fy });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: vp.w * fx, y: vp.h * fy, deltaX: 0, deltaY: -100 });
      await page.waitForTimeout(900);
    }
    // Orbit: a left drag from the middle, 1/8 of the height to the right (45°).
    await page.evaluate(() => (window.__camPhase = 'orbit'));
    const x0 = vp.w * 0.5;
    const y0 = vp.h * 0.45;
    const dx = vp.h / 8;
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0, y: y0 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x0, y: y0, button: 'left', clickCount: 1 });
    for (let k = 1; k <= 10; k++) {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0 + (dx * k) / 10, y: y0, button: 'left', buttons: 1 });
      await page.waitForTimeout(40);
    }
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x0 + dx, y: y0, button: 'left', clickCount: 1 });
    await page.waitForTimeout(2500);
    out[profile] = await page.evaluate(() => {
      window.__camSampling = false;
      const s = window.__camSamples;
      const turns = { zoom: [], orbit: [] };
      const rates = [];
      for (let i = 1; i < s.length; i++) {
        const a = s[i - 1].d;
        const b = s[i].d;
        const dot = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
        turns[s[i].phase].push((Math.acos(dot) * 180) / Math.PI);
        if (s[i].phase === 'orbit') rates.push((Math.acos(dot) * 180) / Math.PI / Math.max(1, s[i].t - s[i - 1].t) * (1000 / 60));
      }
      const moving = turns.orbit.filter((v) => v > 0.05).sort((x, y) => x - y);
      const median = moving.length ? moving[moving.length >> 1] : 0;
      const [px, py] = __dev.project([0, 0.56, 0.08]);
      return { frames: s.length, zoomMaxTurnDeg: +Math.max(0, ...turns.zoom).toFixed(2), orbitMaxTurnDeg: +Math.max(0, ...turns.orbit).toFixed(2), orbitMedianTurnDeg: +median.toFixed(2), orbitTotalDeg: +turns.orbit.reduce((a, b) => a + b, 0).toFixed(1), orbitMaxPer60HzDeg: +Math.max(0, ...rates).toFixed(2), fps: +((s.length / ((s.at(-1).t - s[0].t) / 1000)) || 0).toFixed(1), carCentre: [+(px / innerWidth).toFixed(2), +(py / innerHeight).toFixed(2)], distance: +Math.hypot(...__dev.getCamera().position.map((v, i) => v - __dev.getCamera().target[i])).toFixed(2) };
    });
  }
  return out;
}
