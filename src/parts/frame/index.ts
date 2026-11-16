import { CHASSIS, TUBE_RADIUS, type FrameSection } from '../../config/chassis';
import type { Vec3 } from '../../config/dims';
import { fmtM, fmtMm } from '../../lib/format';
import { specBuild } from '../../scene/MeshSet';
import type { PartDef } from '../types';
import { frameMeshes } from './geometry';
import { frameStats } from './layout';

/**
 * Phase 5A: the steel tube spaceframe, in our own geometry (config/chassis.ts). It is the
 * backbone: its three welded sections stay where they are when the car explodes and everything
 * else leaves them. Only the bolted brace across the tail lifts off, before the
 * powertrain comes out under it. Built in car coordinates, so every part sits at the origin.
 */

const ORIGIN: Vec3 = [0, 0, 0];
const dia = (r: number) => `Ø${fmtMm(r * 2, 0)}`;

function section(id: string, name: string, s: FrameSection, description: string, extra: Partial<PartDef> = {}): PartDef {
  const { tubes, length } = frameStats(s);
  return {
    id,
    name,
    group: 'frame',
    description,
    specs: { Material: 'Steel tube, welded, painted', Tubes: `${tubes} (est)`, 'Tube length': `${fmtM(length, 1)} (est)`, Sizes: `${dia(TUBE_RADIUS.brace)} to ${dia(TUBE_RADIUS.main)} (est)` },
    build: specBuild(`Frame_${s}`, () => frameMeshes(s)),
    material: 'frameSteel',
    position: ORIGIN,
    stage: 1,
    explodeOffset: ORIGIN,
    ...extra,
  };
}

export const frameParts: PartDef[] = [
  section(
    'frame-cabin',
    'Frame: cabin cell',
    'cabin',
    'The middle of the steel tube frame: sill rails under the doors, the tunnel, the bulkhead behind the seats, the windscreen pillars, roof rails and the main hoop. The composite tub, roof and sills are bonded onto it, which is where the car gets its stiffness.',
    // The tub, its liners and the cabin trim are bonded round these tubes (scripts/dev/frame-fit.mjs lists every crossing).
    { contacts: ['body-shell', 'interior'] },
  ),
  section(
    'frame-front',
    'Frame: front subframe',
    'front',
    'A tube truss each side of the front compartment, joined across the nose. It carries the front suspension pickups, the coilover towers, the steering rack and the radiator.',
    { contacts: ['body-shell', 'frame-cabin'] },
  ),
  section(
    'frame-rear',
    'Frame: engine bay',
    'rear',
    'The rear of the frame: two cradle rails under the engine and gearbox, whose mounts bolt down onto them, and suspension rails and a coilover tower each side, tied forward to the main hoop.',
    { contacts: ['body-shell', 'interior', 'frame-cabin', 'engine-mount-l', 'engine-mount-r', 'gearbox-mount-l', 'gearbox-mount-r'] },
  ),
  section(
    'frame-brace',
    'Frame: tail brace',
    'brace',
    'A bolted tube hoop joining the two sides of the frame across the tail, over the silencer. It unbolts and lifts away first, so the engine and gearbox can slide back and come out past it.',
    { contacts: ['frame-rear'], stage: 2, explodeOffset: CHASSIS.braceLift },
  ),
];
