# Build review: phases 2–4 (`wip/f40-build`)

Branch `wip/f40-build` from `main`, one checkpoint commit per phase, not pushed. Built
unattended after the owner approved the plan (decisions: docs/BRIEF.md, 2026-11-13).
Screenshots are local and git-ignored, in `docs/review/f40-phase2/` … `f40-phase4/`
(1440×900, GPU, one persistent page driven through `window.__dev`; the FPS meter reads
~1–2 because the review browser renders slowly on this machine).

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
