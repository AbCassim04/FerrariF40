# Handoff

Where the project stands and how to work on it. The spec and decision log are in
docs/BRIEF.md; read that first.

## Status (2026-11-08)
- Milestone 1 (scaffold, scene, registry, explode pipeline) done and reviewed.
- Licensed body model integrated and segmented into parts; body explode reviewed and
  fixed (step 0 of milestone 2).
- Next: milestone 2 plan (revised parts list + layout sketch) awaiting approval, then
  sub-milestones 2a–2f.
- Powertrain/battery are still placeholder boxes (`ref-*` ids under `powertrain`).

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
- `src/parts/registry.ts` — all parts; `parts/body` (model parts), `parts/reference`
  (placeholders). Types in `parts/types.ts`.
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
Keys: L ids, G guides, S segments, C clashes. Panel: solo, camera presets.
URL: `?view=front34|top|engine|side|rear34&explode=1&fit=1&segments=1&labels=1&solo=<id>&clashes=1&guides=0`
(`explode=1` jumps straight to the final pose; `fit=1` frames the scene after load).

## Verifying without a GPU
Headless Chromium works with borrowed libraries (Firefox's bundled NSS from the
Playwright cache, libasound extracted from the Ubuntu .deb), SwiftShader WebGL. It
renders at 1–5 fps and GSAP lag smoothing stretches animations, so screenshot final
poses via `?explode=1` rather than waiting for the timeline. Frame-rate numbers there
are meaningless.

## Known issues
- Placeholder battery intersects the model's floor/seats (clash check reports it).
- `THREE.Clock` deprecation warning comes from inside R3F.
- Bundle > 500 kB warning (three + drei); code-split in the performance pass.
- docs/reference/ images are third-party and git-ignored.
