# Handoff

Where the project stands and how to work on it. The spec and decision log are in
docs/BRIEF.md; read that first. The build plan: docs/F40-PLAN.md.

## Status (2026-11-13)
- Phase 1 approved and merged into `main`.
- **Phases 2–4 in progress on `wip/f40-build`** (unattended run; commit per phase, not
  pushed). Phase 2 (intake, ignition, ancillaries) done. Next: phase 3 (turbos,
  intercoolers, exhaust), then phase 4 (5-speed transaxle). Progress and gates per phase:
  docs/REVIEW.md; decisions (incl. "Decisions made unattended") in docs/BRIEF.md.
- Visual checks: one persistent page + `window.__dev` (below). In this session the MCP tools
  were not loaded, so the page is driven by a small Playwright script (same GPU launch).

## Run
```
npm install
npm run dev          # http://127.0.0.1:5173/
npm run typecheck
npm run build
npm run prep:body    # assets-src/models/f40/body.glb → public/models/body.opt.glb + docs/body-report.md
npx vite preview     # after a build: http://localhost:4173/FerrariF40/ (the production subpath)
node --import ./scripts/ts-hooks.mjs scripts/layout-sketch.mjs   # docs/f40-layout-*.svg + key
node scripts/dev/inspect-model.mjs <file.glb> [--pieces=N] [--material=<regex>]   # raw model pieces
```

## Deploy
GitHub Pages, https://abcassim04.github.io/FerrariF40/, by `.github/workflows/deploy.yml` on
every push to `main` (or by hand from the Actions tab). The repository's Pages source must
be "GitHub Actions". Production builds use the base path `/FerrariF40/` (vite.config.ts);
refer to files in public/ with `asset('models/…')` (src/lib/asset.ts), never with a leading
slash. The original model (assets-src/models/f40/body.glb) is not shipped.

## Layout
- `src/config/dims.ts` — every dimension (reference, model-measured, derived, explode). The
  engine is parametric here (`engine`, `engineParts`, `CRANK_THROWS`).
- `src/config/scene.ts` — camera, controls, view presets, grid, shadows.
- `src/parts/registry.ts` — all parts; `parts/body` (model parts, the rear-clam hinge),
  `parts/engine` (`layout.ts` bank frames, kinematics and the firing order; `geometry/*`
  builders; `intake.ts` phase 2: intake, ignition, ancillaries, oil lines, ECUs),
  `parts/powertrain.ts` (carrier + the assembly that lifts out),
  `parts/cables/Cable.tsx` (re-curving cables and hoses; `cablesBuild` puts several in one
  mesh; cable parts sit at the car origin as root parts, since their vertices are written in
  car coordinates). Types in `parts/types.ts`.
- `src/geometry/build.ts` — geometry toolkit (extrude with exact bevels, lathe, merge, hulls,
  gears). `src/scene/MeshSet.tsx` — part builds from mesh specs (plain or instanced).
- `src/scene/PartsRenderer.tsx` — mounts each part as anchor → swing → content.
  `partObjects.ts` holds the live objects the timeline tweens.
- `src/explode/` — one GSAP timeline (play = explode, reverse = assemble), stage timing,
  exploded-bounds helper used for the camera fit.
- `src/body/BodyModel.tsx` — loads body.opt.glb, builds model parts, retunes the model's
  glass, paint and mirror-like materials, dev diagnostics (bbox, wheel drift vs DIMS),
  segment colours, the key-B ghost.
- `src/scene/ClashCheck.tsx` — dev key C. Inspect: `Inspect.tsx`, `picking.ts`, `ghosts.ts`,
  `src/ui/InspectPanel.tsx`, `HoverTooltip.tsx`, `XrayToggle.tsx`. `CameraRig.tsx` keeps
  separate saved views for explode and inspect.
- `src/scene/PostEffects.tsx` (N8AO, ACES, SMAA), `EnvironmentLevels.tsx`,
  `ShadowScheduler.tsx` (shadows only re-render while things move; `refreshShadows()`),
  `PerfProbe.tsx` (`window.__perf`, `window.__perfParts()`).
- `src/dev/DevApi.tsx` — `window.__dev` (dev builds only).
- `scripts/prep-body.mjs` (pipeline) + `scripts/body-rules.mjs` (F40 rules),
  `scripts/layout-sketch.mjs`, `scripts/dev/inspect-model.mjs`, `scripts/dev/mcp/*.json`
  (Playwright MCP browser configs), `scripts/ts-hooks.mjs` (lets Node load the app's TS).

## Conventions
- Car coordinates: metres, +Y up, +Z forward, +X = car's left, origin on the ground at the
  wheelbase centre. Part `position` is always in car coordinates.
- No magic numbers in part files: sizes/positions come from DIMS, tessellation from
  `config/detail.ts`, colours from `materials/materials.ts`.
- One phase at a time, one branch per phase: dev server, screenshots, gates, commit, stop.
  Never run git stash, reset, clean or checkout -- <file> without asking. Don't push.
- Commit messages end with the Co-Authored-By line used in git history.

## Dev aids
Keys: L ids, G guides, K segments, C clashes, S solo group, B stand-in powertrain ghost.
Panel: solo part or group, camera presets, clash report.
URL: `?view=front34|top|engine|side|rear34&explode=1&t=<s>&fit=1&segments=1&labels=1&solo=<id>[,<id>…]&soloGroup=<group>&ghost=1&clashes=1|all&clashFocus=<a,b>&clashAt=<s>&guides=0&cam=x,y,z&look=x,y,z&perfPeak=1&inspect=<id>&xray=1&snap=1&panel=0`
(the clash options still need a load: the check runs once when it mounts).

## Visual verification (default method)
**One persistent page, driven through the Playwright MCP server and `window.__dev`; no
reloads between checks.** Reload only when the code itself changed (or for a URL-only aid
such as `clashes`/`clashAt`).

### Playwright MCP server (GPU)
Registered for this project (local scope, `~/.claude.json`):
```
claude mcp add -s local playwright -e DISPLAY=:0 -e LD_LIBRARY_PATH=/usr/lib/wsl/lib -e GALLIUM_DRIVER=d3d12 \
  -- npx @playwright/mcp@latest --config /home/abcassim/projects/ferrari-f40/scripts/dev/mcp/playwright-gpu.json
claude mcp add -s local playwright-swiftshader \
  -- npx @playwright/mcp@latest --config /home/abcassim/projects/ferrari-f40/scripts/dev/mcp/playwright-swiftshader.json
```
- `playwright` (default): the full Chromium build headed on the WSLg display, window
  off-screen (`--window-position=-4000,-4000`), `--use-angle=gl --ignore-gpu-blocklist`,
  env `LD_LIBRARY_PATH=/usr/lib/wsl/lib GALLIUM_DRIVER=d3d12`, viewport 1440×900. Verified
  over the MCP protocol: WebGL renderer "ANGLE (Microsoft Corporation, D3D12 (Intel(R)
  Iris(R) Xe Graphics), OpenGL 4.1)".
- `playwright-swiftshader` (fallback, if the GPU browser won't start): chrome-headless-shell
  with `--use-angle=swiftshader --enable-unsafe-swiftshader`; renderer "ANGLE (Google,
  Vulkan 1.3.0 (SwiftShader Device (Subzero)…))". Several times slower.
- New MCP servers load when a Claude Code session starts; after adding or changing one,
  restart the session (or reconnect in /mcp).
- Screenshots: the server only writes inside its roots — give `browser_take_screenshot` a
  path under `docs/review/` (git-ignored) or a bare file name (goes to `docs/review/`).
- Typical check: `browser_navigate` once to `http://127.0.0.1:5173/?panel=0&guides=0`, then
  per check one `browser_evaluate` (`__dev` calls ending in `__dev.screenshotReady()`) and one
  `browser_take_screenshot`.

### `window.__dev` (src/dev/DevApi.tsx, dev builds only)
Every call is instant (no camera eases, no timeline playback) and returns a promise.
```
await __dev.setCamera([x, y, z], [tx, ty, tz])   // __dev.getCamera() → { position, target, offset }
await __dev.setProgress(t)        // explode timeline at t (0…1), posed directly (×4.4 s total now)
await __dev.select('crankshaft')  // inspect a part; __dev.clearSelection()
await __dev.setXray(true); await __dev.setSolo('engine' | null); await __dev.setLabels(true)
await __dev.setGhost(true); await __dev.setSegments(true)   // key B / key K
await __dev.view('rear34'); await __dev.fit()               // preset; frame everything visible
await __dev.screenshotReady()     // → { frames, ms } once the timeline is idle, the camera has
                                  //   stopped, no shadow pass is pending, then 3 settled frames
__dev.state()                     // selection, X-ray, solo, explode progress, __perf
```
Production builds contain none of it (verified: no `__dev`, `screenshotReady`,
`setProgress`, `DevApi`, `__perf`, `__state` or `__controls` in dist/assets).
camera-controls' own `active` flag stays true after an instant jump, so `screenshotReady`
compares the camera's world matrix frame to frame instead.

### Benchmark (2026-11-12, same 6 review checks, same GPU, 1440×900)
Checks: assembled front34, engine through the Lexan, exploded rear34 + fit, key-B ghost side,
crankshaft inspect, X-ray side. Same readiness test (`screenshotReady`) for both methods.
| method | total | per check |
| --- | --- | --- |
| old: reload per shot (state from URL parameters) | **180.8 s** | 36.4, 28.2, 27.6, 32.0, 28.3, 27.7 |
| new: persistent page + `__dev` (Playwright script) | **83.8 s** | one-time load 26.2, then 8.1, 8.4, 9.3, 9.3, 11.8, 9.2 |
| new, through the MCP server (stdio, as Claude Code drives it) | **91.7 s** | one-time load 31.1, then 8.9, 8.8, 10.0, 10.6, 12.6, 9.8 |
×2.2 overall, ×3.2 per check once the page is up. The frames were identical between methods.
On this iGPU the full scene renders at ~1 fps in the review browser, so frame times aren't
meaningful here (draw calls and triangles are).

### Fallback without the MCP tools
If the session hasn't loaded the MCP tools yet, drive the same kind of persistent page from a
small Playwright script (`chromium.launch` with the GPU options above, one `page`, then
`page.evaluate` of `__dev` calls and `page.screenshot` per check). Use small viewports
(800×500) while iterating, 1440×900 for review shots. GSAP lag smoothing stretches
animations at low frame rates: pose with `__dev.setProgress` rather than waiting.

## Known issues
- three ignores `material.envMapIntensity` when lighting comes from `scene.environment`;
  set levels through `EnvironmentLevels` (or `modelEnvLevels` for model materials).
- `THREE.Clock` deprecation warning comes from inside R3F.
- Bundle > 500 kB warning (three + drei); code-split in the performance pass.
- docs/reference/ images are third-party and git-ignored (docs/reference/f40/ is empty).
- Through the Lexan from behind, the studio's reflection on the pane washes the right cam
  cover to grey (realism pass).
