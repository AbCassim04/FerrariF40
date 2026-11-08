import { DIMS, type Vec3 } from './dims';

/** Objects on this layer are seen by the main camera but skipped by contact shadows and picking. */
export const REFERENCE_LAYER = 1;
/** Small detail (bolts, clips, springs): seen and picked, but left out of both shadow passes. */
export const DETAIL_LAYER = 2;
/** Render layer for the hover/inspect outline's mask (postprocessing's selection layer). */
export const OUTLINE_LAYER = 11;

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
    /** Screen aspect the views are composed for; narrower screens back the camera off, up to `narrowBackOff` times. */
    designAspect: 1.6,
    narrowBackOff: 2.4,
    /** Looser framing for an inspected part, so the panel doesn't crowd it. */
    inspectPadding: 0.3,
    /** Where panning may move the orbit target. */
    targetBounds: { min: [-6, 0.05, -7] as Vec3, max: [6, 4, 7] as Vec3 },
  },
  grid: { cellSize: 0.1, sectionSize: 1, fadeDistance: 28 },
  /** Camera presets: [position, target]. */
  views: {
    front34: { position: [5.6, 2.1, 6.2] as Vec3, target: [0, DIMS.overall.height * 0.4, DIMS.body.centreZ] as Vec3 },
    // A hair of z offset keeps the orbit basis defined when looking straight down.
    top: { position: [0, 9.5, 0.01] as Vec3, target: [0, 0, DIMS.body.centreZ] as Vec3 },
    /** Looking down through the engine-cover glass. */
    engine: { position: [0.75, 3.1, -0.45] as Vec3, target: [0, 0.6, -0.95] as Vec3 },
    side: { position: [7.5, 0.9, 0] as Vec3, target: [0, 0.5, DIMS.body.centreZ] as Vec3 },
    rear34: { position: [-4.8, 2.4, -6.2] as Vec3, target: [0, 0.5, -0.4] as Vec3 },
  },
  /** `far`: only things within this height of the ground cast contact shadows (the lifted, exploded parts drop out of the pass). */
  contactShadows: { scale: 12, far: 1.2, blur: 2.2, opacity: 0.75, resolution: 1024 },
  /**
   * Reflections and fill: a CC0 studio HDRI (Poly Haven "Studio Small 09", Sergej
   * Majboroda) with our softbox Lightformers on top; the HDRI is never the background.
   */
  environment: { file: '/hdri/studio_small_09_2k.hdr', intensity: 0.85, resolution: 512 },
  /** Post-processing: N8AO ambient occlusion (half resolution), then tone mapping. */
  /**
   * Inspect panel. Desktop: a side panel `panelWidth` px wide on the right; below
   * `compactBelow` px of width it becomes a bottom sheet `sheetHeight` of the screen tall.
   * The camera frames the inspected part in the space left over (styles read these too).
   */
  inspect: {
    panelWidth: 380,
    sheetHeight: 0.42,
    compactBelow: 720,
    outline: { colour: '#7fd6ff', strength: 2.2 },
  },
  post: {
    /** No MSAA: N8AO gets no usable depth from multisampled buffers; SMAA does the edges. */
    multisampling: 0,
    ao: { radius: 0.25, distanceFalloff: 1, intensity: 6, quality: 'medium' as const, halfRes: true },
    // ACES: AgX desaturates the body's red to salmon.
    toneMapping: 'aces' as 'agx' | 'aces',
  },
  /**
   * Showroom "display light" in the engine bay: a soft area light facing down over the
   * engine's footprint. It sits below the deck around the cover opening (so no light
   * spills onto the paint) and above the intake plenum. No visible source, no shadows.
   */
  /**
   * Specular occlusion for our parts while the body encloses them: the fraction of their
   * environment reflections they keep (1 once the body is off, or hidden by solo).
   */
  /** `exempt`: our materials seen outside the bay (the exhaust tips in the rear openings). */
  bayOcclusion: { enclosed: 0.25, exempt: ['tipSteel'] as readonly string[] },
  /** Meshes smaller than this (bounding-sphere radius, m) cast no shadows: unseen, but each costs a draw in both shadow passes. */
  shadowCasterMinRadius: 0.05,
  /**
   * Display lights in the engine bay: two narrow strips just under the deck along each side
   * of the engine (no visible source). On the plenum's clear coat they read as highlight
   * lines along the shoulders instead of one white sheet.
   */
  bayLight: {
    colour: '#fff3e3',
    intensity: 14,
    y: DIMS.body.engineCoverHinge[1] - 0.17,
    z: (DIMS.engine.frontZ + DIMS.engine.blockRearZ) / 2,
    x: DIMS.engine.widthAcrossCovers / 2,
    size: [0.07, DIMS.engine.length] as const,
  },
} as const;

export type ViewName = keyof typeof SCENE.views;
