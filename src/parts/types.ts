import type { ComponentType } from 'react';
import type { Material } from 'three';
import type { Vec3 } from '../config/dims';
import type { MaterialKey } from '../materials/materials';

export type { Vec3 };

/** Euler angles in radians, XYZ order. */
export type Euler3 = readonly [number, number, number];

export type PartGroup =
  | 'body'
  | 'chassis'
  | 'suspension'
  | 'wheels'
  | 'engine'
  | 'hybrid'
  | 'transmission'
  | 'cooling'
  | 'exhaust';

export type Stage = 1 | 2 | 3 | 4 | 5;

export interface PartBuildProps {
  /** The part's primary material (from `material`). Builds may use others via getMaterial(). */
  material: Material;
}

export interface PartDef {
  id: string;
  name: string;
  group: PartGroup;
  description: string;
  specs: Record<string, string>;
  /**
   * Procedural geometry, modelled in the part's local frame (origin = `position`).
   * Omit for virtual assemblies that only exist to carry child parts.
   */
  build?: ComponentType<PartBuildProps>;
  /** Assembled position in car coordinates, even for child parts. */
  position: Vec3;
  /** Assembled rotation of this part's own geometry. Not inherited by child parts. */
  rotation?: Euler3;
  material?: MaterialKey;
  stage: Stage;
  /** Exploded displacement along car axes, added on top of the parent's displacement. */
  explodeOffset: Vec3;
  /** Parent assembly id. The child rides along with the parent's explode motion. */
  parent?: string;
  /** Exploded rotation in the part's local frame, applied about `pivot`. */
  explodeRotation?: Euler3;
  /** Hinge point for `explodeRotation`, in the part's local frame. Defaults to its origin. */
  pivot?: Vec3;
  /** Seconds after the stage starts before this part moves. */
  delay?: number;
}
