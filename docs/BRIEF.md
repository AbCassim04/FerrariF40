# Project: Exploded Hypercar — interactive 3D powertrain reveal

This is the reference spec. It is kept up to date when a decision changes it; see the
decision log at the bottom. Current state and how to work on the code: docs/HANDOFF.md.

## Goal
A single-page site showing a mid-engined V12 hybrid hypercar. One button ("Explode")
animates the car apart in stages so the viewer sees how a 6.3L V12, hybrid system,
gearbox and battery are packaged inside a car only 1.116 m tall. Pressing again
reassembles it. Clicking any part focuses the camera on it and shows an info panel.

Engineering layout follows the real Ferrari LaFerrari.

### Body: licensed model (supersedes the original-body requirement, 2026-11-08)
The body is a licensed model: "2014 Ferrari LaFerrari" by Ddiaz Design (Sketchfab),
CC BY-NC-SA 4.0, at public/models/body.glb (original, untouched).
- The MODEL provides: body panels, doors + door glass, hood, front/rear kits, engine
  cover, interior, wheels/tyres, calipers.
- WE BUILD procedurally: the full V12, gearbox, diff, driveshafts, main + aux e-motors,
  battery, HV cables, radiators, exhaust, suspension, uprights, brake discs (and the rest
  of the milestone-2 parts list below).
- Our procedural tub is only kept if it doesn't clash with the model's interior;
  otherwise the model is the reference (currently: model only).
- The UI credits the model with links to the source and licence, noting it is modified.
- Procedural parts carry no logos or text. The model's own badges are part of the
  licensed asset.
- Licence obligations: attribution, non-commercial use only, and adaptations of the
  model (body.opt.glb) are shared under the same licence (public/models/LICENSE.md).

## Stack
- Vite + React + TypeScript
- @react-three/fiber, @react-three/drei, @react-three/postprocessing
- GSAP for the explode timeline
- Zustand for state (exploded state, selected part, hovered part)
- Asset pipeline: @gltf-transform + meshoptimizer (scripts/prep-body.mjs)
- three-mesh-bvh (dev clash check, bay measurement)
- No backend. Must hold 60 fps on a mid-range laptop.

## Units & coordinates
1 unit = 1 metre. Origin = ground under the centre of the wheelbase.
+Z = forward, +Y = up, +X = car's left. The prepped body model is baked into this frame.

## Reference dimensions
Real-car reference figures, with the model's measured values adopted where they differ
by < 3 cm (so our suspension meets its wheels):
- Overall (ref): L 4.702, W 1.992, H 1.116. Model measures L 4.724, W 2.115 incl.
  mirrors, H 1.105.
- Wheelbase: 2.655 (model; ref 2.650).
- Track: front 1.693, rear 1.622 (model; ref 1.68 / 1.61), at tyre centreline.
- Ground clearance: 0.104 (ref).
- Tyres: front 265/30R19 (Ø 641.6 mm), rear 345/30R20 (Ø 715.0 mm). Model wheel centres
  at y 0.324 front / 0.360 rear.
- Brakes: carbon-ceramic discs, 398 mm front, 380 mm rear.
- Suspension: double wishbone front, multi-link rear.
- Chassis: carbon-fibre monocoque tub, seats moulded into the tub.
- Engine: 6262 cc V12, 65° bank angle, bore 94 mm, stroke 75.2 mm, DOHC,
  naturally aspirated, longitudinal, rear-mid mounted behind the cabin.
  Dry sump (model a sump pan low and shallow).
- Gearbox: 7-speed dual-clutch, mounted behind the engine.
- Hybrid: main electric motor mounted on the BACK of the gearbox, driving the
  final drive via its own gear set. A small auxiliary electric motor replaces
  the alternator (mount on the engine front).
- Battery: ~66 kg Li-ion pack under the floor, beneath the seats.
- Cooling: side-mounted radiators feeding from side intakes.

Measured packaging (2 cm voxels, against all visible model geometry):
- Firewall z −0.338 (rearmost cabin structure spanning both seats; the model has no
  solid firewall panel).
- engineBay (tall core): x ±0.34, y 0.13–0.75, z −1.328…−0.348.
- engineBayWide (lower): x ±0.48, y 0.13–0.59, z −1.328…−0.588 (the bay narrows at the
  top front where the roof-intake ducts come in).
- transaxleBay: x ±0.50, y 0.21–0.65, z −1.768…−1.328.

## Architecture
src/config/dims.ts — ALL dimensions, including derived ones (axle z, wheel centre
heights, model measurements, bays, explode distances). Every part reads from it; no
magic numbers inside part files, so proportions can be retuned in one place.

src/parts/registry.ts — the single source of truth for parts. Each part:
  { id, name, group, description, specs: Record<string,string>,
    build: () => JSX (procedural geometry), position, rotation,
    explodeOffset: [x,y,z], stage: number, color/material key,
    parent?, explodeRotation?, pivot?, delay?, source? }
- `position` is always in car coordinates, even for child parts.
- `parent`: child parts ride along with the parent's offset and swing; their own
  `explodeOffset` is added on top.
- `explodeRotation` + `pivot` (car axes): hinged motion (doors, engine cover, headers).
- `delay`: seconds after the stage starts.
- `source: 'model'`: geometry comes from the body model (with its own materials).
Groups: "body", "chassis", "suspension", "wheels", "engine", "hybrid",
"transmission", "cooling", "exhaust".

Each part is its own mesh/group so it can move independently.
Use InstancedMesh for repeated parts (cylinders, pistons, valves, bolts).

Body pipeline: `npm run prep:body` turns body.glb into body.opt.glb with one top-level
node per registry part id and writes docs/body-report.md (normalisation, wheel
centres, hinges, bays, every source mesh → part). The source mesh names are unreliable
(pieces are merged by material across regions), so scripts/body-rules.mjs combines name
rules with spatial rules applied per connected piece. The model's stand-in engine bay
(plenum, airboxes, cables, ECUs, deck shelves, exhaust tips) goes to a hidden
`model-engine-bay` node: never rendered in production, kept as a placement guide.

## Milestone 2 spec: the full powertrain (2026-11-08)
Full text in the request of that date; the essentials:
- Placement guide: dev key B shows `model-engine-bay` as a faint ghost; our plenum,
  airboxes, inverters, cable routes and exhaust tips sit where the original's did.
- References: docs/reference/laf-ref-01..12.jpg (third-party portfolio; proportions,
  layout and routing ONLY; no textures, no logos or text on geometry; not committed).
- Layout: carbon plenum cover over the V (red centre seam, 12 runners under it); two
  ribbed intake tubes at the gearbox end from carbon airboxes either side of the
  gearbox (drawing from the rear-deck scoops); red cam covers per bank with 6 coil packs
  and edge bolts; silver block and heads; headers outside each bank, low, 6-into-1
  crossing tubes → catalyst per side → pipes along the gearbox → box silencer at each
  rear corner with twin tips at the body's exhaust openings; ribbed DCT casing with
  driveshafts leaving at its front third on the rear axle line, gear clusters behind,
  main e-motor cylinder on the very rear; inverter-l/r on top of the gearbox; orange
  HV bundles battery → inverters → main e-motor and inverter → aux e-motor; battery
  tray under the cabin floor; rear suspension mounting to the gearbox and a tubular
  rear subframe with bumper beam; radiators in the side pods tilted out ~30°; aux
  e-motor low at the cabin end; crank 6 throws at 120° with pistons at real phases.
- Parts checklist: engine core, second-tier detail, car-level parts as listed in the
  request (target ~150 registry parts, a few thousand instances, 60 fps).
- Granularity: anything a person would name = its own registry part with an info-panel
  entry; repeated small items = instanced sub-parts riding with their parent; < 5 mm
  or never visible = skip.
- Everything fits the measured bays with no intersections (dev key C).
- Explode stage 4 reads as a teardown, outside → in: plenum cover → intake tubes,
  airboxes, throttle bodies → runners + fuel rails → cam covers + coil packs →
  camshafts → heads (valves ride along) → headers swing out → sump drops → pistons +
  rods rise → crankshaft drops. Flywheel + clutch separate when the gearbox slides back.
  Stage 5: e-motor slides rearward, inverters lift off, battery slides out. Nothing
  overlaps at full explode. HV cables re-curve between their endpoints every frame.
- Realism: N8AO, CC0 Poly Haven studio HDRI (public/hdri/) plus our Lightformers,
  AgX/ACES, ~1.5–3 mm bevels on hard edges, instanced bolts/clamps/brackets/looms,
  per-material finishes (cast-alu noise, smooth cam covers, heat-tinted headers,
  clearcoated carbon, matte hoses, satin black brackets). Report draw calls and
  triangles for the powertrain.
- Sub-milestones, each reviewed and committed: 2a engine core + heads + valvetrain,
  2b intake + fuel + exhaust, 2c gearbox + clutch + hybrid + cables, 2d cooling + fuel
  tank + rear chassis + suspension, 2e front axle + car-level parts, 2f realism pass.

## Explode sequence (GSAP timeline, ~5.2 s total, staged)
Stage 1: body. Engine cover first and highest (it's the reveal; it opens about its front
         hinge as it lifts), doors swing up, then roof/canopy, the other panels, and
         finally the rear clam (up and back) and the wing above it.
Stage 2: wheels slide outward, suspension follows.
Stage 3: engine + gearbox assembly rises out of the bay.
Stage 4: engine teardown (see milestone 2 spec).
Stage 5: e-motor slides rearward; inverters lift; battery slides out to the car's left
         (open question below).
Second click: reverse timeline. Allow interruption mid-animation.

## Interaction & UI
- Big single "Explode / Assemble" button, bottom centre.
- drei `<CameraControls>` (damped orbit, zoom limits, target boxed above the ground).
- On Explode the camera eases out to fit the full exploded bounds (keeping the current
  viewing angle, with padding); on Assemble it returns to the previous view.
- Hover: outline highlight + part name tooltip.
- Click: camera eases to frame the part; side panel shows name, description,
  specs from the registry. Esc / click empty space to close.
- Toggle: "X-ray" mode (body panels go translucent, no explode) to show packaging
  in place.
- Dark studio look: soft environment lighting, contact shadows, subtle bloom.
- Model credit line, bottom left.

### Dev-only aids
Keys: L part ids, G guides, K segment colours, C clash check (real triangles, assembled
vs body + overlaps at full explode), S solo the selected part's group, B model engine-bay
ghost. Panel: solo a part or a group, camera presets. URL: ?view=front34|top|engine|side|
rear34, explode=1, fit=1, segments=1, labels=1, solo=<id>, soloGroup=<group>, ghost=1,
clashes=1, guides=0, cam=x,y,z&look=x,y,z. FPS meter.

### Later (noted, not built)
- "Cutaway" toggle that slices the gearbox and one bank open with a red section face,
  like laf-ref-06/07.

## Work plan
One milestone at a time; run the dev server, commit with a clear message, stop for review.
1. Scaffold project, scene, lighting, controls, registry system, ground grid. ✓
   Body model integration (licensed GLTF). ✓
2. Full powertrain, in sub-milestones 2a–2f (see the milestone 2 spec).
3. (folded into 2c/2d) Gearbox, e-motor, battery, HV cables, cooling.
4. (folded into 2d/2e) Subframes, suspension, brakes.
5. (done by the model) Body shell.
6. Full staged explode timeline + reverse.
7. Hover/click/inspect panel + X-ray mode.
8. Polish: post-processing, performance pass, mobile layout.

## Open questions
- Battery exit in stage 5: it currently sinks to the ground while sliding out past the
  car's left side ("drops below the tub" would go through the floor).

## Decision log
**2026-11-08 (before milestone 1)**
- Use drei `<CameraControls>` instead of `<OrbitControls>`.
- git: commit at the end of each milestone.
- Track F/R 1.68/1.61 m and ground clearance 0.104 m (real figures). Overhangs,
  crank height, cylinder spacing, gearbox layout and engine z-range: estimates OK for now.
- All dimensions live in src/config/dims.ts; no magic numbers in part files.
- HV cables: route both battery -> main motor and battery -> aux motor.
- Approved additions: exhaust-rear, undertray-diffuser, and registry fields
  explodeRotation, pivot, delay, parent.
- Dev-only toggle for floating part-id labels.

**2026-11-08 (after milestone 1)**
- Review fixes: child parts ride inside the parent's swing; pivot/explodeRotation are
  in car axes; camera target boxed above the ground.
- Licensed body model adopted ("2014 Ferrari LaFerrari" by Ddiaz Design, Sketchfab,
  CC BY-NC-SA 4.0). This replaces the original-body requirement and the procedural body
  and wheels. Credit line in the UI ("· modified" added, as the licence requires).
- Model prep: unused skin removed (it was referenced by no node), transforms baked,
  ×100 to metres, ground at y 0 and wheelbase centred; meshopt; 7.56 MB → 3.24 MB,
  449 → 79 draw calls.
- Adopted model values: wheelbase 2.655, track 1.693/1.622, wheel-centre heights,
  body extents. Front overhang estimate (0.975) replaced by the model's 1.200.
- Name-pattern mapping alone proved wrong (e.g. one left-door panel is named SM_Base,
  the roof is in SM_RearKit, all glass is one primitive), so segmentation is
  name + spatial rules per connected piece (scripts/body-rules.mjs).
- The model does have a stand-in engine bay (top surfaces only): hidden as
  model-engine-bay, used as a placement guide.
- Engine bay measured as two boxes (tall core + wide lower), plus a transaxle bay.
- Body explode: engine cover (glass + side rails + louvres) on its own, first and
  highest, tilting open about its front hinge; canopy (windscreen + roof + trailing edge
  with the third brake light) separate from the rear clam; stagger engine cover →
  canopy → panels → rear clam → wing. Camera fits the exploded bounds on Explode and
  returns on Assemble.

**2026-11-08 (milestone 2 plan and 2a)**
- Milestone 2 plan approved (docs/M2-PLAN.md, layout figures docs/m2-layout-*.svg).
- Battery: a flat tray on the model's underbody (y ≈ 0.10) under the cabin floor,
  20 mm deep at the back stepping to 42 mm at the front; touches nothing (built in 2c).
- Model shells: driveshafts and rear suspension pass through the model's connected
  underbody shell (wheelhouse liners, bay walls) as expected contacts; the duct panels
  behind each side-intake grille get hidden so the radiators sit there (2d).
- Clash check (C) tests real triangles, with a per-part `contacts` allowlist, plus a
  second pass for overlaps at full explode.
- Explode ~5.2 s: stage 4 is the outside-in teardown (0.8 s moves), stage 5 at 4.2 s.
- Dev keys: K segment colours, S solo group, B engine-bay ghost.
- Engine at true scale, never shrunk to fit: 0.58 m across the cam covers (from bore
  94, stroke 75.2, spacing 104, 65° V, rod 140 mm and estimated head proportions; no
  published F140 external dimensions found). The ~0.8 m often quoted is across the
  exhaust headers (2b). Deck height 0.207, block 0.67 m long, timing face to bellhousing
  0.715 m, sump bottom 0.145 above ground. It fits the bay with no body contact.
- Bank stagger: the right bank sits one rod width (22 mm) behind the left; crank 6
  throws at 0/240/120/120/240/0°, firing order 1-5-3-6-2-4 per bank; pistons and valves
  posed at their real positions for a 20° crank angle.
- Teardown distances retuned so nothing overlaps at full explode: rods rise 0.30 (out of
  the bores), pistons 0.36, gasket 0.40, heads 0.47; crank drops 0.25 and the sump 0.29
  (the scavenge pump stays above the bay's top-front ducts).
- Engine-cover glass: the prep's dedup() had merged the cover's own glass material back
  into the shared dark glass, so it was never tuned. It is now cloned after dedup and
  tuned to a clear, faintly tinted pane (15% opacity, no metallic tint, no shadow).
  Transparent model materials no longer cast shadows.
- Engine-bay display light: a soft downward area light over the engine's footprint,
  below the deck around the cover opening (no spill on the paint), intensity 5.
- Camera minDistance 1.5 → 0.6 so the exploded engine's detail can be inspected.
