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
  | 'carbonGloss'
  | 'redAccent'
  | 'headerSteel'
  | 'headerTint'
  | 'tipSteel'
  | 'loom'
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
  castAluminium: '#a9adb2',
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
  redAccent: '#c4121c',
  headerSteel: '#a9a39a',
  tipSteel: '#d4d6da',
  loom: '#121314',
  reference: '#5fd0ff',
} as const;

/**
 * The engine-cover glass comes from the body model (a near-black, mirror-like tint). It is
 * retuned to a clear, faintly tinted pane so the engine reads through it.
 */
/**
 * Body glass as reflection-only panes: `opacity` is how much of the view behind the pane
 * is absorbed; reflections are added on top at full strength (see tuneMaterials).
 */
export const ENGINE_COVER_GLASS = { opacity: 0.12, roughness: 0.05, envMapIntensity: 0.25 } as const;
/** Canopy and door glass: dark tint with reflections (no transmission pass). */
export const CABIN_GLASS = { opacity: 0.62, roughness: 0.04, envMapIntensity: 1 } as const;
/** Tail-light lenses: keep the model's red, plain alpha. */
export const LAMP_GLASS = { opacity: 0.55 } as const;
/**
 * Body paint: the model's paints have no clear coat (one glossy layer, so reflections
 * stayed weak and the body read flat). A satin base coat under a near-mirror clear coat,
 * keyed by the model's material names.
 */
export const BODY_PAINT: Record<string, { roughness: number; metalness: number; clearcoatRoughness: number }> = {
  uv1MAT_Carpaint_Red1: { roughness: 0.32, metalness: 0.05, clearcoatRoughness: 0.03 },
  uv1MAT_Car_Paint_Black1: { roughness: 0.28, metalness: 0.2, clearcoatRoughness: 0.03 },
};

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
  /** Sand-cast finish: a fine, low-contrast grain in roughness and a whisper of bump. */
  castAluminium: () => {
    const grain = castNoiseTexture(28, 118, 146);
    return new MeshStandardMaterial({ color: PALETTE.castAluminium, metalness: 1, roughness: 1, roughnessMap: grain, bumpMap: grain, bumpScale: 0.15 });
  },
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
  /** Show carbon (plenum cover, airboxes): visible twill under a deep clearcoat. */
  carbonGloss: () => {
    const { map, roughness } = carbonWeaveTextures(6);
    return new MeshPhysicalMaterial({
      color: '#ffffff',
      map,
      roughnessMap: roughness,
      roughness: 0.6,
      metalness: 0.2,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
    });
  },
  redAccent: () => new MeshPhysicalMaterial({ color: PALETTE.redAccent, metalness: 0, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 }),
  headerSteel: () => new MeshStandardMaterial({ color: PALETTE.headerSteel, metalness: 1, roughness: 0.42 }),
  /** Header primaries: the tint comes from vertex colours (heat oxide, blue/purple to gold). */
  headerTint: () => new MeshStandardMaterial({ color: '#ffffff', vertexColors: true, metalness: 1, roughness: 0.36 }),
  tipSteel: () => new MeshStandardMaterial({ color: PALETTE.tipSteel, metalness: 1, roughness: 0.18 }),
  /** Braided loom sleeve: matte black. */
  loom: () => new MeshStandardMaterial({ color: PALETTE.loom, metalness: 0, roughness: 0.85 }),
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

/** Every shared material created so far (for scene-wide adjustments such as bay occlusion). */
export function sharedMaterials(): Iterable<Material> {
  return cache.values();
}

/**
 * Model materials that need their own environment level (see EnvironmentLevels), keyed to
 * the level they keep.
 */
export const modelEnvLevels = new Map<Material, number>();
