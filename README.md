# Exploded Hypercar

An interactive 3D exploded view of a hybrid V12 hypercar in the browser: one click takes
the car apart, layer by layer, down to the pistons.

**Live:** https://abcassim04.github.io/LaFerrari/

![Demo](docs/demo.gif)

## How it works
- **Parts registry.** Every part is one entry in `src/parts/registry.ts`: its geometry,
  assembled position, explode stage and offset, and the copy for its info panel. All
  sizes live in one file (`src/config/dims.ts`), so nothing is a magic number.
- **Procedural V12.** The engine is generated in code from the real figures: 65° bank
  angle, 94 mm bore and 75.2 mm stroke (6262 cc). Crank throws, pistons at their real
  phases, heads, valvetrain, intake and exhaust are all built from those, not modelled
  by hand. The hybrid system, gearbox and cables are built the same way.
- **Staged GSAP explode.** One timeline in five stages (about 5 s): the body panels lift
  away, the wheels and suspension slide out, the powertrain rises out of the bay, the
  engine comes apart outside-in, and the hybrid parts separate. Click again to reverse
  it, even mid-way.
- **Clash checks.** A dev check tests real triangles (BVH-accelerated): every part against
  the body model when assembled, every pair of parts at full explode, and sweeps at
  chosen times mid-explode. Each part lists the contacts it's allowed.
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
- **Car body model:** ["2014 Ferrari LaFerrari"](https://sketchfab.com/3d-models/2014-ferrari-laferrari-8b46fa49718647de846387ef4c1e95b3)
  by [Ddiaz Design](https://sketchfab.com/ddiaz-design) (Sketchfab),
  [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/), modified
  (segmented into parts, rescaled, compressed). See `public/models/LICENSE.md`.
- **Studio lighting:** ["Studio Small 09"](https://polyhaven.com/a/studio_small_09) by
  Sergej Majboroda (Poly Haven), CC0.
- Independent fan project. Not affiliated with or endorsed by Ferrari S.p.A. Ferrari and
  LaFerrari are trademarks of Ferrari S.p.A.
- **Code:** all rights reserved, see [LICENSE](LICENSE).
