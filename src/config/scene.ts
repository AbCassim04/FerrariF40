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
    /** Close enough to read valve springs and bolt heads (double-tap a part to orbit round it, then zoom in). */
    minDistance: 0.35,
    maxDistance: 20,
    /**
     * Low orbit (8D): the camera may drop below the orbit target, down to `minCameraY` above
     * the ground (never under it), to look up under the exploded car; at most this far over.
     */
    maxPolarAngle: Math.PI - 0.12,
    minCameraY: 0.06,
    /** (est) Damping: how long the camera takes to settle on a framing, and while dragging. */
    smoothTime: 0.18,
    draggingSmoothTime: 0.07,
    /** (est) Inertia after a flick: the orbit keeps turning, decaying with this time constant (s), if it was turning faster than `minSpeed` (rad/s). */
    inertia: { tau: 0.3, minSpeed: 0.6 },
    /** (est) Rotation per screen height on touch screens, as a share of a full turn at 800 px tall (landscape phones are short). */
    touchRotate: { refHeight: 800, min: 0.55 },
    /** Fraction of the view kept clear around a fitted box (explode framing). (est, 8D: looser) */
    fitPadding: 0.16,
    /** The same for the car presets. (est, 8D: was 0.06, felt cramped) */
    presetPadding: 0.13,
    /** (est) A free area whose short side is under `px` (a phone, between its bars) keeps only this share of the padding. */
    smallArea: { px: 420, paddingScale: 0.55 },
    /** Screen aspect the views are composed for; narrower screens back the camera off, up to `narrowBackOff` times. */
    designAspect: 1.6,
    narrowBackOff: 2.4,
    /** Looser framing for an inspected part, so the panel doesn't crowd it. */
    inspectPadding: 0.3,
    /** Where panning may move the orbit target at most (a hard stop, well outside the soft limits). */
    targetBounds: { min: [-6, 0.05, -7] as Vec3, max: [6, 4, 7] as Vec3 },
    /**
     * 9A camera feel, three profiles to compare (all est). classic: the 8D behaviour (pivot
     * follows zoom-to-cursor, flick inertia, a low-orbit limit from the camera's height).
     * anchored: after a zoom or pan the pivot is put back on the surface under the view's
     * centre; no inertia; crisp damping; a fixed floor. grab: as anchored, and a rotation
     * pivots round the point under the pointer when it starts.
     */
    profiles: {
      classic: { label: 'Classic', smoothTime: 0.18, draggingSmoothTime: 0.07, inertia: true, floor: 'low-orbit', anchor: false, grab: false },
      anchored: { label: 'Anchored', smoothTime: 0.1, draggingSmoothTime: 0.035, inertia: false, floor: 'pivot', anchor: true, grab: false },
      grab: { label: 'Grab', smoothTime: 0.1, draggingSmoothTime: 0.035, inertia: false, floor: 'pivot', anchor: true, grab: true },
    },
    defaultProfile: 'anchored' as 'classic' | 'anchored' | 'grab',
    /**
     * Fixed floor (anchored, grab): the camera never goes below the pivot's height (polar
     * limit just above the horizontal), and the pivot never below `minTargetY`, so the camera
     * stays above the ground at any zoom; no limit that moves with the camera.
     */
    pivotFloor: { maxPolar: Math.PI / 2 - 0.02, minTargetY: 0.05 },
    /**
     * Wheel and trackpad (all profiles): the radius scales by exp(pixels × k): a 100 px mouse
     * notch is ×1.17; a trackpad scroll is the same per pixel; a trackpad pinch (ctrlKey) moves
     * with the fingers (k larger, its deltas are small). One event moves at most `maxStep`.
     */
    wheel: { pixel: 0.0016, pinch: 0.012, lineHeight: 16, pageHeight: 400, maxStep: 0.5 },
    /** After the last wheel event, this long before the pivot is re-anchored (ms). */
    anchorIdleMs: 220,
    /**
     * Soft pan limits (all profiles): the pivot may be dragged past the car's box (exploded:
     * the exploded extents) grown by `margin` (m), against a pull of `pull` of the excess per
     * 60 Hz frame; let go, it eases back.
     */
    softBounds: { margin: 0.9, pull: 0.12 },
  },
  grid: { cellSize: 0.1, sectionSize: 1, fadeDistance: 28 },
  /**
   * Camera presets: [position, target]. `fit` presets only give the direction: the camera
   * frames the whole assembled car from there (`presetPadding`), on any screen shape.
   */
  views: {
    front34: { position: [5.6, 2.1, 6.2] as Vec3, target: [0, DIMS.overall.height * 0.4, DIMS.body.centreZ] as Vec3, fit: true },
    // A hair of z offset keeps the orbit basis defined when looking straight down.
    top: { position: [0, 9.5, 0.01] as Vec3, target: [0, 0, DIMS.body.centreZ] as Vec3, fit: true },
    /** Looking down through the louvred Lexan engine cover. */
    engine: { position: [0.55, 2.35, -2.25] as Vec3, target: [0, 0.45, -0.85] as Vec3, fit: false },
    side: { position: [7.5, 0.9, 0] as Vec3, target: [0, 0.5, DIMS.body.centreZ] as Vec3, fit: true },
    rear34: { position: [-4.8, 2.4, -6.2] as Vec3, target: [0, 0.5, -0.4] as Vec3, fit: true },
    /** 9C: from the driver's seat (left-hand drive) over the wheel to the instruments. */
    cockpit: { position: [0.34, 1.0, 0.33] as Vec3, target: [0.32, 0.745, 0.69] as Vec3, fit: false, fixed: true },
  },
  /** `far`: only things within this height of the ground cast contact shadows (the lifted, exploded parts drop out of the pass). */
  contactShadows: { scale: 12, far: 1.2, blur: 2.2, opacity: 0.75, resolution: 1024 },
  /**
   * Reflections and fill: a CC0 studio HDRI (Poly Haven "Studio Small 09", Sergej
   * Majboroda) with our softbox Lightformers on top; the HDRI is never the background.
   */
  /** `file` is relative to the site root (see lib/asset.ts). */
  environment: { file: 'hdri/studio_small_09_2k.hdr', intensity: 0.85, resolution: 512 },
  /** Post-processing: N8AO ambient occlusion (half resolution), then tone mapping. */
  /**
   * Inspect panel. Desktop: a side panel `panelWidth` px wide on the right; below
   * `compactBelow` px of width it becomes a bottom sheet `sheetHeight` of the screen tall.
   * The camera frames things in the space left over (styles read these too).
   */
  inspect: {
    panelWidth: 380,
    sheetHeight: 0.42,
    compactBelow: 720,
    outline: { colour: '#7fd6ff', strength: 2.2 },
  },
  /**
   * Ghost shells (fresnel, additive): `base` is the face-on glow, `rim` the silhouette
   * glow, `tintMix` how far each surface's colour is mixed toward `cool`. X-ray ghosts the
   * body; `isolate` ghosts every other part while one is inspected (fainter, so the
   * inspected part stands out).
   */
  ghosts: {
    xray: { base: 0.008, rim: 0.34, tintMix: 0.25, cool: '#a9c8dc' },
    isolate: { base: 0.004, rim: 0.11, tintMix: 0.5 },
    /** 9B: the pipes the gas flows through, with Flow on: fainter, so stacked fins and cans don't glare over the flow. */
    flow: { base: 0.002, rim: 0.1, tintMix: 0.45 },
  },
  /**
   * Quality tiers (8D, est). Phones start at `phoneStart`; any device drops a tier when its
   * median frame time stays above `slowMs` for `strikes` windows of `window` s in a row (after
   * `warmup` s, and again after each drop), and never climbs back mid-session (no flicker).
   * Real speed mode is only offered at the top tier. Dev: `?tier=0|1|2` pins a tier.
   */
  quality: {
    tiers: [
      { name: 'high', dpr: 2, ao: 'medium', aoOn: true, shadowMap: 2048, contactShadows: 1024 },
      { name: 'medium', dpr: 1.5, ao: 'low', aoOn: true, shadowMap: 1024, contactShadows: 512 },
      { name: 'low', dpr: 1, ao: 'low', aoOn: false, shadowMap: 1024, contactShadows: 256 },
    ],
    phoneStart: 1,
    watch: { window: 2, slowMs: 26, strikes: 2, warmup: 4 },
  },
  post: {
    /** No MSAA: N8AO gets no usable depth from multisampled buffers; SMAA does the edges. */
    multisampling: 0,
    ao: { radius: 0.25, distanceFalloff: 1, intensity: 6, quality: 'medium' as const, halfRes: true },
    // ACES: AgX desaturates the body's red to salmon.
    toneMapping: 'aces' as 'agx' | 'aces',
  },
  /**
   * Showroom "display light" in the engine bay: soft area lights facing down over the
   * engine's footprint, just under the Lexan cover (so no light spills onto the paint). No
   * visible source, no shadows.
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
   * Display lights in the engine bay: two narrow strips just under the Lexan along each side
   * of the engine (no visible source). On clear-coated parts they read as highlight lines
   * instead of one white sheet.
   */
  bayLight: {
    colour: '#fff3e3',
    intensity: 14,
    y: DIMS.body.lexanY - 0.15,
    z: (DIMS.engine.frontZ + DIMS.engine.blockRearZ) / 2,
    x: DIMS.engine.widthAcrossCovers / 2,
    size: [0.07, DIMS.engine.length] as const,
  },
} as const;

export type ViewName = keyof typeof SCENE.views;
