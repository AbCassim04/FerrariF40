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

# Donor model licence (wheels, brakes, badges, gauge faces)

`donor.opt.glb` (9C) is adapted from:

- **Title:** Ferrari F40 | www.vecarz.com
- **Author:** Nic Cheung — https://sketchfab.com/heynic
- **Source:** https://sketchfab.com/3d-models/ferrari-f40-wwwvecarzcom-ee082e412b0a4b2090e8492117841e95
- **Licence:** CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/

The original download, unmodified, lives in the repository at
`assets-src/models/f40/donor-vecarz.glb` and is not part of the published site.

`donor.opt.glb` is **modified** by `scripts/prep-donor.mjs`: only the wheels (tyres, rims,
centre-lock nuts), brake discs and calipers, badges and instrument faces were kept; they
were rescaled uniformly to our wheelbase, moved onto our car (each wheel and brake corner
also scaled to the real tyre size about its wheel centre), and split by the body panel they
sit on; the tyres' metal / roughness map was replaced by matte rubber and a tread normal map
derived from the donor's own tread texture; textures were resized and re-encoded as WebP; and
meshes were meshopt-compressed. Only artwork that ships with the donor is used.

Independent fan project, not affiliated with or endorsed by Ferrari S.p.A. Ferrari and F40
are trademarks of Ferrari S.p.A.; the licences above cover the models, not those trademarks.
