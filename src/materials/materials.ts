import {
  DoubleSide,
  LineBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  type Material,
} from 'three';
import { brushedRoughnessTexture, carbonWeaveTextures, castNoiseTexture } from './textures';

/**
 * Shared materials, one instance per key. Parts reference materials by key so that
 * modes like X-ray can restyle a whole category by changing a single material.
 */
export type MaterialKey =
  | 'carbon'
  | 'aluminium'
  | 'steel'
  | 'rubber'
  | 'glass'
  | 'paint'
  | 'hvOrange'
  | 'ceramic'
  | 'caliper'
  | 'radiator'
  | 'castAluminium'
  | 'camCover'
  | 'piston'
  | 'titanium'
  | 'darkSteel'
  | 'springSteel'
  | 'bearing'
  | 'gasket'
  | 'insulator'
  | 'satinBlack'
  | 'reference';

export const PALETTE = {
  /** Body colour placeholder; the final colour is chosen with the body in milestone 5. */
  paint: '#1d4fff',
  carbon: '#1a1c20',
  aluminium: '#c3c6cc',
  steel: '#8d9096',
  rubber: '#121315',
  glass: '#0e1418',
  hvOrange: '#ff6a00',
  ceramic: '#3a3c40',
  caliper: '#c8ccd2',
  radiator: '#2b2e33',
  castAluminium: '#b9bdc3',
  /** Wrinkle-finish red of the cam covers. */
  camCover: '#a3141c',
  piston: '#cfd2d6',
  titanium: '#8b8e94',
  darkSteel: '#4a4d53',
  springSteel: '#2f3136',
  bearing: '#b48c58',
  gasket: '#6a6d73',
  insulator: '#ebe8e0',
  satinBlack: '#17181b',
  reference: '#5fd0ff',
} as const;

/**
 * The engine-cover glass comes from the body model (a near-black, mirror-like tint). It is
 * retuned to a clear, faintly tinted pane so the engine reads through it.
 */
export const ENGINE_COVER_GLASS = { color: '#c9d0d6', opacity: 0.15, roughness: 0.05, envMapIntensity: 0.5 } as const;

const factories: Record<MaterialKey, () => Material> = {
  carbon: () => {
    const { map, roughness } = carbonWeaveTextures(6);
    return new MeshPhysicalMaterial({
      color: '#ffffff',
      map,
      roughnessMap: roughness,
      roughness: 1,
      metalness: 0.15,
      clearcoat: 0.35,
      clearcoatRoughness: 0.25,
    });
  },
  aluminium: () =>
    new MeshPhysicalMaterial({
      color: PALETTE.aluminium,
      metalness: 1,
      roughness: 0.55,
      roughnessMap: brushedRoughnessTexture(2),
      anisotropy: 0.6,
    }),
  steel: () => new MeshStandardMaterial({ color: PALETTE.steel, metalness: 1, roughness: 0.4 }),
  rubber: () => new MeshStandardMaterial({ color: PALETTE.rubber, metalness: 0, roughness: 0.92 }),
  glass: () =>
    new MeshPhysicalMaterial({
      color: PALETTE.glass,
      metalness: 0,
      roughness: 0.05,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      side: DoubleSide,
    }),
  paint: () =>
    new MeshPhysicalMaterial({
      color: PALETTE.paint,
      metalness: 0.3,
      roughness: 0.35,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
    }),
  hvOrange: () => new MeshStandardMaterial({ color: PALETTE.hvOrange, metalness: 0, roughness: 0.55 }),
  ceramic: () => new MeshStandardMaterial({ color: PALETTE.ceramic, metalness: 0.2, roughness: 0.75 }),
  caliper: () => new MeshStandardMaterial({ color: PALETTE.caliper, metalness: 0.3, roughness: 0.35 }),
  radiator: () => new MeshStandardMaterial({ color: PALETTE.radiator, metalness: 0.6, roughness: 0.5 }),
  /** Sand-cast alloy: mottled roughness, no brushing. */
  castAluminium: () =>
    new MeshStandardMaterial({ color: PALETTE.castAluminium, metalness: 1, roughness: 1, roughnessMap: castNoiseTexture(6, 105, 150) }),
  camCover: () =>
    new MeshPhysicalMaterial({
      color: PALETTE.camCover,
      metalness: 0,
      roughness: 0.55,
      bumpMap: castNoiseTexture(10, 60, 200),
      bumpScale: 0.6,
      clearcoat: 0.15,
      clearcoatRoughness: 0.5,
    }),
  piston: () => new MeshStandardMaterial({ color: PALETTE.piston, metalness: 1, roughness: 0.32 }),
  titanium: () => new MeshStandardMaterial({ color: PALETTE.titanium, metalness: 1, roughness: 0.38 }),
  darkSteel: () => new MeshStandardMaterial({ color: PALETTE.darkSteel, metalness: 1, roughness: 0.45 }),
  springSteel: () => new MeshStandardMaterial({ color: PALETTE.springSteel, metalness: 0.9, roughness: 0.4 }),
  bearing: () => new MeshStandardMaterial({ color: PALETTE.bearing, metalness: 1, roughness: 0.3 }),
  gasket: () => new MeshStandardMaterial({ color: PALETTE.gasket, metalness: 0.85, roughness: 0.5 }),
  insulator: () => new MeshStandardMaterial({ color: PALETTE.insulator, metalness: 0, roughness: 0.35 }),
  satinBlack: () => new MeshStandardMaterial({ color: PALETTE.satinBlack, metalness: 0.3, roughness: 0.5 }),
  /** Thin lines for wireframe reference geometry. */
  reference: () => new LineBasicMaterial({ color: PALETTE.reference, transparent: true, opacity: 0.6 }),
};

const cache = new Map<MaterialKey, Material>();

export function getMaterial(key: MaterialKey): Material {
  let m = cache.get(key);
  if (!m) {
    m = factories[key]();
    m.name = key;
    cache.set(key, m);
  }
  return m;
}
