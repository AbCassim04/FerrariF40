# Handoff

Where the project stands and how to work on it. The spec and decision log are in
docs/BRIEF.md; read that first. The build plan: docs/F40-PLAN.md.

## Status (2026-11-17, phase 5)
- **Phase 5 on `wip/f40-phase5`** (from `main` = phase 9 + fix-up, unattended, a commit per
  sub-phase, not pushed). Summary, figures, shots: docs/REVIEW.md ("Phase 5"); decisions:
  docs/BRIEF.md ("Phase 5A", "Phase 5B").
- **5A frame:** nodes and tubes in `src/config/chassis.ts` (left side, mirrored);
  `src/parts/frame/` (`layout.ts` plain segments, `geometry.ts` one merged mesh per section,
  `index.ts` the four parts, `mounts.ts` the engine and gearbox mount brackets that ride the
  powertrain). The model's stand-in frame and suspension are dropped in
  `scripts/body-rules.mjs` (`STANDIN_CHASSIS`; `npm run prep:body` was re-run); the stand-in
  radiator is the part `model-radiator`. Chassis view: store `chassis`, `SCENE.views.chassis`,
  `SCENE.chassis` (what it hides, what is culled while closed, what casts no shadows while
  assembled), applied in `scene/Enclosed.tsx`.
- **5B suspension:** hardpoints in `src/config/suspension.ts`; `src/parts/suspension/`
  (`geometry.ts`, `index.ts`: 27 parts). No suspension motion (skipped, see BRIEF). X-ray draws
  the frame as a skeleton (`SCENE.ghosts.frame`, `scene/ghosts.ts`).
- **Moving a tube or a hardpoint:** edit the config, then
  `node --import ./scripts/ts-hooks.mjs scripts/dev/frame-fit.mjs` (frame vs the body's skins,
  seconds), then on a loaded dev page `scripts/dev/frame-clash.js` (Playwright MCP `run_code`
  `filename`: static + 24 times through the explode). Anything fixed in the engine bay must
  stay out of the powertrain's way out (it slides back 0.37 m, then lifts): that is why no tube
  crosses over it and its mounts ride with it.
- **Dev tools added:** `scripts/dev/body-slice.mjs` (ASCII cross-sections of the body model:
  `z=`, `x=` or `y=`), `part-pieces.mjs` (connected pieces of a prepped part), `piece-profile.mjs`,
  `frame-fit.mjs`, `frame-clash.js`, `phase5-shots.js` (desktop + three phones;
  `window.__shotTag`, `__shotSkip`), `perf-states.js` (now with the Chassis view states).
  Dev API: `__dev.view('chassis')`, `__dev.setChassis(on)`; URL `?chassis=1`.
- **Budget:** peak draw calls with everything on are in REVIEW "Phase 5" (cap 500). New parts
  that sit inside the body should go in `SCENE.chassis.noShadowAssembled` / `noShadowGroups`.
- **Portrait phone bar:** Flow is in the ⋯ sheet there (`ui/ControlBar.tsx`); the bar needs
  338 px (fits 360). Adding a labelled button to it means taking one out (BRIEF "Phase 5B").
- **Fix-ups after the merge (2026-11-17):** badges snap onto our paint in `npm run prep:donor`
  (`DONOR.snap`; it reads `public/models/body.opt.glb`, so run `prep:body` first). They had
  floated up to 12 mm off it (the tail lettering) or sunk 1 mm in (the right shield). The dyno
  graph sits under the camera corner and moves down while the view chips are open
  (`--cam-bottom`, set by `ui/CameraButtons`); on landscape phones it steps aside then. On a
  portrait phone the chips open below the driving gauges (`--hud-bottom`).
- **Shots after a long session of hot reloads:** a stale shadow once darkened the doors in a
  hero shot (not reproducible on a fresh load, after `perf-states.js` or `frame-clash.js`).
  Reload the page before final review shots.

## Status (2026-11-15, phase 9)
- **Phase 9 on `wip/f40-phase9`** (from `main` = 8D, unattended, a commit per sub-phase, not
  pushed). Summary, figures, shots: docs/REVIEW.md ("Phase 9"); decisions: docs/BRIEF.md
  ("Phase 9A / 9B / 9C").
- **9A feel:** camera profiles classic / anchored (default) / grab (`config/scene.ts`
  `controls.profiles`, `scene/CameraRig.tsx`, `scene/cameraFeel.ts`, `?cam=`); auto shift in the
  sim (`autoShift`, `DRIVE.auto`); dyno run (`engine/dyno.ts`, deterministic timeline played
  back); launch timer; live dyno graph (`ui/DynoGraph.tsx`). Scripts: `scripts/dev/
  camera-check.js`, `touch-check.js` (Playwright MCP `run_code` `filename`), `auto-test.mjs`.
- **9B exhaust:** pops in the sim (`ENGINE_SIM.pops`, seeded), flames (`engine/Flames.tsx`),
  synth pops (`SOUND.pops`); gas flow in X-ray (`engine/GasFlow.tsx`, "Flow" beside X-ray, the
  flow pipes' faint `flow` ghost); positional sound (`engine/audio/position.ts`,
  `SOUND.position`). Phone review: `scripts/dev/phone-shots.js`.
- **9C car details:** the donor model ("Ferrari F40 | www.vecarz.com", Nic Cheung, CC BY 4.0)
  goes through `npm run prep:donor` (`scripts/prep-donor.mjs`, rules `scripts/donor-rules.mjs`)
  into `public/models/donor.opt.glb`, used only via `src/body/donor.ts` (wheels, discs,
  calipers replace or join body parts; badges and gauge faces ride on their panels). Brake glow
  (`materials/brakeGlow.ts`, `engine/brakeHeat.ts`), needles (`engine/Gauges.tsx`), lights and
  pop-up pods (`engine/Lights.tsx`; pods split by body-rules `POD`, so `npm run prep:body` was
  re-run), doors (`engine/Doors.tsx`), all figures in `config/details.ts`. Phone review:
  `scripts/dev/phone-shots-9c.js`. Dev: `__dev.setFlow / setLights / setDoors`,
  `__dev.engine({ flame, brakeHeat })`, `__dev.view('cockpit')`; dev part labels moved to key N.

## Status (2026-11-15, 8D)
- **8D on `wip/f40-motion`** (unattended, a commit per half, not pushed): 8D-1 mobile layout
  (desktop / portrait / landscape-driving, `state/ui.ts`, `ui/ControlBar.tsx`), a freer camera
  (`scene/CameraRig.tsx`, free area measured in `scene/freeArea.ts`, taps in `scene/taps.ts`),
  quality tiers (`state/quality.ts`, `scene/QualityController.tsx`), heat glow
  (`materials/heatGlow.ts`). Review shots on phones: a second browser context with
  `isMobile/hasTouch/deviceScaleFactor` (see REVIEW "8D-1"); pin `?tier=N` for shots (the slow
  review browser drops the tier otherwise).
- **8D-2 done:** gears and a rolling road. Sim and figures: `engine/sim.ts`, `DRIVE` / `GATE` in
  `config/engine-sim.ts`; headless check `node --import ./scripts/ts-hooks.mjs
  scripts/dev/drive-test.mjs` (0–100 4.01 s, top 324.3 km/h). Gearbox motion: sleeves, forks
  (`selector-forks`), pinion, crown, driveshafts in `parts/transaxle/geometry.ts`, driven by
  `motionState` sources input / output / wheel (`engine/motion.ts`); model parts that move (rear
  wheels and discs, the gear lever) in `engine/modelMotion.ts`. The lever is split from the model
  by `scripts/body-rules.mjs` (`GEAR_LEVER` box); its gate is measured in `GEAR_LEVER` in
  `config/dims.ts`. Drivetrain sounds in `SOUND.gearbox / road / clunk`; four new offline clips.
  Dev: `__dev.engine({ gear, speedKmh, clutch, lever })`. Known: in R the stick grazes the
  model's narrowed reverse slot (~1.5 mm, REVIEW "8D-2").

## Status (2026-11-15)
- **Phase 8 on `wip/f40-motion`** (from `main`, unattended; a commit per sub-phase, not
  pushed): 8A missing engine parts and draw-call headroom (peak 471 → 412); 8B the running
  engine (done); 8C its procedural sound (done). Sound: `config/sound.ts` (voicing),
  `engine/audio/` (synth, worklet, live output); renders with `__dev.renderAudio(names?, true)`
  (WAV + spectrogram downloads; the review harness saves them to docs/review/f40-phase8/audio/),
  live status with `__dev.audio()`. Summary, figures and gates: docs/REVIEW.md ("Phase 8");
  decisions: docs/BRIEF.md ("Phase 8").

## Status (2026-11-13)
- Phase 1 approved and merged into `main`.
- **Phases 2–4 done on `wip/f40-build`** (unattended run; one checkpoint commit per phase,
  not pushed): intake, ignition and ancillaries; turbos, intercoolers and exhaust; the
  5-speed transaxle with clutch, driveshafts and shift linkage. Summary, figures and gates:
  docs/REVIEW.md; decisions (incl. "Decisions made unattended") in docs/BRIEF.md. Next:
  owner review, then phase 5 (spaceframe, suspension, brakes); draw calls are at 471 of
  ~500 at peak, so phase 5 has to instance or merge.
- Exhaust layout notes: the model's exhaust mouth is a short oval tunnel in the rear clam
  (car y 0.282–0.363, |x| ≤ 0.125, z −1.965…−2.085); its floor swings up as the clam opens,
  so nothing of ours may reach into it. Undertray top under the silencer: car y 0.19–0.21 at
  |x| < 0.1, 0.25–0.29 at |x| 0.2–0.35 (rising to the back). The model's stand-in lower frame
  has a rail at x ≈ ±0.30–0.34 rising from car y 0.26 (z −1.6) to 0.39 (z −1.9) and struts at
  x ±0.35–0.38 near z −1.63: keep clear of them, including during the stage-2 slide.
- Timeline: stage starts 0 / 0.75 / 1.70 / 2.50 / 3.75 s (`STAGE_START`), the slide waits
  `POWERTRAIN_SLIDE_DELAY` (0.25 s), ~4.9 s in all; `setProgress(t)` takes t / 4.9. Since
  phase 8 the powertrain slides back 0.37 m (the roof's trailing edge reaches z ≈ −0.727 at
  the height the engine's front passes it).
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
URL: `?view=front34|top|engine|side|rear34|chassis&chassis=1&explode=1&t=<s>&fit=1&segments=1&labels=1&solo=<id>[,<id>…]&soloGroup=<group>&ghost=1&clashes=1|all&clashFocus=<a,b>&clashAt=<s>&guides=0&cam=x,y,z&look=x,y,z&perfPeak=1&inspect=<id>&xray=1&snap=1&panel=0`
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
await __dev.setProgress(t)        // explode timeline at t (0…1), posed directly (×4.9 s total now)
await __dev.select('crankshaft')  // inspect a part; __dev.clearSelection()
await __dev.setXray(true); await __dev.setSolo('engine' | null); await __dev.setLabels(true)
await __dev.setGhost(true); await __dev.setSegments(true)   // key B / key K
await __dev.view('rear34'); await __dev.fit()               // preset; frame everything visible
await __dev.view('chassis'); await __dev.setChassis(false)  // phase 5: the Chassis view (body hidden) on / off
await __dev.setSoloParts(['starter-motor', 'flywheel'])   // show only these parts (null: all)
await __dev.clash({ at, focus, allPairs, skipBody, pairs, progress })  // clash check now, no reload
// pairs: [['pistons-l', 'crankshaft'], ['conrods-r:titanium', '*']] (id:material, '*' any part);
// skipContacts leaves declared contacts out; detail reports each instance
await __dev.engine({ running, rpm, throttle, timeScale, crankAngle, pinionIn, heat, blurDeg, free, cylinder })
// rpm: run held at that speed; crankAngle (deg): pose the crank and freeze it (screenshots;
// free: true lets it turn); running: false stops at once (static pose)
await __dev.setFlow(on); await __dev.setLights(on); await __dev.setDoors(on)   // 9B / 9C toggles
await __dev.engine({ flame: { age, strength, length }, brakeHeat: [front, rear] | null })  // 9B / 9C poses
await __dev.dynoRun(); await __dev.cameraFeel('anchored')   // 9A
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
- `screenshotReady` doesn't settle while the car rolls (shadows keep re-rendering): pose the
  engine with `crankAngle` (held) and `speedKmh: 0` for shots; measure perf while rolling with
  a plain wait instead.
- Editing a source file while a phone review script runs hot-reloads the phone page and stalls
  the script: don't touch `src/` during `scripts/dev/phone-shots*.js`.
- three ignores `material.envMapIntensity` when lighting comes from `scene.environment`;
  set levels through `EnvironmentLevels` (or `modelEnvLevels` for model materials).
- `THREE.Clock` deprecation warning comes from inside R3F.
- Bundle > 500 kB warning (three + drei); code-split in the performance pass.
- docs/reference/ images are third-party and git-ignored (docs/reference/f40/ is empty).
- Through the Lexan from behind, the studio's reflection on the pane washes the right cam
  cover to grey (realism pass).
