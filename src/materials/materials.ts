import {
  DoubleSide,
  LineBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  type Material,
} from 'three';
import { brushedRoughnessTexture, carbonWeaveTextures } from './textures';

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
  reference: '#5fd0ff',
} as const;

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
