# Project: Ferrari F40 teardown — interactive 3D exploded view

This is the reference spec. It is kept up to date when a decision changes it; see the
decision log at the bottom. Current state and how to work on the code: docs/HANDOFF.md.
The build plan for the powertrain and chassis: docs/F40-PLAN.md.

This repository started as a copy of the LaFerrari teardown (github.com/AbCassim04/LaFerrari,
which is never touched from here). Its spec, plan, review and body report are archived in
docs/archive/laferrari/.

## Goal
A single-page site showing the Ferrari F40. One button ("Explode") animates the car apart
in stages so the viewer sees how a twin-turbo V8, its intercoolers, a five-speed transaxle
and a steel tube frame are packaged under a body only 1.13 m tall. The reveal is the rear
clam: it opens about its tail hinge like the real one, showing the engine that was visible
through the louvred Lexan cover, then lifts away. Pressing again reassembles. Clicking any
part focuses the camera on it and shows an info panel.

Engineering layout follows the real F40.

### Body: licensed model
"Ferrari f40" by Black Snow (Sketchfab), CC BY 4.0, at assets-src/models/f40/body.glb
(original, untouched; not shipped: the site serves only the adapted
public/models/body.opt.glb).
- The MODEL provides: body panels, doors and door glass, front and rear clams, the Lexan
  engine cover, wing, glass, cockpit, wheels/tyres, plain brake discs, undertray, and
  stand-ins for the frame, suspension, radiator and the whole powertrain.
- WE BUILD procedurally: the V8 and everything on it, turbos, intercoolers, exhaust,
  gearbox and clutch, driveshafts, the tube spaceframe, suspension, calipers and
  cross-drilled discs, cooling, fuel and electrics (docs/F40-PLAN.md).
- The model's stand-in engine and powertrain are hidden (`model-engine-bay`, dev key B
  ghost). Its stand-in frame, suspension and radiator stay visible as `model-chassis` until
  our parts replace each region.
- The UI credits the model with links to the source and licence, noting it is modified,
  plus the fan-project disclaimer (Ferrari and F40 are trademarks of Ferrari S.p.A.).
- Procedural parts carry no logos or text (the cam covers are red crackle, without
  lettering). The model's own badges are part of the licensed asset.
- Licence obligations (CC BY 4.0): attribution, a licence link, and noting the changes
  (public/models/LICENSE.md). Root LICENSE: code all rights reserved, third-party assets
  excepted.

## Stack
- Vite + React + TypeScript
- @react-three/fiber, @react-three/drei, @react-three/postprocessing
- GSAP for the explode timeline
- Zustand for state (exploded state, selected part, hovered part)
- Asset pipeline: @gltf-transform + meshoptimizer (scripts/prep-body.mjs)
- three-mesh-bvh (dev clash check, bay measurement, layout sketch)
- No backend. Must hold 60 fps on a mid-range laptop.

## Units & coordinates
1 unit = 1 metre. Origin = ground under the centre of the wheelbase.
+Z = forward, +Y = up, +X = car's left. The prepped body model is baked into this frame.

## Reference figures (mitorosso.com)
- Engine: F120A, twin-turbo 90° V8, bore 82 × stroke 69.5 mm, 2936 cc, 4 valves per
  cylinder, two cams per bank (one toothed belt per bank), dry sump with oil cooler (right
  side), 2 IHI turbochargers, 2 Behr intercoolers, 1.1 bar, Weber-Marelli injection and
  ignition, 7.7:1, 478 hp at 7000 rpm, 577 Nm at 4000 rpm.
- Crank: flat-plane — every source that names it says so (the F106/F114 family it comes
  from), but no primary spec sheet was found. Firing order 1-5-3-7-4-8-2-6 (the order cited
  for Ferrari's flat-plane V8s: banks alternate, 1-3-4-2 within each).
- Wastegates: mitorosso lists "1 wastegate valve"; parts sources point to one per turbo
  joined into the centre pipe (open question, docs/F40-PLAN.md).
- Transmission: 5-speed manual + reverse, longitudinal, with oil cooler (left side);
  twin-disc dry clutch; limited-slip differential.
- Chassis: steel tube frame strengthened with composites; body carbon fibre and Kevlar.
- Suspension: double wishbones front and rear, coaxial coil springs, Koni dampers, anti-roll
  bars. Brakes: Brembo ventilated, cross-drilled 330 mm discs, 4-piston aluminium calipers.
- Wheels: 8 × 17 front, 13 × 17 rear, five-spoke, centre lock; tyres 245/40 ZR17 and
  335/35 ZR17.
- Dimensions: wheelbase 2450, track 1594 front / 1610 rear, length 4430, width 1980,
  height 1130 mm; ≈ 1100 kg.

## The model against the reference
The model is normalised with ONE uniform scale (×0.97145) so its wheelbase measures the
real 2450 mm; axes are never scaled independently, so the car keeps its modelled
proportions. Measured after scaling (docs/body-report.md):

| | model | reference | Δ | adopted (within 3 cm) |
| --- | --- | --- | --- | --- |
| wheelbase | 2.450 | 2.450 | 0 | yes (exact by the scale) |
| length | 4.399 | 4.430 | −31 mm (−0.7%) | no |
| width, excl. mirrors | 1.950 | 1.980 | −30 mm (−1.5%) | yes (borderline) |
| height | 1.138 | 1.130 | +8 mm (+0.7%) | yes |
| track front | 1.566 | 1.594 | −28 mm (−1.8%) | yes |
| track rear | 1.563 | 1.610 | −47 mm (−2.9%) | no |
| tyre Ø | 0.650 all round | 0.628 / 0.666 | −22 / +16 mm | — |

Values within 3 cm are adopted as the car's figures in DIMS. Geometry that meets the model
always follows the model's own measurement (our suspension must reach its wheels), so the
rear wheel centres are at the model's half track, 0.781, even though the rear track is not
adopted; info panels quote the reference figures.

Measured packaging (2 cm voxels, against the fixed bodywork, the wheels and discs; not the
stand-in frame/suspension, which our parts replace):
- Bay front wall (bulkhead behind the seats): z −0.37 (at y 0.46) to −0.41 (at y 0.75).
- engineBay (under the shelf below the cabin's rear window, y ≈ 0.80): x ±0.40,
  y 0.13–0.79, z −1.225…−0.525.
- engineBayTall (up to the Lexan): x ±0.40, y 0.13–0.97, z −1.225…−0.645.
- transaxleBay: x ±0.60, y 0.31–0.79, z −1.965…−1.225 (above the diffuser, between the
  rear wheels).
- Bay liner side walls at x ±0.50 from the bulkhead back to z −1.14; the roof's trailing
  edge at z −0.69; the Lexan ≈ 1.0–1.09 high over the bay.

## Architecture
src/config/dims.ts — ALL dimensions, including derived ones (axle z, wheel centre heights,
model measurements, bays, explode distances). Every part reads from it; no magic numbers
inside part files, so proportions can be retuned in one place. The engine is parametric:
cylinders, bank angle, bore, stroke, rod length, crank type (flat-plane or cross-plane),
firing order and cylinder numbering, bore spacing, bank offset, cam drive (belt or chain),
ignition (distributor or coil-on-plug) and every head, valve and block proportion come from
`engine` and `engineParts`; crank throws, bore positions, firing angles, valve lifts, deck
height and the engine's extents are derived.

src/parts/registry.ts — the single source of truth for parts. Each part:
  { id, name, group, description, specs: Record<string,string>,
    build: () => JSX (procedural geometry), position, rotation,
    explodeOffset: [x,y,z], stage: number, color/material key,
    parent?, explodeRotation?, pivot?, delay?, source?, contacts? }
- `position` is always in car coordinates, even for child parts.
- `parent`: child parts ride along with the parent's offset and swing; their own
  `explodeOffset` is added on top. Virtual parts (no build) carry children: the rear-clam
  hinge, the powertrain carrier and the powertrain.
- `explodeRotation` + `pivot` (car axes): hinged motion (doors, clams).
- `delay`: seconds after the stage starts.
- `source: 'model'`: geometry comes from the body model (with its own materials).
- `contacts`: parts this one is designed to touch (skipped by the clash check).
Groups: "body", "chassis", "suspension", "wheels", "engine", "transmission", "cooling",
"exhaust".

Each part is its own mesh/group so it can move independently.
Use InstancedMesh for repeated parts (pistons, valves, bolts).

Body pipeline: `npm run prep:body` turns body.glb into body.opt.glb with one top-level node
per registry part id and writes docs/body-report.md (normalisation and the deltas above,
wheel centres, panel bounds, bays, every source mesh → part). The pipeline is generic;
everything car-specific is in scripts/body-rules.mjs: source paths, the normalisation
(uniform scale to the wheelbase), segmentation rules (by material, per connected piece, or
by region with the triangles cut exactly along the region boundary), and what to measure.
Rules are written in the model's own space (its world space after its root matrix, before
scaling), because they are read off renders of the raw model.

Cable system: src/parts/cables/Cable.tsx — cables, hoses and looms that re-curve every frame
between their two ends (HT leads, oil and coolant lines, brake lines in the plan).

## Explode sequence (GSAP timeline, ~4.4 s now; ~5.2 s with the full plan)
Stage 1: body. The rear clam (with the Lexan cover) opens 70° about its tail hinge, then
         lifts up and back; the wing comes off it. Doors swing open about their front
         hinges; the front clam tips up about its nose and moves forward; the glass lifts.
Stage 2: wheels and discs slide outward; the powertrain slides 0.3 m back from under the
         roof's trailing edge.
Stage 3: the powertrain rises 1.2 m out of the bay.
Stage 4: engine teardown, outside in.
Stage 5: transmission (planned).
Second click: reverse timeline. Allow interruption mid-animation.

## Interaction & UI
- Big single "Explode / Assemble" button, bottom centre.
- drei `<CameraControls>` (damped orbit, zoom limits, target boxed above the ground).
- On Explode the camera eases out to fit the full exploded bounds (keeping the current
  viewing angle, with padding); on Assemble it returns to the previous view.
- Hover: outline highlight + part name tooltip.
- Click: camera eases to frame the part; side panel shows name, description, specs from the
  registry; every other part becomes a faint ghost. Esc / click empty space to close.
- Toggle: "X-ray" mode (body panels go translucent, no explode) to show packaging in place.
- Dark studio look: CC0 studio HDRI plus Lightformers, contact shadows, N8AO, ACES.
- Model credit line, bottom left.

### Dev-only aids
Keys: L part ids, G guides, K segment colours, C clash check (real triangles, assembled vs
body + overlaps at full explode), S solo the selected part's group, B the model's stand-in
powertrain as a ghost. Panel: solo a part or a group, camera presets. URL: ?view=front34|
top|engine|side|rear34, explode=1, t=<s>, fit=1, segments=1, labels=1, solo=<id>,
soloGroup=<group>, ghost=1, clashes=1|all, clashAt=<s>, clashFocus=<a,b>, guides=0,
cam=x,y,z&look=x,y,z, inspect=<id>, xray=1, snap=1, panel=0. FPS meter.
`window.__dev` scripting API for review checks on one persistent page (docs/HANDOFF.md).

## Rules
- References: docs/reference/f40/ photos, if present, for layout and proportions ONLY; never
  textures, logos or text (git-ignored, not ours to redistribute).
- Granularity: anything a person would name = its own registry part with an info-panel
  entry; repeated small items = instanced sub-parts riding with their parent; < 5 mm or never
  visible = skip.
- Everything fits the measured bays with no intersections (dev key C), and nothing overlaps
  at full explode or in the mid-explode sweeps.
- True scale, never shrunk to fit.
- Realism: ~1.5–3 mm bevels on hard edges, instanced bolts/clamps/brackets, per-material
  finishes. Budget: under ~1.5 M triangles and ~500 draw calls for the whole scene.

## Work plan
One phase at a time, one branch per phase; dev server, screenshots, gates (typecheck,
build, clash check), commit with a clear message, stop for review. The owner pushes.
git: never run stash, reset, clean or checkout -- <file> without asking.
1. Reset to the F40 + body integration + plan. ✓ (branch `wip/f40-phase1`)
2. Engine completion: intake, ignition, ancillaries.
3. Turbos, intercoolers, exhaust.
4. Transmission: 5-speed transaxle, clutch, shift linkage, driveshafts.
5. Chassis: tube spaceframe, suspension, brakes.
6. Cooling, fuel, electrics.
7. Realism and performance pass, mobile check.

## Open questions
See docs/F40-PLAN.md: wastegates (one or two), oil tank and fuel-cell positions, cylinder
numbering and bank offset, rod length and bore spacing, the wing's exploded position.

## Decision log
**2026-11-12 (phase 1: reset to the F40 + body integration)**
- New project from the LaFerrari repo; remote confirmed as AbCassim04/FerrariF40. LaFerrari
  docs archived in docs/archive/laferrari/.
- Removed: the LaFerrari body model and its licence file, its body rules, the hybrid system
  (battery, inverters, both e-motors, HV cables), the LaFerrari-specific powertrain layouts
  (V12 NA intake, 6-into-1 exhaust, 7-speed DCT transaxle, side-pod coolant hoses) and its
  info copy and credits. Their builders remain in git history (commit `b851fa8`) as starting
  points; docs/F40-PLAN.md says which. Kept: registry, renderer, explode timeline, clash
  check, inspect panel + isolation, X-ray, cable system (now car-neutral), realism setup,
  prep pipeline, deploy workflow.
- Engine made parametric (see Architecture): engine-wide firing order resolved from the
  crank layout and bank geometry (works for even or uneven firing), crank throws from the
  crank type, block-relative positions for every ancillary, belt or chain cam drive,
  distributor or coil-on-plug ignition. Configured as the F120A: 2936.2 cc derived.
- Estimates (no published figures found): bore spacing 92 mm, rod 125 mm, bank offset 20 mm
  (right bank leads), cylinders 1–4 right / 5–8 left from the timing end, head and valve
  proportions scaled to the 82 mm bore, crank height 0.27, belt-cover face z −0.40.
- Deploy base '/FerrariF40/' (Vite base for build and preview; public files through
  `asset()`); workflow comment updated. Page title "F40 Teardown".
- Body model "Ferrari f40" by Black Snow (Sketchfab), CC BY 4.0, from the owner's download
  (assets-src/models/f40/body.glb; metadata checked: author, licence and source match).
  Credit, licence link and "modified" in the UI and public/models/LICENSE.md; root LICENSE
  updated.
- Orientation verified: the source is Z-up with −Y forward; its root matrix (−90° about X)
  gives +Y up, +Z forward, +X = car's left (headlamps at +Z, tail lamps at −Z, the
  left-hand-drive controls at +X).
- Normalisation: ONE uniform scale fitted to the 2450 mm wheelbase (owner's decision);
  deltas logged above.
- Segmentation: front clam, rear clam (with the Lexan cover, tail lamps and grille), rear
  wing, doors (with their glass, cards and mirrors), glass (windscreen, quarter windows,
  rear pane), cockpit ("interior"), roof/pillars/sills ("body-shell", incl. the bay liner and
  the side intakes behind the doors, as the model's own seam puts them), floor & diffuser
  ("undertray"), wheels, brake discs. The model has no calipers: procedural ones come with
  the brakes. Welded panels are cut exactly along region boundaries (door outline, the front
  clam's line along the door front and the windscreen base, the wing's endplates) instead of
  by whole triangles, so the cuts are clean lines.
- Stand-ins: F40_Mechanics.001 (the stand-in engine) and the stand-in powertrain pieces of
  F40_Mechanics (gearbox, turbos, intercoolers, plenum, wastegates, silencer, tailpipes,
  driveshafts) → hidden `model-engine-bay` (key B ghost). Its frame rails, suspension and
  radiator → `model-chassis`, visible until replaced.
- Bays measured against the fixed bodywork, wheels and discs, not the stand-in frame (our
  spaceframe replaces it); the stand-in frame rails at x ±0.35 would otherwise cut the bay.
- Model materials that leave out `metallicFactor` (glTF default 1, with roughness 0) were
  perfect mirrors and read white; they get explicit finishes (`MODEL_FINISH`).
- Body explode: the rear clam's two-step motion uses a virtual hinge part (it opens, then
  lifts); the powertrain slides back 0.3 m (virtual carrier, stage 2) before lifting, as its
  front end tucks under the roof's trailing edge; 0.3 m clears the roof and keeps the block
  ahead of the frame's top crossmember over the axle. Glass lifts up and forward.
- `engine` view preset looks forward and down through the Lexan from above the tail.
- Visual verification (owner's request): Playwright MCP server on the GPU path with a
  SwiftShader fallback; dev-only `window.__dev` API (absent from production builds);
  one persistent page, no reloads between checks (docs/HANDOFF.md).
