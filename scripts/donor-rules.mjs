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
   * (body-rules' `panelAt`) unless `panel` is given. `offset` (m, per panel) moves the pieces
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
  },
  /** Tyres: the derived tread normal map's slope gain, and the rubber's roughness (est). */
  tread: { strength: 2.5, roughness: 0.9 },
  /** Materials whose textures are never seen close (512 px). */
  smallTextures: ['material_9', 'material_21', 'material_22', 'Rim_-_Black_part'],
};
