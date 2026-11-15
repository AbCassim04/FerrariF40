# Build review: phase 9 (`wip/f40-phase9`), phase 8, then phases 2–4

## Phase 9: feel, exhaust, car details (`wip/f40-phase9`)

Owner's brief 2026-11-15, three checkpoint commits. Every feature checked on desktop
1440×900, iPhone 13 portrait and landscape, and Pixel 7 portrait (emulated: a second browser
context with the device's size, pixel ratio, touch and user agent). Decisions in docs/BRIEF.md
("Phase 9A" …).

### 9A: camera profiles, auto shift, dyno tools

**Camera.** Diagnosis and the three profiles are in BRIEF ("Phase 9A"). Default **anchored**.
Switch with `?cam=classic|anchored|grab` or "more" → Camera feel (instant, remembered).

Scripted checks (`scripts/dev/camera-check.js`, `scripts/dev/touch-check.js`, run with the
Playwright MCP's `run_code` `filename`). Desktop 1440×900, from the front ¾ view: 5 zoom-ins
(one 100 px wheel notch each) at (25 %, 30 %), (72 %, 35 %), (30 %, 68 %), (68 %, 62 %),
(42 %, 40 %) of the canvas, then a 45° orbit (a left drag of 1/8 of the height). This review
browser draws ~4 frames a second, so per-frame turns are also given per 60 Hz frame.

| Profile | View turn while zooming (max) | Orbit turn per frame, max / median | Max per 60 Hz frame | Car centre on screen (x, y) | Pivot distance |
|---|---|---|---|---|---|
| classic | 0.00° | 4.42° / 4.38° | 0.17° | 0.54, 0.42 | 2.84 m |
| anchored | 0.00° | 7.60° / 4.41° | 0.94° | 0.25, 0.46 | 2.08 m |
| grab | 0.00° | 4.41° / 4.41° | 0.17° | 0.24, 0.46 | 2.04 m |

All inside the middle 60 % (0.2–0.8). Zooming and re-anchoring never turn the view; the orbit
is even (anchored's one 7.6° frame is two drag steps landing in one frame, 0.94° per 60 Hz
frame). Anchored and grab end closer to the surface (their pivot is on it), so the car's centre
sits further off the middle after the orbit. With two notches per zoom-in (a much deeper zoom,
0.5 m from the body) and a 112° orbit, anchored and grab put the car's centre off screen:
there the camera is looking at a hand's width of bodywork, and the orbit turns round it.

iPhone 13 portrait, touch (CDP `Input.dispatchTouchEvent`), per profile: two fingers land 120 px
apart left of centre, spread to 240 px, pan 80 px down together, then one lifts and the other
drags 90 px sideways.

| Profile | Point under the pinch, drift | View turn: 2nd finger lands / one lifts / one-finger drag after | Distance before → after |
|---|---|---|---|
| classic | 5 px | 0.00° / 0.00° / 0.00° | 17.6 → 15.2 m |
| anchored | 5 px | 0.00° / 0.00° / 0.00° | 17.6 → 15.2 m |
| grab | 4 px | 0.00° / 0.00° / 0.00° | 17.6 → 15.4 m |

Before the fix, lifting one finger let camera-controls rotate from the old two-finger midpoint.
Trackpad: ten ctrl + wheel events of −6 px (a pinch) moved the camera from 6.32 to 2.36 m with
the lens untouched (`camera.zoom` stays 1; it used to change); ten +8 px scroll events ×1.14;
a 100 px notch ×1.17.

**Auto shift** (`scripts/dev/auto-test.mjs`, headless):
- Flat out from N at rest: 1st at 0.2 s, 1→2 at 100 km/h, 2→3 at 155; the engine peaks at
  7653 rpm (limiter 7750).
- 35 % throttle: 1→2 at 50 km/h, 2→3 at 78; peak 3840 rpm.
- Kick-down: cruising in 5th at 118 km/h, then full throttle: 5→2 at once (5786 rpm), then up
  at 7650.
- Braking at 0.8 from 200 km/h in 5th: 5→4 at 160 km/h, 4→3 at 120, 3→2 at 85, 2→1 at 53
  (each ~4000–4300 rpm, blipped); at rest in 1st. Before the no-upshift-while-braking rule it
  hunted 4↔5.
- A manual shift holds it off for 3 s; then it carries on.

**Dyno run** (`__dev.dynoRun()`): t 0–100 4.01 s, 0–200 10.88 s; shifts at 101 / 156 / 215 /
284 km/h; top speed called at 321.3 km/h (58.3 s); braking 5→4 at 65 km/h (the dyno brakes at
0.6), stopped at 70.6 s; 72.6 s in all, 4355 frames, computed in ~70 ms. Live in the page: the
brake key cancels it and the car carries on (75 km/h in 1st in the test).

**Launch timer:** on the sim's clock, interpolated between frames: the live dyno run read
0–100 4.09 s, 0–200 10.88 s (the timeline: 4.01 from full throttle; the timer starts at the
frame before the car moved, which at this browser's 4 fps is up to 0.25 s early).

**Gates**
- Typecheck and build pass. Clash: assembled vs body none, full explode none (no geometry
  changed).
- Perf, desktop 1440×900 top tier, unchanged from 8D-2: idle 255 calls / 0.81 M triangles;
  running in 4th at 180 km/h 406–419 / 1.42–1.47 M; running exploded 407 / 1.42 M. The dyno
  graph and timer are HTML / SVG.
- Phones: medium tier (DPR 1.5) as before. HUD portrait 112–378 px (clear of the camera buttons
  at 12–100); landscape graph ends at 195 px, above the − thumb at 212.

**Screenshots** (docs/review/f40-phase9/): `9a-desktop-driving` (engine view, graph, timer
after a dyno run), `9a-desktop-more`, `9a-iphone-portrait` and `-sheet`, `9a-iphone-landscape`
(graph on), `9a-pixel7`.

**Needs a real phone or trackpad:** how each camera profile feels under a finger and on a
trackpad (pinch and two-finger scroll speeds); Auto shift's kick-down with a thumb on the
throttle (every press from a light foot kicks down).

## Phase 8: a running engine and its sound (`wip/f40-motion`)
Branch `wip/f40-motion` from `main` (phases 1–4 merged), one checkpoint commit per
sub-phase, not pushed. Built unattended; every judgement call is in docs/BRIEF.md under
"Phase 8". Screenshots: `docs/review/f40-phase8/` (local, git-ignored; 1440×900 on the GPU
browser, one persistent page driven through `window.__dev`).

### 8A: fixes, draw-call headroom, missing parts
**Built:** ECUs moved to a new `electrics` group; draw calls cut before adding anything (see
below); new parts `crank-damper`, `accessory-belt`, `belt-tensioners`, `starter-motor`,
`ignition-coil-l / -r`, `coil-leads`, and a rotor in each distributor. The cam belts are now
rings of short segments with printed marks (they will run in 8B); the cam drive is exactly 2:1.
Fixed on the way (all on `main` too): the right cam pulleys z-fighting through the belt
cover, the water pumps overlapping the cam belts, the belt cover clipping the roof's trailing
edge on the lift, the wastegate pipe catching the wastegates' cans (2.93–2.96 s), closed
valves dipping below the deck.

**Draw calls** (peak = the frame with the shadow pass live; budget ~500 / ~1.5 M):

| | idle calls / triangles | peak calls / triangles | meshes |
| --- | --- | --- | --- |
| before (phase 4, `main`) | 281 / 0.76 M | 471 / 1.36 M | 262 |
| after the merges, before new parts | 233 / 0.76 M | 386 / 1.42 M | 216 |
| after 8A | 251 / 0.78 M | 412 / 1.44 M (exploded 399 / 1.39 M) | 234 |

The merges are invisible: A/B screenshots against `main` (assembled, X-ray, through the
Lexan, exploded, inspect) differ in at most 0.04 % of pixels, all in the FPS meter. Peak
triangles rose 0.06 M because baked bolts and the merged model meshes now sit in meshes
that cast shadows.

**Gates**
- Typecheck and build: pass. Production bundle contains no dev API.
- Clash check: assembled vs body **none**; full explode **none**; ours against ours,
  assembled (info, focus on the new and changed parts): **none** after the declared contacts
  (the belt cover encloses the belts; the coils' brackets on the bellhousing).
- Mid-explode sweep: **every 0.05 s from 0.05 to 4.9 s, every part in focus: no contact
  appears during the explode.** The only pairs reported are 39 assembled touches present from
  t = 0 (pistons in their bores, heads on their gaskets, rods on the crank…) that end as soon
  as one of the two parts moves. `__dev.clash()` runs the check without a reload now.
- What the sweeps caught, and the fixes: damper and alternator on the roof's trailing edge
  (slide 0.37 m); cam pulleys rising into the belts (belts off at +0.4, cams with the heads);
  coil leads against the plug leads (coils ride the transaxle, the leads' cap ends held rigid);
  the starter's pinion shaft against the bellhousing on its lift (the shaft slides with the
  pinion); the wastegate pipe (above).

**Screenshots (docs/review/f40-phase8/):** 8a-01-timing-end (damper, alternator belt and the
moved alternator, engine solo), 8a-02-front-exploded (belt cover, belt and damper off the
front), 8a-03-starter-coils (coils on the bellhousing, coil leads into the caps' centres),
8a-04-starter-lifted (t = 3.95 s), 8a-05-exploded-rear34, 8a-06-assembled-lexan;
`ab/*-new.png` vs `ab/*-main.png` (the draw-call A/B).

### 8B: the running engine
**Built:** Start / Stop beside Explode and X-ray; while it runs, a panel with a tachometer and
boost gauge, a throttle (hold the button, Space or W, or touch-hold), the display speed
(Slow ×1/20, Strokes ×1/100, Real), the followed cylinder in Strokes, and volume / mute
(wired in 8C). A physics-lite sim (`engine/sim.ts`, figures in `config/engine-sim.ts`): idle
1000, limiter 7750 (fuel cut, back at 7600), boost to 1.1 bar with spool lag, start sequence
(pinion in, cranking 200 rpm for 0.8 s, catch, flare to 1500, idle; pinion out) and stop
(coast down). One crank angle drives everything: crank, pistons, rods, cams and their
pulleys at half speed, valves and springs, cam belts (travelling, with their marks),
tensioners, damper, alternator belt and alternator (2.06:1), distributor rotors (½),
flywheel and clutch, the gearbox's input and primary side in neutral (the secondary idlers
turn on their still shaft), the starter's pinion while it cranks. Assembled, the powertrain
rocks up to 0.4° with torque; the exhaust side glows with sustained load. Exploded, the same
motion runs in each part's own frame, with guide lines from the rods' big ends to their
crank pins. X-ray while running also sees through the block, heads, covers and caps, with a
flash in each cylinder in firing order. Strokes: the followed cylinder's stroke label,
lit open valves and spark. Off on load; the sim pauses with the tab hidden; reduced motion
keeps Slow, no rock, no Real. Engine off costs nothing (no per-frame work, static pose
identical to 8A).

**Clash: the moving engine, crank 0–710° in 10° steps, assembled and fully exploded.**
Pairs: pistons vs valves, heads, gaskets, block; rods vs crank, pistons, block, pan, each
other; valves vs each other and their heads; cams vs heads, covers, belts; belts vs crank,
tensioners, cam pulleys; damper, alternator and belt vs cover and pumps; crank vs block and
pan; crankshaft and pistons vs **every** part; starter vs flywheel and bellhousing (also with
the pinion in mesh); flywheel, clutch and gear clusters vs their casings. Result after the
fixes: **none**, assembled and exploded, other than declared contacts. Found and fixed:
- the counterweights cut 2.75 mm into the piston skirts around each BDC (at the static pose
  too, on `main`): counterweights 64 mm (were 70), 3.25 mm clear;
- the rods' cap bolts touched the solid dry-sump pan near BDC: the pan is now an open tray.
Declared (designed contacts, in the part definitions): pistons, rods and crank inside the
block (drawn as a closed casting), valves in their heads, cams in their heads and covers,
gear shafts in the gearbox casing. Standard checks: assembled vs body **none**, full explode
**none**.

**Perf** (draw calls / triangles; the shadow pass re-renders while anything moves):

| | calls / triangles |
| --- | --- |
| engine off (idle view) | 251 / 0.78 M (unchanged from 8A) |
| running, Slow or Strokes (assembled or exploded) | 399–412 / 1.40–1.44 M |
| running, Slow, anywhere in the explode (peak) | 412 / 1.44 M (= 8A's explode peak) |
| running, Real, steady | 251 / 1.56 M (blurred copies, no shadow pass) |
| running, Real, a shadow-refresh frame (≤ 2 Hz while the rock changes) | ~380 / 2.08 M |

**Gates:** typecheck, build (the worklet is its own 8 KB chunk; no dev API in the bundle),
clash sweeps above, review shots below.

**Screenshots (docs/review/f40-phase8/):** 8b-01…04 assembled, X-ray, at crank 0 / 90 / 180 /
270°; 8b-05…08 fully exploded at the same angles (rods with their pistons, guide lines to the
pins, open pan); 8b-09…12 Strokes on cylinder 1 in power (spark), exhaust (exhaust valves
lit), intake (intake valves lit), compression; 8b-13 X-ray flashes at 3000 rpm; 8b-14 the
start: pinion in mesh with the ring gear; 8b-15 / 16 Real at idle and at 7000 rpm (blur);
8b-16 also shows the turbine housing's heat glow.

### 8C: procedural engine sound
**Built:** an AudioWorklet synth (`engine/audio/synth.ts`, voicing in `config/sound.ts`, no
samples) with its own per-sample crank-angle integrator, driven by the sim through AudioParams.
Voices: an exhaust pulse per cylinder at its exhaust opening, each bank into its own manifold
(two sets of resonances), leaning to its own side of the stereo image; turbine muffling that
darkens with boost, silencer, and the wastegates' brighter centre outlet near peak boost;
induction; turbo whistle on a spool-lagged turbo speed; lift-off flutter; limiter cuts (the
sim's fuel cuts); valvetrain ticks and belt whine; starter whine with compression pulses and
the pinion's knock. In the worklet: DC block, compressor, soft limiter (ceiling −1.4 dBFS);
after it only the volume (mute, the hidden-tab duck). The context is created by the first
Start click (nothing loads before), and suspended when the engine is off.

**Offline renders** (`__dev.renderAudio(names?, save?)`: OfflineAudioContext with the same
worklet, driven by the same sim along a script; 48 kHz stereo, at full volume, the worst case).
WAV and spectrogram per clip in `docs/review/f40-phase8/audio/` (git-ignored). Listen first:

1. `rev-2000-7750.wav`: full throttle from 2000 rpm to the limiter, two seconds on it, then lift
   (whistle rising, cuts, flutter) — the one that shows the most.
2. `liftoff-7000.wav`: lift at 7000 on full boost: the flutter.
3. `start.wav`: knock, cranking, catch, flare, idle.
4. `idle.wav`, then `steady-3000 / 5000 / 7000.wav`: the flat-plane bark at steady speeds.
5. `limiter.wav`: held on the limiter.

| clip | peak dBFS | level dB(A) | firing peak (rpm/60 × 4) | bank (rpm/60 × 2): left ch. / L−R / mono | other |
| --- | --- | --- | --- | --- | --- |
| idle 1000 | −22.7 | −47.9 | 66.7 Hz, +43 dB | 33.3 Hz: +46 / +48 / +13 | |
| 3000, 30 % | −15.1 | −36.6 | 200 Hz, +53 dB | 100 Hz: +51 / +55 / +36 | |
| 5000, 60 % | −10.2 | −27.7 | 333 Hz, +55 dB | 167 Hz: +50 / +57 / +37 | |
| 7000, 100 % | −4.8 | −20.3 | 467 Hz, +54 dB | 233 Hz: +48 / +57 / +35 | |
| rev 2000→7750 | −5.3 | | (spectrogram: firing line tracks rpm) | | |
| lift-off 7000 | −4.8 | | | | flutter at 20.0 Hz (+27 dB) |
| limiter | −4.9 | | | | 4.4 dips / s = the sim's 4.4 cuts / s |
| start | −10.9 | | | | cranking pulses at 13.3 Hz (200 rpm × 4 / 60) |

Peaks are measured to the side (dB above the median within 0.6–1.4 × f). The bank frequency
stands out in each channel and in L−R but is 10–35 dB weaker in the mono sum: the banks'
pulses interleave, so each bank alone is a four-cylinder (the flat-plane signature).
**Every clip:** peak below −1 dBFS (loudest −4.8), no NaN, **no clicks** (high-frequency
frames 12× the clip's median and 4× their neighbours), sample steps at the 128-sample render
boundaries the same as elsewhere (ratio 0.95–1.04). Found and fixed on the way: one-sided
pulses' rumble, a drone from the fixed-pitch thump, two resonators driven ~35 dB too hard,
step clicks from the suction tail and the starter's labour envelope, filter coefficients
stepping on block edges (now every 16 samples), induction masking the limiter's cuts, the
starter whine sweeping up with the flare.

**Live** (real clicks and keys in the review browser): nothing created on load; Start creates
a running 48 kHz context with the synth; Space opens the throttle (6300 rpm, 0.82 bar in 2.5 s);
mute and unmute take the output to 0 and back; Stop suspends the context once the engine is
off. Not tested here: the hidden-tab duck (Playwright cannot hide the tab), and anything heard
(no speakers): the voicing is by numbers and spectrograms only.

### 8D-1: mobile layout, a freer camera, heat glow
**Built:** phone-first controls in three layouts (`state/ui.ts`): desktop, one slim bar (Explode,
X-ray, Stop, a small tach and boost, Throttle, "more" with display speed, cylinder, volume and the
driving-controls switch in a card above); portrait phone, one compact bottom bar (while driving:
more, Stop, Throttle; gauges at the top centre; Explode, X-ray and the rest in a bottom sheet);
landscape phone, the driving layout (throttle under the right thumb, gauges small at the top
centre, a small row at the bottom centre). Camera buttons top-left on every layout (reset, view
chips). Hold-buttons for real thumbs; no key hints on touch-only devices; safe-area insets and
dvh; one-line credits on phones (tap for the full credit). Framing in the space the UI leaves
(measured from the page), re-framed on rotate / resize. Quality tiers (phones start at medium,
an automatic drop that never climbs back), Real only at the top tier. Phone audio: the audio
session set to playback where supported, else a one-time silent-switch hint; the context resumes
when the page comes back. Camera: zoom to the cursor / pinch midpoint, double-click / double-tap
re-centres the orbit on that point, pan (right-drag, Shift+drag, two fingers), orbit down to
just above the ground, looser preset and explode framing, lighter damping and a flick's
inertia, automatic moves stop the moment the user takes over. Heat glow: a blackbody ramp on the
exhaust, strongest at the ports, cherry at the turbine housings, fading down the downpipes.
Decisions in docs/BRIEF.md ("8D-1").

**Gates**
- Typecheck and build: pass; production bundle contains no dev API.
- Clash: assembled vs body **none**; full explode **none** (no geometry changed).
- **Perf, desktop 1440×900 (top tier), unchanged from 8B:** idle 251 calls / 0.78 M triangles;
  peak (shadow frame) 412 / 1.44 M; running assembled ≤ 412 / 1.44 M; running exploded ≤ 400 /
  1.40 M. The tiers change pixels, not draw calls.
- **Phones (emulated in the review browser):** iPhone 13 (DPR 3) and Pixel 7 (DPR 2.625) start
  at the medium tier: DPR 1.5, AO low, 1024 shadow map, 512 contact shadows. Unpinned, the Pixel 7
  run dropped once to low (DPR 1, AO off) after ~8 s on a 30.8 ms median frame and stayed there;
  this browser's frame rate says nothing about a phone's. Real is not offered on either.
- **Touch gestures (CDP `Input.dispatchTouchEvent`, iPhone 13 portrait):**
  - pinch-zoom at a point 85 px left of centre: distance 17.6 → 9.9 m, the point under the
    fingers moved 8 px (a plain dolly would have pushed it ~150 px out);
  - two-finger pan: the pivot moved 0.82 m, distance 9.89 → 9.83 m;
  - double-tap on the front clam and on a front wheel: the pivot landed on the tapped point
    (0 mm), the point came to the centre column, nothing was selected;
  - single tap: selects after the 300 ms double-tap window;
  - hold-throttle: pressed on touch, still pressed after a 6 px wobble, released when the
    finger slid 120 px off, pressed again when it slid back, released on lift; no text
    selection, no page scroll.
- **Mouse (desktop):** wheel zoom toward the cursor: 6.3 → 1.85 m with the point under the
  cursor held to 2 px; Shift+drag pans at constant distance; double-click focuses (0 mm, no
  selection); orbit down to 104° from vertical, camera above the ground.
- **Heat glow (exploded, close on the left turbo and manifold):** idle none; heavy part load
  (heat 0.45) a dull red on the turbine housing and the primaries; full (heat 1.0) orange-red at
  the ports, cherry over the collector and turbine housing, fading down the downpipes, the
  metal's tint and highlights still showing.

**Screenshots (docs/review/f40-phase8/):** `8d1-desktop-*` (off assembled; running, engine view;
running with "more"; running exploded; off exploded with the view chips), `8d1-iphone13-portrait-*`
and `8d1-iphone13-landscape-*` (off assembled, running in the engine view, running with the
sheet, running exploded, running exploded with the turbo inspected, off exploded),
`8d1-pixel7-portrait-*` (off assembled, running engine view, running exploded, off exploded);
heat glow `wip-8d-glow-explode-idle / -half / -full`.

**Needs a real phone (not verifiable in emulation):** the frame rate and where the automatic
tier settles; the iOS silent switch with and without `navigator.audioSession`, and resuming after
a call or app switch; notch and home-indicator insets (the emulator draws none); dvh against
Safari's collapsing bars; two thumbs at once on real glass; Safari's handling of
`touch-action` / long-press callout on the hold-buttons.

### 8D-2: gears and the rolling road

The car stays on its stand; the rear wheels turn with road speed, the fronts don't. The sim
(`engine/sim.ts`, figures in `DRIVE` in `config/engine-sim.ts`) adds a 5-speed box with R, an
automatic clutch, brakes and the car's speed. In gear the engine is tied to the road; shifts
cut the torque or blip; over-rev downshifts and R while rolling are refused (the gear flashes).
Inside the box the input and transfer gears, every constant-mesh pair, three sleeves on the
secondary shaft, their forks (new part "Selector forks"), the pinion, a toothed crown wheel,
both driveshafts and the rear wheels and discs turn at their ratios; the cabin lever (split from
the model) moves through the gate. New sounds: dog clunk, gearbox whine, rolling-road roar.
Decisions in docs/BRIEF.md ("8D-2").

**Measured (headless, `node --import ./scripts/ts-hooks.mjs scripts/dev/drive-test.mjs`)**
- **0–100 km/h 4.01 s** (target 4 ± 0.5), upshifts at 7700 rpm: 1→2 at 101.3 km/h, 2→3 at
  156.8, 3→4 at 216.3, 4→5 at 285.1. 0–60 2.35 s, 0–160 7.83, 0–200 10.88, 0–250 17.34,
  0–300 32.2.
- **Top speed 324.3 km/h at 7006 rpm in 5th** (target 324 ± 5).
- Coasting in 5th from 324 to 100 km/h off throttle: 48.1 s. Braking 100 → 0: 2.65 s, then the
  engine idles at 1007 rpm in N.
- Pulling away in 1st (clutch locks at): 30 % throttle 5.0 s / 13 km/h; 50 % 1.9 s / 13 km/h;
  75 % 1.9 s / 34 km/h; flat out 1.7 s / 44 km/h at 3410 rpm. Slip peaks at 2400–3410 rpm.
- A double press (4th, two downshifts at 120 km/h): 4→3 at 0.20 s (4260 rpm), 3→2 at 0.40 s
  (5860 rpm).

**Gates**
- Typecheck and build: pass; the production bundle contains no dev API.
- **Clash, standard: assembled vs body none; full explode none** (engine off, and in 3rd at
  110 km/h).
- **Clash, moving gearbox:** 28 poses (N, R, 1…5 at two crank angles; assembled and fully
  exploded) of gear clusters, selector forks, LSD, driveshafts, rear wheels and discs against
  everything: **no undeclared overlap between parts.** Inside a part, overlaps are by design:
  meshing teeth (pitch radii × 1.02), shafts through the gears' bores, the rail through the fork
  hubs. The rear disc touches its wheel at the hub (the model's own contact; they turn together).
  The LSD's side bosses through the casing are now a declared contact.
- **Clash, lever through the gate:** 39 poses (the cross gate at 9 points, each plane at 10
  throws, and each gear): clear in N, 1…5 and everywhere along their paths; **in R and on the
  way to it the stick grazes the inner edge of the left slot's rear half by up to ~1.5 mm**
  (the model narrows that half to ~9.5 mm, a lockout tab, against its own ~11.4 mm stick).
- **Perf, desktop 1440×900 (top tier):** idle 255 calls / 0.81 M triangles (8D-1: 251 / 0.78);
  running in 4th at 180 km/h, assembled, 406–419 / ≤ 1.47 M (shadows refresh every frame now:
  the rear wheels turn); running exploded 320–407 / ≤ 1.42 M. Budget ~500 / 1.5 M. New draw
  calls: the rail, the forks, the sleeves, the lever.
- **Phones (emulated):** iPhone 13 and Pixel 7 start at medium (DPR 1.5); the landscape iPhone
  run dropped to low (DPR 1) on a 144 ms median frame in this browser, as expected. Portrait
  bar: five keys of 44–50 px plus the throttle (110 / 130 px), no horizontal scroll at 390 or
  412 px; tapping 4th in the sheet's gate selects it.
- Real mode in gear at speed, assembled and exploded: no errors.

**Audio** (docs/review/f40-phase8/audio/, WAV + spectrogram; the spectrograms now draw the
whine line and the gears along the top). Listen first to **run-1-5** and **downshift-blip**.
- `run-1-5` (30 s): full throttle from rest, 1st to 5th. Peak −6.0 dBFS, no clicks or NaN.
  Shifts logged at 4.86 / 8.03 / 13.22 / 25.58 s; 100 km/h at 4.61 s from the clip's start
  (throttle at 0.6 s: 4.01 s).
- `downshift-blip` (7 s): off throttle in 4th at 150 km/h, braking, then 4→3 (3800 rpm) and
  3→2 (5030 rpm), each blipped. Peak −9.5 dBFS.
- `pullaway-slip` (6 s): half throttle from rest in 1st; slip 0.8–2.7 s up to 2670 rpm, then
  locked. Peak −14.7 dBFS.
- `refused-downshift` (7 s): 3rd at 180 km/h, 3→2 refused at 1.0 s (would reach ~8800 rpm),
  braking, then 3→2 accepted with a blip at 4.8 s (105 km/h, 5180 rpm). Peak −9.8 dBFS.
- The 8C clips re-rendered unchanged: lift-off flutter 20 Hz, limiter 4.4 cuts / s, cranking
  13.3 Hz.
- The whine is deliberately faint (estimated ~20 dB under the engine at full load, not measured
  on its own); tune by ear
  (`SOUND.gearbox`, `SOUND.road`, `SOUND.clunk`).

**Screenshots** (docs/review/f40-phase8/)
- Desktop: `8d2-desktop-xray-gearbox-{N,1,5}` (transmission parts only, X-ray: sleeve
  positions), `8d2-desktop-lever-{1,3,5}` (interior and lever only), `8d2-desktop-exploded-running-3rd`.
- Phone landscape (iPhone 13): `8d2-landscape-xray-gearbox-{N,1,5}`,
  `8d2-landscape-lever-{1,3,5}`, `8d2-landscape-exploded-running-3rd`,
  `8d2-phone-landscape-driving` (thumb layout).
- Phone portrait: `8d2-phone-portrait-{driving,sheet}` (iPhone 13), `8d2-phone-pixel7-{driving,sheet}`.

**Needs a real phone** (owner, after merging)
- The thumb layout under real thumbs: throttle and brake held together, − / + reached without
  letting go; that a hold survives a shift tap with the other thumb.
- Haptics on Android (shift tick, limiter, refused double tick).
- Whether the whine and road roar are audible on phone speakers, and whether the clunk is.
- Frame rate with the rear wheels turning (shadows refresh every frame while the car rolls).

## Phases 2–4 (`wip/f40-build`, merged)


Branch `wip/f40-build` from `main`, one checkpoint commit per phase, not pushed. Built
unattended after the owner approved the plan (decisions: docs/BRIEF.md, 2026-11-13).
Screenshots are local and git-ignored, in `docs/review/f40-phase2/` … `f40-phase4/`
(1440×900, GPU, one persistent page driven through `window.__dev`; the FPS meter reads
~1–2 because the review browser renders slowly on this machine).

## Summary (unattended run, phases 2–4)
**Built:** phase 2, intake, ignition and ancillaries (16 parts); phase 3, turbos,
intercoolers and exhaust (17); phase 4, the 5-speed manual transaxle with its twin-plate
clutch, driveshafts and shift linkage (14). One checkpoint commit per phase on
`wip/f40-build`; not pushed, `main` untouched.

**Figures**

| after | scene triangles | meshes | idle calls / triangles | peak calls / triangles |
| --- | --- | --- | --- | --- |
| phase 1 | 0.46 M | – | 150 / 0.46 M | 255 / 0.80 M |
| phase 2 | 0.54 M | 172 | 191 / 0.54 M | 318 / 0.95 M |
| phase 3 | 0.68 M | 229 | 248 / 0.69 M | 415 / 1.21 M |
| phase 4 | 0.76 M | 262 | 281 / 0.76 M | 471 / 1.36 M |

Budget ~500 draw calls / ~1.5 M triangles at peak. Clash checks clean at every phase:
assembled, fully exploded, and through the mid-explode sweeps (details per phase below).
The explode now runs ~4.9 s (stage starts 0 / 0.75 / 1.70 / 2.50 / 3.75 s).

**Decisions made unattended:** all logged in docs/BRIEF.md under "Decisions made unattended
(review)". The ones most worth a look:
1. Tailpipes recessed ~0.13 m in the rear valance's oval mouth (the mouth's floor is part of
   the rear clam and swings up as it opens).
2. Rear-clam hinge lowered to car y 0.32, so its tail swings up and back, away from the
   exhaust.
3. Exhaust explode moves changed from the plan (straight pulls instead of swings; silencer
   down, wastegate pipe up) so each one clears its neighbours.
4. Timeline re-timed: the powertrain's slide waits 0.25 s for the driveshafts, and stage 5
   starts just before the crank drops.
5. Two silencer cans (plan: one box), no balance pipe.
6. Oil tank on the right (est), moving out after the right manifold.
7. Shift linkage stays with the car (plan: drops in stage 5); the gated lever is the model's.
8. Clutch as five parts so it fans out; bellhousing open at the front.
9. More of the model's stand-in rear hidden: upper frame, suspension, tail crossmember,
   gearbox mounts.

**Blocked:** none.

**Not done / known:** no turbo and intercooler polish beyond the phase-3 trim (the run ran
out of time first; phase 5 not started, as asked). Estimated positions remain estimates:
oil tank, distributors, turbo inlet filters, gearbox internals (docs/reference/f40/ is
empty). Draw calls at 471 of ~500 at peak: phase 5 (chassis, suspension, brakes, ≈30 parts)
will need instancing or merging to stay in budget. The model's stand-in lower frame rails
are still visible and still constrain where parts can go.

**What's next:**
1. Review the screenshots in docs/review/f40-phase2/ … f40-phase4/ and the unattended
   decisions in the BRIEF.
2. Push `wip/f40-build` and merge, or ask for changes.
3. Phase 5 (spaceframe, suspension, brakes) replaces the stand-in's remaining frame; budget
   draw calls first.

## Phase 4: 5-speed manual transaxle
**Built (14 parts):** `transaxle` (virtual assembly); flywheel (starter ring gear, crank
bolts); twin-plate clutch as four parts (front disc, intermediate plate, rear disc,
pressure plate with diaphragm-spring cover); bellhousing (open front, bolting flange);
gearbox casing (lofted, stiffening rings, X-ribs, seam and end-cover bolts, selector on the
right front); gear clusters (input shaft, transfer gears, primary and secondary shafts,
5 + reverse pairs, pinion; hidden inside); limited-slip differential (side bosses and output
flanges on the axle line, crown wheel); gearbox oil cooler (left, finned, two hoses);
driveshafts ×2 (CV joints, boots, stub axles); gearshift linkage (rod, guide bushes, ball
joint). Stage 5: the transaxle slides back 0.5, the oil cooler comes off, then the flywheel
and the four clutch parts fan out behind the block (0.04, 0.10, 0.16, 0.22, 0.28).

**Gates**
- Typecheck and build: pass.
- Clash check: assembled vs body **none**; full explode **none**; assembled, ours against
  ours (info): only the designed joins inside the transaxle (bellhousing on the casing, the
  input shaft through the casing's front, the diff bosses in the casing wall).
- Mid-explode sweep over the whole re-timed timeline, every phase 2–4 part in focus (and
  the rear clam and wing), at t = 0.2, 0.45, 0.7, 0.9, 1.05, 1.2, 1.35, 1.5, 1.65, 1.8, 2.0,
  2.2, 2.4, 2.6 … 3.3 (every 0.1), 3.45, 3.6, 3.75, 3.85, 3.95, 4.1, 4.25, 4.4, 4.55, 4.7,
  4.85 s: **none**, after the last fix below (the shift rod's ball joint, re-swept at 1.2–1.95 s).
- What the sweeps caught and how it was fixed:
  - the gearbox sliding back into the exploded silencer and wastegate pipe (the silencer
    now drops 0.45, the wastegate pipe lifts 0.32);
  - the stand-in's gearbox mounts inside the casing (hidden, cut along a region) and two of
    its struts against the oil cooler (cooler moved);
  - the driveshafts against the exhaust collectors as the powertrain slides back (slide
    delayed 0.25 s);
  - the shift rod against the oil feed hose during the slide (lever points down, the rod
    passes under the hose);
  - the crank's rear flange dropping through the bellhousing's mouth (stage 5 starts
    before the crank drops);
  - the bellhousing's front against the crank flange and the left head gasket, and its
    taper against the clutch cover (open front, round shoulders, full-size round the clutch).

**Performance:** scene 0.76 M triangles, 262 meshes. Idle 281 draw calls / 0.76 M
triangles (assembled and exploded), 271 / 0.75 M in the Lexan view; peak with the shadow
pass live 471 / 1.36 M (budget ~500 / ~1.5 M). Draw calls are now the tighter limit.

**Screenshots (docs/review/f40-phase4/):** 01-transaxle-xray (in the car, X-ray),
02-transmission-solo (transmission group solo, assembled), 03-clutch-fan (end of stage 5:
flywheel, discs and plates fanned between the block and the bellhousing),
04-stage5-mid (t = 4.25 s), 05-exploded-rear34.

## Phase 3: turbos, intercoolers, exhaust
**Built (17 parts):** exhaust manifolds ×2 (4-into-1, port flanges, heat tint);
IHI turbochargers ×2 (cast-iron turbine volute, aluminium compressor, centre housing);
turbo heat shields ×2; wastegates ×2 (red diaphragm cans, on the collectors); Behr
intercoolers ×2 (instanced fins and tubes); charge pipes ×2 (compressor → intercooler →
throttle body, silicone couplers and clamps); turbo inlets ×2 (pod filters, ribbed ducts);
downpipes ×2 (slip joints); wastegate pipe (2-into-1 to the centre tip); silencer (two
cans); tailpipes (three, in the rear valance's oval mouth). Also: pipes now leave and enter
their fittings square (straight end runs), the oil tank's explode and hoses were reworked
round the right manifold, the rear-clam hinge moved down, and more of the stand-in rear
was hidden (see the BRIEF's unattended decisions).

**Gates**
- Typecheck and build: pass.
- Clash check: assembled vs body **none**; full explode **none**; assembled, ours against
  ours (info, focus on the new parts): **none** (every joint is a butt joint with a gap).
- Mid-explode sweeps (focus on the new parts and everything they move past) at t = 0.2,
  0.45, 0.7, 0.95, 1.2, 1.45, 1.7, 2.0, 2.3, 2.4 … 3.3 (every 0.1), 3.45, 3.6, 3.75, 3.9,
  4.05 s: **none**; after the tailpipe fix, the rear clam, silencer, tailpipes, wastegate
  pipe and downpipes again at t = 0.1, 0.2, 0.3, 0.45, 0.6, 0.8, 1.0, 1.2, 1.6, 2.0, 2.45, 2.6, 2.75,
  2.9, 3.05, 3.2 s: **none** (and the turbo/charge-pipe/oil-line sweep after trimming).
- What the sweeps caught and how it was fixed: the rear clam's tail swinging forward
  through the silencer (hinge lowered); the manifolds' swing driving the collectors into
  the turbos and the oil hoses (straight pull-off along the port axis); the turbos and
  downpipes against each other (straight-out moves, downpipe re-routed with a sweeping
  bend); throttle bodies against the charge pipes (straight up); the alternator against the
  left manifold (forward); the oil tank and its hoses against the right manifold, the HT
  leads and the distributor (re-timed between the manifold and the head, see the BRIEF);
  the wastegate pipe against the silencer's balance pipe (removed).
- **Found in review, not by the checks:** the first tailpipes sat behind the bumper,
  invisible from behind (they were declared in contact with the rear clam, which hid it).
  Now in the valance's oval mouth, no declared contact.

**Performance:** scene 0.68 M triangles, 229 meshes. Idle 248 draw calls / 0.69 M
triangles (assembled and exploded), 238 / 0.67 M in the Lexan view; peak with the shadow
pass live 415 / 1.21 M (budget ~500 / ~1.5 M). (Phase 2: 191 / 0.54 M idle, 318 / 0.95 M
peak.) Trimmed before committing, 0.79 → 0.68 M: intercooler fins and filter pleats as
plain boxes, fewer segments along the primaries, volutes, charge pipes and inlet ducts.

**Screenshots (docs/review/f40-phase3/):** 01-lexan (the judging shot: intercoolers,
plenum and red cam covers through the Lexan), 02-turbos-closeup (left turbo on the lifted
powertrain), 03-tailpipes-rear, 04-assembled-rear34, 05-teardown (t = 2.6 s),
06-exploded-rear34.

## Phase 2: intake, ignition, ancillaries
**Built (16 parts):** intake plenum (red crackle, ribbed top, cast base flange with bolts,
throttle-body bosses); intake runners ×2 (four per bank, port flanges and bolts, injector
bosses); throttle bodies (two, linked cross-shaft); fuel rails ×2 (injectors, pressure
regulator); injector looms ×2 (clips); distributors ×2 (on the intake cams, caps with
towers, vacuum units); HT leads ×2 (four per bank, re-curving); alternator; dry-sump oil tank
(finned, filler, bracket); oil lines (two braided hoses, anodised fittings); ECUs ×2 (bay
walls). Also: the rear wing rides the rear clam; solo frames only what is visible; the
cable system takes several cables per part (one mesh).

**Gates**
- Typecheck and build: pass.
- Clash check: assembled vs body **none**; full explode **none**. Mid-explode sweeps
  (focus on the new parts) at t = 0.9, 1.2, 1.5, 1.7, 1.9, 2.1, 2.35, 2.5, 2.65, 2.8, 2.95,
  3.1, 3.3, 3.5, 3.8, 4.1 s: **none** apart from the injectors seated in their runner bosses
  until they back out (separated by 2.8 s, before the runners lift; now a declared contact).
  The sweeps found three real problems, fixed: the oil tank and HT leads rising through the
  stand-in's crossmember over the axle (stand-in upper rear frame hidden, see the BRIEF), the
  injector loom's tail clipping the roof edge on the lift (shortened), and the right HT
  leads bowing outboard into the oil tank (slack now upward; tank explodes out and down).
- Assembled, ours against ours (info): only designed touches (flanges on ports, runners into
  the plenum, injectors into bosses, distributors on the heads, alternator ears on the block,
  throttle bodies on the plenum).

**Performance:** scene 0.54 M triangles, 172 meshes. Idle 191 draw calls / 0.54 M triangles
(assembled, Lexan view, exploded alike); peak with the shadow pass live 318 / 0.95 M.
(Phase 1: 150 / 0.46 M idle, 255 / 0.80 M peak.)

**Screenshots (docs/review/f40-phase2/):** 01-lexan, 02-assembled-rear34,
03-intake-closeup (engine solo), 04-teardown-intake (t = 2.95 s, engine solo),
05-exploded-engine-solo, 06-exploded-rear34.

## Phase 1: reset to the F40 + body integration (approved and merged)

Branch `wip/f40-phase1`, not pushed. Screenshots are local and git-ignored, in
`docs/review/f40-phase1/` (1440×900, GPU, taken through one persistent page with
`window.__dev`; the FPS meter in the corner is dev-only and reads ~1 because the review
browser renders slowly here).

### What was done
1. **Docs reset.** New docs/BRIEF.md (workflow, rules and architecture kept; F40 spec,
   model-vs-reference table and a fresh decision log), docs/HANDOFF.md, this file, and the
   build plan docs/F40-PLAN.md. LaFerrari BRIEF, HANDOFF, REVIEW, M2-PLAN, body report and
   layout figures moved to docs/archive/laferrari/.
2. **LaFerrari content removed.** Body model + licence file, body rules, the hybrid system
   (battery, inverters, e-motors, HV cables), the LaFerrari-specific powertrain layouts (V12
   intake, 6-into-1 exhaust, DCT transaxle, side-pod hoses), info copy and credits. Kept the
   shared framework (registry, renderer, explode timeline, clash check, inspect + isolation,
   X-ray, cable system, realism setup, prep pipeline, deploy workflow).
3. **Parametric engine.** Cylinders, bank angle, bore, stroke, rod, crank type
   (flat-plane / cross-plane), firing order + numbering, spacing, bank offset, cam drive
   (belt / chain), ignition (distributor / coil-on-plug) and all head/valve/block sizes from
   dims.ts. The firing angles are solved from the engine-wide firing order and the crank and
   bank geometry. Configured as the F120A: 90° V8, 82 × 69.5 mm → **2936.2 cc** (ref 2936),
   flat-plane crank (4 throws 0/180/180/0°, 5 mains), firing order 1-5-3-7-4-8-2-6, one cam
   belt per bank, distributor ignition (plug caps).
4. **Deploy base `/FerrariF40/`** (Vite base for build and preview, workflow comment).
   Verified with `vite preview`: index, model, HDRI and licence all 200 under /FerrariF40/.
5. **Body model integrated**: "Ferrari f40" by Black Snow, CC BY 4.0, credited with licence
   link and "modified" in the UI and public/models/LICENSE.md, plus the fan-project
   disclaimer; root LICENSE updated (same wording as the LaFerrari repo).
6. **Prep with F40 rules.** Orientation verified (source Z-up, −Y forward; root matrix turns
   it). One uniform scale ×0.97145 to the 2450 mm wheelbase; ground y 0; wheelbase centred.
   Segmented spatially into front clam, rear clam (incl. the Lexan cover), wing, doors,
   glass, cockpit, roof/pillars/sills, floor & diffuser, wheels, discs; welded panels are cut
   exactly along the region boundary (clean lines, not triangle saw-teeth). The model's
   stand-in engine (F40_Mechanics.001) and stand-in powertrain are the key-B ghost.
7. **Measured** the bays and wheel centres; values within 3 cm of the reference adopted,
   others logged (BRIEF: length −31, rear track −47 mm not adopted).
8. **Plan** docs/F40-PLAN.md with layout figures docs/f40-layout-1/2.svg.

### Gates
- `npm run typecheck`, `npm run build`: pass (bundle > 500 kB warning, as before).
- Clash check (C): assembled vs body **none**; exploded overlaps **none**; mid-explode
  sweeps against the body and stand-in chassis at t = 1.3, 1.6, 1.75, 1.9, 2.1, 2.3, 2.6 s:
  **none** (this caught the powertrain lifting through the roof's trailing edge and then the
  frame crossmember; fixed by the 0.3 m back-slide).
- Layout sketch: every planned envelope clears the fixed bodywork and wheels (declared
  contacts only: tailpipes through the grille, frame and shift linkage through the bulkhead,
  calipers on their discs, front suspension through the wheelhouse liners).
- Production bundle contains no dev API (grep of dist/assets).

### Performance
Scene 452 k triangles, 131 meshes. Idle: 150 draw calls / 0.46 M triangles (assembled,
exploded and the Lexan view alike). Peak (shadow pass live): 255 calls / 0.80 M. Budget
< 500 calls, < 1.5 M triangles.

### Screenshots (docs/review/f40-phase1/)
- 01-assembled-front34, 02-assembled-rear34 — assembled.
- 03-engine-through-lexan — the V8 seen through the louvred Lexan from above the tail.
- 04-reveal-1s — the hero: the rear clam open about its tail hinge at t = 1.0 s.
- 05-exploded-rear34, 06-exploded-front34 — full explode.
- 07-ghost-keyB-xray, 08-ghost-keyB-side — the model's stand-in powertrain (key B ghost,
  cyan) around our V8, with X-ray.
- 09-segments-side, 10-segments-rear34 — segment colours (key K).
- Layout figures: docs/f40-layout-1.svg, docs/f40-layout-2.svg.
- Benchmark frames: docs/review/bench/ (MCP route).

### Known, for later phases
- The stand-in frame, suspension and radiator (`model-chassis`) are visible until replaced.
- The rear wing at full explode lies low behind the opened clam (it is at the hinge end).
- Through the Lexan from behind, the pane's reflection greys the right cam cover.
- The model has no calipers and plain discs (procedural ones in phase 5).

### Blocked
None. The MCP tools themselves load at the next session start; this session used an
equivalent persistent Playwright page and drove the real MCP server over stdio for the
benchmark and the GPU check.

### What to do next
1. Review docs/F40-PLAN.md (decisions 1–10, open questions) and the screenshots.
2. Restart the Claude Code session so the `playwright` MCP tools load.
3. Phase 2 on a new branch.
