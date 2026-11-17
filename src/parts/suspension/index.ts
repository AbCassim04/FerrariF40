import { SUSPENSION as S, SUSPENSION_EXPLODE as X } from '../../config/suspension';
import type { Vec3 } from '../../config/dims';
import { fmtMm } from '../../lib/format';
import type { MaterialKey } from '../../materials/materials';
import { specBuild, type MeshSpec } from '../../scene/MeshSet';
import type { PartDef } from '../types';
import { antiRollMeshes, damperMeshes, linkMeshes, rackMeshes, springMeshes, uprightMeshes, wishboneMeshes, type Axle, type Side } from './geometry';

/**
 * Phase 5B: double-wishbone suspension and running gear, in our own geometry
 * (config/suspension.ts). Built in car coordinates, so every part sits at the origin. In the
 * explode each corner's parts move outward in stage 2, behind the wheel, disc and caliper; the
 * steering rack and the front anti-roll bar are threaded through the front tub and stay with
 * the frame; the rear anti-roll bar leaves with the tail brace before the powertrain slides.
 */

const ORIGIN: Vec3 = [0, 0, 0];
type Corner = 'fl' | 'fr' | 'rl' | 'rr';
const CORNERS: Corner[] = ['fl', 'fr', 'rl', 'rr'];
const axleOf = (c: Corner): Axle => (c[0] === 'f' ? 'front' : 'rear');
const sideOf = (c: Corner) => c[1] as Side;
const sign = (c: Corner) => (c[1] === 'l' ? 1 : -1);
const where = (c: Corner) => `${c[0] === 'f' ? 'front' : 'rear'} ${c[1] === 'l' ? 'left' : 'right'}`;
const out = (c: Corner, [x, y, z]: Vec3): Vec3 => [sign(c) * x, y, z];
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const dia = (r: number) => `Ø${fmtMm(r * 2, 0)}`;

interface Spec {
  id: string;
  name: string;
  description: string;
  specs: Record<string, string>;
  meshes: () => MeshSpec[];
  material: MaterialKey;
  explodeOffset?: Vec3;
  contacts?: string[];
  delay?: number;
}

const part = (p: Spec): PartDef => ({
  id: p.id,
  name: p.name,
  group: 'suspension',
  description: p.description,
  specs: p.specs,
  build: specBuild(p.id, p.meshes),
  material: p.material,
  position: ORIGIN,
  stage: 2,
  explodeOffset: p.explodeOffset ?? ORIGIN,
  delay: p.delay ?? X.delay,
  contacts: p.contacts,
});

function corner(c: Corner): PartDef[] {
  const axle = axleOf(c);
  const s = sideOf(c);
  const P = S[axle];
  const frame = axle === 'front' ? 'frame-front' : 'frame-rear';
  const armLength = (w: 'upper' | 'lower') => fmtMm((dist(P[w].front, P[w].ball) + dist(P[w].rear, P[w].ball)) / 2, 0);
  const stroke = dist(P.coilover.bottom, P.coilover.top);
  const wishbone = (w: 'upper' | 'lower') =>
    part({
      id: `wishbone-${w}-${c}`,
      name: `${w === 'upper' ? 'Upper' : 'Lower'} wishbone (${where(c)})`,
      description:
        w === 'upper'
          ? 'Upper A-arm: two steel tubes from pivots on the frame to a ball joint at the top of the upright. With the lower arm it holds the wheel upright as it rises and falls.'
          : 'Lower A-arm: two steel tubes from pivots on the frame to a ball joint at the bottom of the upright. It carries the coilover, so the car’s weight goes through it.',
      specs: { Type: 'Welded steel tube A-arm', 'Leg length': `${armLength(w)} (est)`, Tube: `${dia(S.arm.radius)} (est)` },
      meshes: () => wishboneMeshes(axle, w, s),
      material: 'satinBlack',
      explodeOffset: out(c, w === 'upper' ? X.upperArm : X.lowerArm),
      // Pivot bushes on the frame's rails; the ball joint in the upright; the coilover's and the drop link's eyes on the lower arm.
      contacts: [frame, `upright-${c}`, ...(w === 'lower' ? [`damper-${c}`, axle === 'front' ? 'anti-roll-bar-front' : 'anti-roll-bar-rear'] : [])],
    });
  return [
    part({
      id: `upright-${c}`,
      name: `Upright (${where(c)})`,
      description:
        axle === 'front'
          ? 'Cast hub carrier between the two wishbones’ ball joints. The wheel bearing sits in its boss, the brake caliper bolts to it, and the arm at the back takes the steering tie rod.'
          : 'Cast hub carrier between the two wishbones’ ball joints. The driveshaft passes through its boss to the wheel; the arm at the back takes the toe link.',
      specs: { Material: 'Cast alloy (est)', 'Ball joints apart': `${fmtMm(dist(P.lower.ball, P.upper.ball), 0)} (est)` },
      meshes: () => uprightMeshes(axle, s),
      material: 'castAluminium',
      explodeOffset: out(c, X.upright),
      // The hub flange carries the disc; the caliper bolts to the upright; the driveshaft's stub runs through the rear hubs.
      contacts: [`brake-disc-${c}`, `caliper-${c}`, `wheel-${c}`, ...(axle === 'rear' ? [`driveshaft-${s}`] : []), axle === 'front' ? `tie-rod-${s}` : `toe-link-${s}`],
    }),
    wishbone('upper'),
    wishbone('lower'),
    part({
      id: `spring-${c}`,
      name: `Coil spring (${where(c)})`,
      description: 'Coil spring round the damper, between a seat on the damper body and one under the top mount. It carries the corner’s share of the car’s weight.',
      specs: { Coils: `${S.coilover.spring.coils} (est)`, 'Coil diameter': `${fmtMm(S.coilover.spring.radius * 2, 0)} (est)`, Wire: `${dia(S.coilover.spring.wire)} (est)` },
      meshes: () => springMeshes(axle, s),
      material: 'coilSpring',
      explodeOffset: out(c, axle === 'front' ? X.spring : X.rearSpring),
      contacts: [`damper-${c}`],
    }),
    part({
      id: `damper-${c}`,
      name: `Damper (${where(c)})`,
      description:
        axle === 'front'
          ? 'Koni telescopic damper inside the spring, from the lower wishbone up to the frame’s tower. It turns the wheel’s bouncing into heat.'
          : 'Koni telescopic damper inside the spring. Here it leans back from the lower wishbone to a low tower behind the axle, under the intercooler.',
      specs: { Make: 'Koni (ref)', 'Eye to eye': `${fmtMm(stroke, 0)} (est)`, Body: `${dia(S.coilover.bodyRadius)} (est)` },
      meshes: () => damperMeshes(axle, s),
      material: 'painted',
      explodeOffset: out(c, axle === 'front' ? X.damper : X.rearDamper),
      contacts: [frame],
    }),
  ];
}

const link = (s: Side, axle: Axle): PartDef => {
  const c = `${axle === 'front' ? 'f' : 'r'}${s}` as Corner;
  const L = S[axle].link;
  return part(
    axle === 'front'
      ? {
          id: `tie-rod-${s}`,
          name: `Steering tie rod (${s === 'l' ? 'left' : 'right'})`,
          description: 'Rod from the end of the steering rack to the arm on the front upright: it turns the wheel as the rack slides.',
          specs: { Length: `${fmtMm(dist(L.inner, L.outer), 0)} (est)`, Rod: `${dia(S.link.radius)} (est)` },
          meshes: () => linkMeshes(axle, s),
          material: 'steel',
          explodeOffset: out(c, X.tieRod),
          // Out through the footwell wall from the rack.
          contacts: ['steering-rack', 'body-shell'],
        }
      : {
          id: `toe-link-${s}`,
          name: `Toe link (${s === 'l' ? 'left' : 'right'})`,
          description: 'Adjustable link from the frame to the arm on the rear upright. It holds the rear wheel pointing straight ahead and sets its toe angle.',
          specs: { Length: `${fmtMm(dist(L.inner, L.outer), 0)} (est)`, Rod: `${dia(S.link.radius)} (est)` },
          meshes: () => linkMeshes(axle, s),
          material: 'steel',
          explodeOffset: out(c, X.toeLink),
          contacts: ['frame-rear'],
        },
  );
};

const antiRoll = (axle: Axle): PartDef =>
  part({
    id: `anti-roll-bar-${axle}`,
    name: `Anti-roll bar (${axle})`,
    description:
      axle === 'front'
        ? 'Sprung steel bar across the car under the luggage tub, turning in two bushes on the frame, with a drop link down to each lower wishbone. When the car leans in a corner it twists and resists the roll.'
        : 'Sprung steel bar across the tail over the silencer, turning in two bushes, with a drop link down to each rear lower wishbone. It comes off with the tail brace before the engine is taken out.',
    specs: { Bar: `${dia(S.antiRoll.radius)} (est)`, 'Drop links': `2, ${dia(S.antiRoll.linkRadius)} (est)` },
    meshes: () => antiRollMeshes(axle),
    material: 'darkSteel',
    explodeOffset: axle === 'rear' ? X.rearAntiRoll : ORIGIN,
    delay: 0,
    // Front: through the front tub's walls, in bushes on the frame. Rear: in bushes on the tail brace.
    contacts: axle === 'front' ? ['body-shell', 'frame-front'] : ['frame-brace', 'frame-rear'],
  });

const rack: PartDef = part({
  id: 'steering-rack',
  name: 'Steering rack',
  description: 'Rack and pinion across the car under the footwell floor, unassisted. The column turns the pinion, the rack slides, and a tie rod at each end steers its wheel. It stays with the frame in the teardown.',
  specs: { Type: 'Rack and pinion, unassisted (ref)', Housing: `${dia(S.rackHousing.radius)} (est)` },
  meshes: rackMeshes,
  material: 'castAluminium',
  // Across the tub under the footwells, through its side walls.
  contacts: ['body-shell', 'interior', 'frame-cabin', 'frame-front'],
});

export const suspensionParts: PartDef[] = [...CORNERS.flatMap(corner), rack, link('l', 'front'), link('r', 'front'), link('l', 'rear'), link('r', 'rear'), antiRoll('front'), antiRoll('rear')];
