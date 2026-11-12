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
  | 'anodised'
  | 'braided'
  | 'castIron'
  | 'intercooler'
  | 'silicone'
  | 'heatShield'
  | 'reference';

export const PALETTE = {
  /** Body colour placeholder; the final colour is chosen with the body in milestone 5. */
  paint: '#1d4fff',
  carbon: '#1a1c20',
  aluminium: '#c3c6cc',
  steel: '#8d9096',
  rubber: '#121315',
  glass: '#0e1418',
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
  /** Anodised hose fittings (dry-sump and turbo oil lines). */
  anodised: '#2747b0',
  braided: '#8b8e94',
  /** Cast-iron turbine housings and exhaust manifolds: dark, faintly heat-tinted. */
  castIron: '#4a4441',
  intercooler: '#a3a8ae',
  /** Silicone charge-pipe couplers. */
  silicone: '#1f2c5c',
  heatShield: '#cbc7bf',
  reference: '#5fd0ff',
} as const;

/**
 * Body glass as reflection-only panes: `opacity` is how much of the view behind the pane
 * is absorbed; reflections are added on top at full strength (see tuneMaterials).
 * The model's Lexan engine cover is an opaque near-black; it is retuned to a clear, faintly
 * tinted pane so the engine reads through it and its louvres.
 */
export const ENGINE_COVER_GLASS = { opacity: 0.14, roughness: 0.06, envMapIntensity: 0.3 } as const;
/** Windscreen and side windows: dark tint with reflections (no transmission pass). */
export const CABIN_GLASS = { opacity: 0.62, roughness: 0.04, envMapIntensity: 1 } as const;
/** Clear lamp covers in the nose: nearly clear, so the lamps behind them read. */
export const LAMP_COVER = { opacity: 0.2, roughness: 0.03, envMapIntensity: 0.8 } as const;
/** Model glass materials by name: which pane each becomes. */
export const MODEL_GLASS: Record<string, { opacity: number; roughness: number; envMapIntensity: number }> = {
  'F40_Glass.001': ENGINE_COVER_GLASS,
  F40_Window: CABIN_GLASS,
  F40_Glass: CABIN_GLASS,
  'F40_Window.001': LAMP_COVER,
  F40_Headlights: LAMP_COVER,
};
/**
 * Finishes for model materials that leave out `metallicFactor` (glTF then defaults to 1)
 * with roughness 0: perfect mirrors that show the studio HDRI as white. Keyed by name.
 */
export const MODEL_FINISH: Record<string, { metalness: number; roughness: number }> = {
  F40_Mechanics: { metalness: 0.35, roughness: 0.55 },
  F40_Tappetini: { metalness: 0, roughness: 0.9 },
  F40_Carbon: { metalness: 0.2, roughness: 0.45 },
  F40_Display: { metalness: 0.1, roughness: 0.5 },
  F40_Estra: { metalness: 0.2, roughness: 0.6 },
  F40_Grid: { metalness: 0.3, roughness: 0.6 },
  F40_GridD: { metalness: 0.3, roughness: 0.6 },
  F40_Brake: { metalness: 0.9, roughness: 0.45 },
  F40_Rrims: { metalness: 1, roughness: 0.3 },
};

/**
 * Body paint: a satin base coat under a near-mirror clear coat, keyed by the model's
 * material name (its red is called "material"). Deep rosso with a weak base-coat sheen:
 * brighter reds lit from above go coral under ACES.
 */
export const BODY_PAINT: Record<string, { colour?: string; roughness: number; metalness: number; specularIntensity?: number; clearcoatRoughness: number }> = {
  material: { colour: '#b4000c', roughness: 0.4, metalness: 0.05, specularIntensity: 0.4, clearcoatRoughness: 0.03 },
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
  /** Show carbon: visible twill under a deep clearcoat. */
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
  anodised: () => new MeshStandardMaterial({ color: PALETTE.anodised, metalness: 0.9, roughness: 0.3 }),
  /** Stainless braid over the oil hoses: a dull, rough metal at this scale. */
  braided: () => new MeshStandardMaterial({ color: PALETTE.braided, metalness: 0.85, roughness: 0.62, bumpMap: castNoiseTexture(40, 90, 170), bumpScale: 0.3 }),
  castIron: () => {
    const grain = castNoiseTexture(24, 120, 190);
    return new MeshStandardMaterial({ color: PALETTE.castIron, metalness: 0.75, roughness: 0.8, roughnessMap: grain, bumpMap: grain, bumpScale: 0.25 });
  },
  /** Intercooler cores and end tanks: bare aluminium, finely finned (brushed roughness reads as fins). */
  intercooler: () =>
    new MeshPhysicalMaterial({ color: PALETTE.intercooler, metalness: 1, roughness: 0.5, roughnessMap: brushedRoughnessTexture(8), anisotropy: 0.8 }),
  silicone: () => new MeshStandardMaterial({ color: PALETTE.silicone, metalness: 0, roughness: 0.6 }),
  heatShield: () => new MeshStandardMaterial({ color: PALETTE.heatShield, metalness: 1, roughness: 0.34, bumpMap: castNoiseTexture(60, 100, 160), bumpScale: 0.5 }),
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
