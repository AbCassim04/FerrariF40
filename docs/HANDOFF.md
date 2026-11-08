# Handoff

Where the project stands and how to work on it. The spec and decision log are in
docs/BRIEF.md; read that first.

## Status (2026-11-08)
- Milestone 1 (scaffold, scene, registry, explode pipeline) done and reviewed.
- Licensed body model integrated and segmented into parts; body explode reviewed and
  fixed (step 0 of milestone 2).
- Milestone 2 plan approved and committed (319b918; docs/M2-PLAN.md has the decisions).
- **2a done, awaiting review**: all 33 engine parts at true scale (src/parts/engine/,
  every size in DIMS.engine), stage-4 teardown, triangle clash check (assembled vs body:
  only the old battery placeholder; full explode: no overlaps), engine-cover glass fix
  and bay display light.
- Next: 2b intake, fuel, exhaust (plenum, runners, throttle bodies, intake tubes,
  airboxes, fuel rails, headers, catalysts, silencers, tips, ECUs, looms).
- Gearbox, e-motor and battery are still placeholder boxes (`ref-*`, replaced in 2c).

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
  V12: `layout.ts` bank frames and kinematics, `geometry/*` builders), `parts/reference`
  (powertrain assembly + placeholders). Types in `parts/types.ts`.
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
URL: `?view=front34|top|engine|side|rear34&explode=1&fit=1&segments=1&labels=1&solo=<id>&soloGroup=<group>&ghost=1&clashes=1&guides=0&cam=x,y,z&look=x,y,z`
(`explode=1` jumps straight to the final pose; `fit=1` frames the scene after load;
`cam`/`look` set the starting camera for review screenshots).

## Verifying without a GPU
Headless Chromium works with borrowed libraries (Firefox's bundled NSS from the
Playwright cache, libasound extracted from the Ubuntu .deb), SwiftShader WebGL. It
renders at 1–5 fps and GSAP lag smoothing stretches animations, so screenshot final
poses via `?explode=1` rather than waiting for the timeline. Frame-rate numbers there
are meaningless.

## Known issues
- Placeholder battery intersects the model's floor/seats (clash check reports it; replaced in 2c).
- The model's other glass (canopy, doors) uses transmission, which costs an extra render pass; revisit in 2f.
- `THREE.Clock` deprecation warning comes from inside R3F.
- Bundle > 500 kB warning (three + drei); code-split in the performance pass.
- docs/reference/ images are third-party and git-ignored.
