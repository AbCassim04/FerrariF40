// Dev (Playwright MCP run_code, `filename`): the phase 5 clash gate on a loaded dev page.
// Assembled vs the body, full explode, our parts against the frame / mounts / suspension
// (assembled, info) and a sweep through the explode (every 0.15 s to 3.2 s, then to the end).
// `window.__clashFocus` (array) overrides the focus ids.
async (page) => {
  await page.waitForFunction(() => window.__dev && window.__perf && __dev.cameraFeel, null, { timeout: 300000 });
  return page.evaluate(async () => {
    await __dev.screenshotReady({ timeout: 120000 });
    const focus = window.__clashFocus ?? ['frame', '-mount-', 'wishbone', 'upright', 'spring-', 'damper-', 'anti-roll', 'steering', 'tie-rod', 'toe-link'];
    const out = { static: await __dev.clash({ allPairs: true, focus }), sweep: {} };
    const times = [];
    for (let t = 0.15; t < 3.21; t += 0.15) times.push(+t.toFixed(2));
    times.push(3.6, 4.0, 4.4);
    // Per pair: the times (s) it overlaps at.
    for (const t of times) {
      const r = await __dev.clash({ at: t, focus, skipBody: true });
      for (const line of r.split('\n').slice(1)) {
        const pair = line.trim().replace(/ at \(.*$/, '');
        if (pair) (out.sweep[pair] ??= []).push(t);
      }
    }
    return out;
  });
}
