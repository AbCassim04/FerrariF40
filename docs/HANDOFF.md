# Handoff

Where the project stands and how to work on it. The spec and decision log are in
docs/BRIEF.md; read that first.

## Status (2026-11-08, overnight run)
- Milestone 1 (scaffold, scene, registry, explode pipeline) done and reviewed.
- Licensed body model integrated and segmented into parts; body explode reviewed.
- Milestone 2 plan approved (docs/M2-PLAN.md); 2a done (on main).
- **Overnight run on branch `wip/m2-overnight`** (never pushed; main untouched). Plan:
  phase 1 = 2b, phase 2 = 2c, phase 3 = 2f realism, phase 4 = milestone 7 inspect panel
  + X-ray. Progress, figures and screenshots in docs/REVIEW.md; unattended decisions in
  the BRIEF decision log.
- **Phase 1 (2b) done**: intake, fuel, exhaust, electronics (26 parts in
  `parts/engine/intakeExhaust.ts`), timing-cover and block detail, glass/lighting fixes
  for the through-the-glass view, shadow scheduling and perf probe.
- **Phase 2 (2c) done**: transaxle, clutch, hybrid system and re-curving HV cables in
  `parts/drivetrain/` (the `ref-*` placeholders are gone).
- Next: phase 3 = 2f realism (N8AO, studio HDRI, tone mapping, bevels, detail, materials).

## Run
```
npm install
npm run dev          # http://127.0.0.1:5173/
npm run typecheck
npm run build
npm run prep:body    # regenerate public/models/body.opt.glb + docs/body-report.md
```

## Layout
- `src/config/dims.ts` — every dimension (reference, model-measured, derived, explode).
- `src/config/scene.ts` — camera, controls, view presets, grid, shadows.
- `src/parts/registry.ts` — all parts; `parts/body` (model parts), `parts/engine` (the
  V12: `layout.ts` bank frames and kinematics, `geometry/*` builders, `intakeExhaust.ts`
  for 2b), `parts/drivetrain` (2c: transaxle, battery, driveshafts, `HvCable.tsx`),
  `parts/powertrain.ts` (the assembly that lifts out). Types in `parts/types.ts`.
- `src/geometry/build.ts` — geometry toolkit (extrude with exact bevels, lathe, merge,
  hulls, gears). `src/scene/MeshSet.tsx` — part builds from mesh specs (plain or
  instanced).
- `src/scene/PartsRenderer.tsx` — mounts each part as anchor → swing → content.
  `partObjects.ts` holds the live objects the timeline tweens.
- `src/explode/` — one GSAP timeline (play = explode, reverse = assemble), stage timing,
  exploded-bounds helper used for the camera fit.
- `src/body/BodyModel.tsx` — loads body.opt.glb, builds model parts, tunes the
  engine-cover glass, dev diagnostics (bbox, wheel drift vs DIMS) and segment colours.
- `src/scene/ClashCheck.tsx` — dev key C.
- `src/scene/EnvironmentLevels.tsx` — per-material environment levels (bay specular
  occlusion; body glass). `ShadowScheduler.tsx` — shadows only re-render while things
  move. `PerfProbe.tsx` — dev perf readout (`window.__perf`, `window.__perfParts()`).
- `scripts/dev/check-headers.mjs` — exhaust primary clearance check
  (`node --import ./scripts/ts-hooks.mjs scripts/dev/check-headers.mjs`; the hooks file
  lets Node load the app's TypeScript modules).
- `scripts/prep-body.mjs` + `scripts/body-rules.mjs` — body asset pipeline.

## Conventions
- Car coordinates: metres, +Y up, +Z forward, +X = car's left, origin on the ground at
  the wheelbase centre. Part `position` is always in car coordinates.
- No magic numbers in part files: sizes/positions come from DIMS, tessellation from
  `config/detail.ts`, colours from `materials/materials.ts`.
- One milestone (or sub-milestone) at a time: dev server, screenshots, commit, stop.
- Commit messages end with the Co-Authored-By line used in git history.

## Dev aids
Keys: L ids, G guides, K segments, C clashes, S solo group, B engine-bay ghost.
Panel: solo part or group, camera presets, clash report.
URL: `?view=front34|top|engine|side|rear34&explode=1&t=<s>&fit=1&segments=1&labels=1&solo=<id>[,<id>…]&soloGroup=<group>&ghost=1&clashes=1|all&clashFocus=<a,b>&clashAt=<s>&guides=0&cam=x,y,z&look=x,y,z&perfPeak=1`
(`explode=1` jumps straight to the final pose; `fit=1` frames the scene after load;
`cam`/`look` set the starting camera for review screenshots).

## Screenshots and visual checks (WSL2)
Playwright's Chromium, driven by a small script (`page.goto` the dev URL, wait, screenshot):
- **GPU (default, ~3–5× faster)**: the full Chromium build (`ms-playwright/chromium-*/
  chrome-linux64/chrome`), *headed* on the WSLg display (`DISPLAY=:0`) with the window
  off-screen (`--window-position=-4000,-4000`), flags `--use-angle=gl
  --ignore-gpu-blocklist`, env `LD_LIBRARY_PATH=/usr/lib/wsl/lib GALLIUM_DRIVER=d3d12`.
  WebGL renderer: "ANGLE (Microsoft Corporation, D3D12 (Intel(R) Iris(R) Xe Graphics),
  OpenGL 4.1)". Headless modes never reach the GPU here (they fall back to SwiftShader;
  `--use-angle=vulkan` only finds llvmpipe, no D3D12 Vulkan driver is installed).
- **Fallback**: `chrome-headless-shell` with `--use-angle=swiftshader
  --enable-unsafe-swiftshader` (CPU). The system Playwright dependencies are installed,
  so the borrowed NSS/libasound libraries are no longer needed.
- Benchmark (2026-11-08, same two shots): GPU 14 s and 23 s per shot; SwiftShader 41 s
  and 111 s. One GPU run crashed once ("page closed"), so scripts retry with SwiftShader.
- Use small viewports (800×500) while iterating, 1440×900 for review shots. GSAP lag
  smoothing still stretches animations at low frame rates: pose with `?explode=1` or
  `?t=<seconds>` rather than waiting for the timeline. `window.__perf` has the frame cost.

## Known issues
- three ignores `material.envMapIntensity` when lighting comes from `scene.environment`;
  set levels through `EnvironmentLevels` (or `modelEnvLevels` for model materials).
- `THREE.Clock` deprecation warning comes from inside R3F.
- Bundle > 500 kB warning (three + drei); code-split in the performance pass.
- docs/reference/ images are third-party and git-ignored.
