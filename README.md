# F40 Teardown

An interactive 3D exploded view of the Ferrari F40 in the browser: one click opens the rear
clam like the real car and takes the twin-turbo V8 apart, layer by layer, down to the pistons.

**Live:** https://abcassim04.github.io/FerrariF40/

## How it works
- **Parts registry.** Every part is one entry in `src/parts/registry.ts`: its geometry,
  assembled position, explode stage and offset, and the copy for its info panel. All sizes
  live in one file (`src/config/dims.ts`), so nothing is a magic number.
- **Parametric engine.** The engine is generated in code from its figures: cylinder count,
  bank angle, bore and stroke, crank layout (flat-plane or cross-plane), firing order, cam
  drive and head proportions. Here it is the F40's 90° V8, 82 × 69.5 mm (2936 cc), with a
  flat-plane crank firing 1-5-3-7-4-8-2-6; crank throws, pistons at their real phases, valve
  lifts and every part's position are derived from those numbers.
- **Staged GSAP explode.** One timeline in stages: the rear clam swings up about its tail
  hinge to reveal the engine, the panels come away, the wheels slide out, the powertrain
  rises out of the bay and the engine comes apart outside-in. Click again to reverse it, even
  mid-way.
- **Body pipeline.** A licensed body model is normalised to true scale and segmented into
  parts by rules (cutting welded panels exactly along their shut lines); free space in the
  engine bay is measured with BVH voxels.
- **Clash checks.** A dev check tests real triangles (BVH-accelerated): every part against
  the body when assembled, every pair of parts at full explode, and sweeps mid-explode.
- Click any part for an info panel; X-ray turns the body into ghost shells.

## Tech stack
- React 19, TypeScript, Vite
- three.js through React Three Fiber and drei
- GSAP (explode timeline), Zustand (state)
- three-mesh-bvh (picking and clash checks)
- postprocessing with N8AO (ambient occlusion), SMAA and ACES tone mapping
- glTF-Transform and meshoptimizer (body model preparation)
- GitHub Actions and GitHub Pages (deployment)

## Run locally
```
npm install
npm run dev      # http://127.0.0.1:5173/
npm run build
```

## Credits & licences
- **Car body model:** ["Ferrari f40"](https://sketchfab.com/3d-models/ferrari-f40-52a66c41cfcd4f999fb1b1c49bf24d70)
  by [Black Snow](https://sketchfab.com/BlackSnow02) (Sketchfab),
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), modified (segmented into
  parts, rescaled, compressed). See `public/models/LICENSE.md`.
- **Studio lighting:** ["Studio Small 09"](https://polyhaven.com/a/studio_small_09) by
  Sergej Majboroda (Poly Haven), CC0.
- Independent fan project. Not affiliated with or endorsed by Ferrari S.p.A. Ferrari and F40
  are trademarks of Ferrari S.p.A.
- **Code:** all rights reserved, see [LICENSE](LICENSE).
