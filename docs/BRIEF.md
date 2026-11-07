# Project: Exploded Hypercar — interactive 3D powertrain reveal

This is the reference spec. It is kept up to date when a decision changes it; see the
decision log at the bottom.

## Goal
A single-page site showing a mid-engined V12 hybrid hypercar. One button ("Explode")
animates the car apart in stages so the viewer sees how a 6.3L V12, hybrid system,
gearbox and battery are packaged inside a car only 1.116 m tall. Pressing again
reassembles it. Clicking any part focuses the camera on it and shows an info panel.

Engineering layout follows the real Ferrari LaFerrari. The OUTER BODY must be an
ORIGINAL hypercar design (my own), NOT a replica of Ferrari's styling, and must contain
no Ferrari names, logos, badges or wordmarks anywhere in geometry, textures or UI.
Build the body so it can later be swapped for an external licensed GLTF.

## Stack
- Vite + React + TypeScript
- @react-three/fiber, @react-three/drei, @react-three/postprocessing
- GSAP for the explode timeline
- Zustand for state (exploded state, selected part, hovered part)
- No backend. Must hold 60 fps on a mid-range laptop.

## Units & coordinates
1 unit = 1 metre. Origin = ground under the centre of the wheelbase.
+Z = forward, +Y = up, +X = car's left.

## Reference dimensions (use these)
- Overall: L 4.702, W 1.992, H 1.116. Wheelbase 2.650.
- Track: front 1.68, rear 1.61 (at tyre centreline).
- Ground clearance: 0.104.
- Tyres: front 265/30R19, rear 345/30R20 (compute real outer diameters).
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

Estimates in use until better figures exist (all in `src/config/dims.ts`):
front overhang 0.975 (rear derived: 1.077), crank centreline height 0.28,
cylinder spacing 104 mm, engine z-range −0.20 (front face) to −0.95, gearbox with the
differential on the rear axle line and the gear cluster behind it, e-motor on its rear.

Derived: front tyre Ø 641.6 mm, rear tyre Ø 715.0 mm; axles at z = ±1.325;
wheel centres at y = 0.321 (front) / 0.358 (rear).

## Architecture
src/config/dims.ts — ALL dimensions, including derived ones (axle z, wheel centre
heights, explode distances). Every part reads from it; no magic numbers inside part
files, so proportions can be retuned in one place.

src/parts/registry.ts — the single source of truth for parts. Each part:
  { id, name, group, description, specs: Record<string,string>,
    build: () => JSX (procedural geometry), position, rotation,
    explodeOffset: [x,y,z], stage: number, color/material key,
    parent?, explodeRotation?, pivot?, delay? }
- `position` is always in car coordinates, even for child parts.
- `parent`: child parts ride along with the parent's explode motion, and their own
  `explodeOffset` is added on top (e.g. engine parts ride the stage-3 powertrain lift,
  then split in stage 4).
- `explodeRotation` + `pivot`: hinged motion (doors swing up, exhausts swing out).
- `delay`: seconds after the stage starts (doors move before other body panels).
Groups: "body", "chassis", "suspension", "wheels", "engine", "hybrid",
"transmission", "cooling", "exhaust".

Each part is its own mesh/group so it can move independently.
Use InstancedMesh for repeated parts (cylinders, pistons, valves, bolts).

## Procedural parts (aim for ~25 assemblies)
Engine (split into sub-parts so the engine itself explodes):
  block, crankshaft (visible), 12 pistons + rods, 2 cylinder heads,
  2 cam covers, intake plenum + 12 runners in the V, 2 exhaust manifolds
  (6-into-1 style, outside each bank), dry-sump pan, aux e-motor.
Exhaust: manifolds above, plus exhaust-rear (catalysts, silencer, tips).
Hybrid: main e-motor, battery pack, orange high-voltage cables (tube geometry),
  routed battery -> main motor AND battery -> aux motor.
Transmission: DCT casing, rear differential, driveshafts to rear hubs.
Chassis: carbon tub (with seat shapes), front crash structure, rear subframe.
Suspension & wheels: wishbones/links, uprights, springs/dampers, 4 discs + calipers,
  4 wheels + tyres at correct sizes.
Cooling: 2 side radiators.
Body (ORIGINAL design): nose, front clam, doors (butterfly-style hinge is a generic
  hypercar feature, fine to use), roof/canopy, engine cover (glass), rear clam,
  rear wing, side intakes, undertray-diffuser. Smooth low-poly-but-clean surfaces from
  lathe/extrude/CatmullRom-lofted shapes.

## Explode sequence (GSAP timeline, ~4 s total, staged)
Stage 1: body panels lift and spread outward (doors swing up first).
Stage 2: wheels slide outward, suspension follows.
Stage 3: engine + gearbox assembly rises out of the bay.
Stage 4: engine breaks apart — heads lift off, cam covers lift higher,
         intake rises out of the V, exhausts swing outward, pistons rise
         from the block, sump drops.
Stage 5: e-motor slides rearward off the gearbox; battery drops below the tub
         (see open questions).
Second click: reverse timeline. Allow interruption mid-animation.

## Interaction & UI
- Big single "Explode / Assemble" button, bottom centre.
- drei `<CameraControls>` (damped orbit, sensible zoom limits); its smooth fit-to-box
  is used for click-to-frame.
- Hover: outline highlight + part name tooltip.
- Click: camera eases to frame the part; side panel shows name, description,
  specs from the registry. Esc / click empty space to close.
- Toggle: "X-ray" mode (body panels go translucent, no explode) to show packaging
  in place.
- Dark studio look: soft environment lighting, contact shadows, subtle bloom.
  Carbon parts dark with fine weave-like roughness; engine metals brushed aluminium;
  HV cables orange; body a single strong original colour.

### Dev-only aids
- Part-id labels floating over each part (toggle, key L).
- Guides: origin axes, axle lines, centreline (toggle, key G).
- FPS meter.

## Body swap
Write src/body/BodyLoader.tsx that can replace the procedural body with an external
GLTF (by mesh-name mapping to registry ids) behind a config flag. Leave it off.

## Work plan — do ONE milestone at a time, run the dev server, and stop for review
Commit at the end of each milestone with a clear message.
1. Scaffold project, scene, lighting, controls, registry system, ground grid.
2. Full V12 engine (all sub-parts) at correct scale; engine-only explode test.
3. Gearbox, e-motor, battery, HV cables, cooling.
4. Tub, subframes, suspension, wheels, brakes.
5. Original body shell.
6. Full staged explode timeline + reverse.
7. Hover/click/inspect panel + X-ray mode.
8. Polish: post-processing, performance pass, mobile layout.

## Open questions
- Battery exit in stage 5: the pack's underside is only ~1 cm above the ground
  (clearance 0.104 m), so "drops below the tub" would go through the floor. Milestone 1
  sinks it to the ground while sliding it out past the car's left side instead.

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
