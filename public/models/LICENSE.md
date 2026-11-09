# Body model licence

`body.glb` and its adaptation `body.opt.glb`:

- **Title:** 2014 Ferrari LaFerrari
- **Author:** Ddiaz Design — https://sketchfab.com/ddiaz-design
- **Source:** https://sketchfab.com/3d-models/2014-ferrari-laferrari-8b46fa49718647de846387ef4c1e95b3
- **Licence:** CC BY-NC-SA 4.0 — https://creativecommons.org/licenses/by-nc-sa/4.0/

`body.glb` is the original download, unmodified. It lives in the repository at
`assets-src/models/body.glb` and is not part of the published site.

`body.opt.glb` is modified by `scripts/prep-body.mjs`: the unused skin was removed,
transforms baked and the model rescaled and recentred, geometry was re-segmented into
parts (the stand-in engine-bay geometry is kept but hidden), the engine-cover glass got
its own material, and meshes were joined and meshopt-compressed. It is shared under the
same licence (CC BY-NC-SA 4.0).

Non-commercial use only. Ferrari names and marks belong to their owner; the licence
above covers the model, not those trademarks.
