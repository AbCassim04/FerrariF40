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
    minDistance: 1.5,
    maxDistance: 15,
    /** Keep the camera just above the orbit target (and so above the ground). */
    maxPolarAngle: Math.PI / 2 - 0.04,
    smoothTime: 0.25,
    /** Where panning may move the orbit target. */
    targetBounds: { min: [-6, 0.05, -7] as Vec3, max: [6, 4, 7] as Vec3 },
  },
  grid: { cellSize: 0.1, sectionSize: 1, fadeDistance: 28 },
  contactShadows: { scale: 12, far: 2.5, blur: 2.2, opacity: 0.75, resolution: 1024 },
} as const;
