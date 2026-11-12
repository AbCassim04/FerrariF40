# Body model licence

`body.glb` and its adaptation `body.opt.glb`:

- **Title:** Ferrari f40
- **Author:** Black Snow — https://sketchfab.com/BlackSnow02
- **Source:** https://sketchfab.com/3d-models/ferrari-f40-52a66c41cfcd4f999fb1b1c49bf24d70
- **Licence:** CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/

`body.glb` is the original download, unmodified. It lives in the repository at
`assets-src/models/f40/body.glb` and is not part of the published site.

`body.opt.glb` is **modified** by `scripts/prep-body.mjs`: transforms were baked and the
model rescaled uniformly (wheelbase to 2450 mm) and recentred, the geometry was re-segmented
into parts (the stand-in engine and powertrain are kept but hidden), some materials were
retuned at load time (paint, glass, the Lexan cover), and meshes were joined and
meshopt-compressed.

Independent fan project, not affiliated with or endorsed by Ferrari S.p.A. Ferrari and F40
are trademarks of Ferrari S.p.A.; the licence above covers the model, not those trademarks.
