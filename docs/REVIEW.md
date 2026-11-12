# Phase 1 review: reset to the F40 + body integration (`wip/f40-phase1`)

Branch `wip/f40-phase1`, not pushed. Screenshots are local and git-ignored, in
`docs/review/f40-phase1/` (1440×900, GPU, taken through one persistent page with
`window.__dev`; the FPS meter in the corner is dev-only and reads ~1 because the review
browser renders slowly here).

## What was done
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

## Gates
- `npm run typecheck`, `npm run build`: pass (bundle > 500 kB warning, as before).
- Clash check (C): assembled vs body **none**; exploded overlaps **none**; mid-explode
  sweeps against the body and stand-in chassis at t = 1.3, 1.6, 1.75, 1.9, 2.1, 2.3, 2.6 s:
  **none** (this caught the powertrain lifting through the roof's trailing edge and then the
  frame crossmember; fixed by the 0.3 m back-slide).
- Layout sketch: every planned envelope clears the fixed bodywork and wheels (declared
  contacts only: tailpipes through the grille, frame and shift linkage through the bulkhead,
  calipers on their discs, front suspension through the wheelhouse liners).
- Production bundle contains no dev API (grep of dist/assets).

## Performance
Scene 452 k triangles, 131 meshes. Idle: 150 draw calls / 0.46 M triangles (assembled,
exploded and the Lexan view alike). Peak (shadow pass live): 255 calls / 0.80 M. Budget
< 500 calls, < 1.5 M triangles.

## Screenshots (docs/review/f40-phase1/)
- 01-assembled-front34, 02-assembled-rear34 — assembled.
- 03-engine-through-lexan — the V8 seen through the louvred Lexan from above the tail.
- 04-reveal-1s — the hero: the rear clam open about its tail hinge at t = 1.0 s.
- 05-exploded-rear34, 06-exploded-front34 — full explode.
- 07-ghost-keyB-xray, 08-ghost-keyB-side — the model's stand-in powertrain (key B ghost,
  cyan) around our V8, with X-ray.
- 09-segments-side, 10-segments-rear34 — segment colours (key K).
- Layout figures: docs/f40-layout-1.svg, docs/f40-layout-2.svg.
- Benchmark frames: docs/review/bench/ (MCP route).

## Known, for later phases
- The stand-in frame, suspension and radiator (`model-chassis`) are visible until replaced.
- The rear wing at full explode lies low behind the opened clam (it is at the hinge end).
- Through the Lexan from behind, the pane's reflection greys the right cam cover.
- The model has no calipers and plain discs (procedural ones in phase 5).

## Blocked
None. The MCP tools themselves load at the next session start; this session used an
equivalent persistent Playwright page and drove the real MCP server over stdio for the
benchmark and the GPU check.

## What to do next
1. Review docs/F40-PLAN.md (decisions 1–10, open questions) and the screenshots.
2. Restart the Claude Code session so the `playwright` MCP tools load.
3. Phase 2 on a new branch.
