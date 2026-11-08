import { DIMS, type Vec3 } from './dims';

/** Objects on this layer are seen by the main camera but skipped by contact shadows and picking. */
export const REFERENCE_LAYER = 1;

export const SCENE = {
  background: '#0b0c0f',
  camera: {
    fov: 35,
    near: 0.05,
    far: 200,
    /** Front-left three-quarter view (+X is the car's left). */
    position: [5.6, 2.1, 6.2] as Vec3,
    target: [0, DIMS.overall.height * 0.4, DIMS.body.centreZ] as Vec3,
  },
  controls: {
    /** Close enough to read valve springs and bolt heads on the exploded engine. */
    minDistance: 0.6,
    maxDistance: 20,
    /** Keep the camera just above the orbit target (and so above the ground). */
    maxPolarAngle: Math.PI / 2 - 0.04,
    smoothTime: 0.25,
    /** Fraction of the view kept clear around a fitted box (explode framing). */
    fitPadding: 0.12,
    /** Where panning may move the orbit target. */
    targetBounds: { min: [-6, 0.05, -7] as Vec3, max: [6, 4, 7] as Vec3 },
  },
  grid: { cellSize: 0.1, sectionSize: 1, fadeDistance: 28 },
  /** Camera presets: [position, target]. */
  views: {
    front34: { position: [5.6, 2.1, 6.2] as Vec3, target: [0, DIMS.overall.height * 0.4, DIMS.body.centreZ] as Vec3 },
    // A hair of z offset keeps the orbit basis defined when looking straight down.
    top: { position: [0, 9.5, 0.01] as Vec3, target: [0, 0, DIMS.body.centreZ] as Vec3 },
    engine: { position: [1.9, 2.9, 0.6] as Vec3, target: [0, 0.65, -1.2] as Vec3 },
    side: { position: [7.5, 0.9, 0] as Vec3, target: [0, 0.5, DIMS.body.centreZ] as Vec3 },
    rear34: { position: [-4.8, 2.4, -6.2] as Vec3, target: [0, 0.5, -0.4] as Vec3 },
  },
  contactShadows: { scale: 12, far: 2.5, blur: 2.2, opacity: 0.75, resolution: 1024 },
  /**
   * Showroom "display light" in the engine bay: a soft area light facing down over the
   * engine's footprint. It sits below the deck around the cover opening (so no light
   * spills onto the paint) and above the intake plenum. No visible source, no shadows.
   */
  bayLight: {
    colour: '#fff3e3',
    intensity: 5,
    position: [0, DIMS.body.engineCoverHinge[1] - 0.17, (DIMS.engine.frontZ + DIMS.engine.blockRearZ) / 2] as Vec3,
    size: [DIMS.engine.widthAcrossCovers, DIMS.engine.length] as const,
  },
} as const;

export type ViewName = keyof typeof SCENE.views;
