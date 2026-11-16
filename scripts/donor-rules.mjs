/**
 * 9C: what scripts/prep-donor.mjs takes from the donor model ("Ferrari F40 | www.vecarz.com",
 * Nic Cheung, CC BY 4.0) and where it goes. Donor names are its own node / material names.
 */
const inch = 0.0254;
const tyre = (widthMm, aspectPct, rimIn) => ({ widthMm, diameter: rimIn * inch + (2 * widthMm * aspectPct) / 100 / 1000 });

export const DONOR = {
  /** Our wheelbase (the body model is fitted to it, and so is the donor). */
  wheelbase: 2.45,
  wheels: {
    tyre: 'material_9',
    /** Material of each piece of a corner (the donor has one node per piece per corner). */
    roles: { tyre: 'material_9', rim: 'material', nut: 'Rim_-_Black_part', disc: 'material_21', caliper: 'material_22' },
    /**
     * Per axle: the DIMS tyre (17 in rims, 245/40 front, 335/35 rear) and our half track (the
     * body model's, which our hubs meet). The tyre stands on the ground.
     */
    target: {
      front: { ...tyre(245, 40, 17), centreX: 1.5656 / 2 },
      rear: { ...tyre(335, 35, 17), centreX: 1.5627 / 2 },
    },
  },
  /**
   * Accessories split into connected pieces; each piece goes to the panel under its centroid
   * (body-rules' `panelAt`) unless `panel` is given. Taken by material (`materials`) or by
   * donor node name (`nodes`). `offset` (m, per panel) moves the pieces
   * onto our surface where the donor's bodywork differs.
   */
  accessories: {
    // Badges: the "ferrari" lettering, shields, the Pininfarina plates, the F40 script.
    badges: { materials: ['material_1', 'material_17'] },
    // Instrument faces (the needles are ours, driven by the sim). The donor's gauge faces
    // sample their atlas upside down (no texture transform, unlike its badges' material, which
    // turns its atlas by 180°): their v is flipped back.
    // Its needles (small pieces all sampling one white texel of the atlas) are left out: ours
    // follow the sim.
    gauges: { materials: ['material_8', 'material_10'], panel: 'interior', flipV: true, skipPieces: { maxTris: 12, uv: [0.89, 0.558], within: 0.01 } },
    // Phase 9 fix-up: lamps with real lenses, by donor node. Rear (material_7, its lamp atlas):
    // the inner round tail / brake lamps (Object_146), the outer round amber indicator lamps
    // (Object_258) with their clear reversing-lamp centres (Object_260), and the rectangular
    // rear fog lamps in the bumper (Object_42). Front (material_14): the amber indicators under
    // the headlamp covers and the round side repeaters on the wings (Object_120). Both atlases
    // are sampled upside down like the gauges' (no texture transform): v is flipped back.
    // `offset`: the donor's lamps sit 6 mm further out and 2–4 mm lower than the body model's
    // (measured piece by piece, scripts/dev/lamp-pieces.mjs); moved onto ours, which are hidden.
    lamps: {
      nodes: ['Object_146', 'Object_258', 'Object_260', 'Object_42', 'Object_120'],
      flipV: true,
      offset: { 'rear-clam': [-0.002, 0.0035, 0.006], 'front-clam': [-0.0025, 0.002, -0.0055] },
    },
  },
  /** Tyres: the derived tread normal map's slope gain, and the rubber's roughness (est). */
  tread: { strength: 2.5, roughness: 0.9 },
  /** Materials whose textures are never seen close (512 px). */
  smallTextures: ['material_9', 'material_21', 'material_22', 'Rim_-_Black_part'],
};
