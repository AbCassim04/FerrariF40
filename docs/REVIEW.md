# Overnight run review (`wip/m2-overnight`)

Unattended run of the overnight plan: 2b, 2c, 2f, then milestone 7. One checkpoint
commit per phase on `wip/m2-overnight`; nothing pushed, `main` untouched. Decisions taken
without review are in docs/BRIEF.md under "Decisions made unattended (review)".

Screenshots are in docs/review/ (headless Chromium + SwiftShader, 1440×900, dev panel
visible). The dev panel and the FPS meter in the corner are dev-only.

## How performance is measured
Dev-only `PerfProbe` (src/scene/PerfProbe.tsx) reads `renderer.info` per frame
(`autoReset` off, so every pass counts) and the scene's geometry triangles with instances
expanded. Review scripts read `window.__perf` and `window.__perfParts()` (per-part
triangles). Three figures per phase:
- **scene**: triangles of all visible geometry (instances expanded), the content itself;
- **idle**: one still frame (main pass only; shadows are not re-rendered when nothing moves);
- **peak**: a frame while animating (`?perfPeak=1`: main pass + one shadow pass, the
  shadow map and contact shadows alternate frame by frame).

Budget: under ~1.5M triangles and ~500 draw calls for the whole scene.

| Phase | Scene tris | Idle: calls / tris (engine view · exploded) | Peak: calls / tris (exploded) |
|---|---|---|---|
| Start (2a + body, before fixes) | — | ~980–1030 calls / 3.3M (every frame) | same |
| 1 (2b) | 670k (powertrain 568k) | 187 / 0.65M · 214 / 0.67M | 377 / 1.06M |

Before phase 1 every frame re-rendered the shadow map, the contact shadows and a
transmission pass for the body glass: four scene passes. See "Phase 1" below.

## Phase 1: 2b intake, fuel, exhaust, electronics

**Built** (26 parts, src/parts/engine/intakeExhaust.ts, geometry in
src/parts/engine/geometry/intakeExhaust.ts, routing in src/parts/engine/exhaustLayout.ts,
sizes in `DIMS.engine` plenum/runner/throttleBody/intakeTube/airbox/fuelRail/exhaust/ecu/
fuseBox/loom):
- `intake-plenum-cover`: lofted pillow (superellipse plan and section, cosine-spaced
  stations so the rounded ends stay smooth), three shallow flutes per side and a centre
  groove carrying a red seam; clear-coated carbon with a visible twill (UVs in metres).
- `intake-runners-l/r` (trumpets ×6 instanced), `throttle-body-l/r` (with actuator),
  `intake-tube-l/r` (ribbed bellows swept along a curve with a varying radius, plain cuffs
  and 2 clamps), `airbox-l/r` (carbon, lid, outboard snout).
- `fuel-rail-l/r` with 6 instanced injectors into the V side of each head.
- `headers-l/r`: 6 primaries per bank (CatmullRom, centripetal), two twisted pairs weaving
  in outboard lanes plus two inboard drops, merging on a ring into the collector cone;
  port flanges ×6, port gaskets ×6, flange bolts ×12, O2 sensors ×2 instanced. Explode
  swings 25° out about the port line. Clearance check: `node --import
  ./scripts/ts-hooks.mjs scripts/dev/check-headers.mjs` (closest tube centres 39 mm for
  34 mm tubes; ≥13 mm from the head, ≥38 mm from everything else).
- `catalyst-l/r`, `exhaust-pipe-l/r` (flanged both ends, 2 clamps), `silencer-l/r`
  (pressed two-shell box, 2 brackets), `exhaust-tips-l/r` (2 per side, hollow with rolled
  lips, centred on the body's openings at x ±0.643/±0.752, y 0.324, exit z −2.07).
- `ecu-l/r` on the bay side walls (finned face inboard), `fuse-box`, `wiring-loom-l/r`
  along the cam covers with a lead to each coil and 12 clips.
- 2a review fixes: timing cover with chain-path housings, cast rim, bosses and webs
  around the water pumps and aux motor (they break its outline); block skirts with a
  horizontal rib and cast bosses.

**The "grey mush" through the glass** had three causes, all fixed:
1. The glass was alpha-blended with a light grey diffuse colour: a grey film over
   everything behind it. Glass is now reflection-only (`src + dst × (1 − opacity)`).
2. Environment lighting has no occlusion, so the engine under the body reflected the
   whole studio softbox; and three silently ignores `envMapIntensity` for materials lit by
   `scene.environment`, so the earlier tuning never applied. `EnvironmentLevels` binds the
   environment explicitly; our parts keep 25% of it while the body is on, ramping to full
   as the body comes off.
3. One big display light over the bay was mirrored by the clear coat as a white sheet;
   now two narrow strips that read as highlight lines along the plenum's shoulders.

**Performance work** (needed to get under the budget): body glass no longer uses
transmission (that re-rendered the whole scene every frame); the shadow map and contact
shadows only re-render while something moves, alternating frame by frame; meshes under
4 cm cast no shadows. `PerfProbe` added for the figures above.

**Gates**: `npm run typecheck` and `npm run build` pass. Clash check (C): assembled vs
body, only `ref-battery` (the placeholder 2c replaces); exploded overlaps: none.

**Screenshots**: p1-engine-glass (the view this phase is judged by), p1-rear34,
p1-engine-solo, p1-plenum, p1-headers, p1-tips, p1-engine-explode, p1-timing-cover.

**Known, left for later phases**: the gearbox placeholder (`ref-gearbox`) is still a
bright box behind the plenum (2c); cast-aluminium noise reads blotchy close up and the
cam covers are still too pink (2f); no bevels on the airbox/ECU boxes beyond their
corner radius (2f).

## Blocked
(none so far)
