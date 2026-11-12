import { modelPartBuild } from '../../body/BodyModel';
import { DIMS, EXPLODE, type Vec3 } from '../../config/dims';
import { BODY_DELAY } from '../../explode/timing';
import { fmtDeg, fmtM, fmtMm } from '../../lib/format';
import type { PartDef, PartGroup, Stage } from '../types';

/**
 * Parts rendered from the licensed body model. Its geometry is already in car
 * coordinates, so every part sits at the origin and hinges are given in car coordinates.
 */

const ORIGIN: Vec3 = [0, 0, 0];
const MODEL = 'From the licensed body model.';

interface ModelPartSpec {
  id: string;
  name: string;
  group: PartGroup;
  description: string;
  specs?: Record<string, string>;
  stage: Stage;
  parent?: string;
  explodeOffset?: Vec3;
  explodeRotation?: Vec3;
  pivot?: Vec3;
  delay?: number;
}

function modelPart(p: ModelPartSpec): PartDef {
  return {
    ...p,
    description: `${p.description} ${MODEL}`,
    specs: p.specs ?? {},
    build: modelPartBuild(p.id),
    position: ORIGIN,
    source: 'model',
    explodeOffset: p.explodeOffset ?? ORIGIN,
  };
}

type Side = 'l' | 'r';
const sideSign = (s: Side) => (s === 'l' ? 1 : -1);
const sideName = (s: Side) => (s === 'l' ? 'left' : 'right');

function door(s: Side) {
  return modelPart({
    id: `door-${s}`,
    name: `Door (${sideName(s)})`,
    group: 'body',
    description: 'Lightweight composite door, hinged at its front edge. Inside, a pull cord takes the place of a door handle.',
    specs: { Hinge: 'Front edge', Opens: fmtDeg(EXPLODE.doorOpen) },
    stage: 1,
    // Swings its rear edge outward about the front hinge.
    explodeRotation: [0, -sideSign(s) * EXPLODE.doorOpen, 0],
    pivot: DIMS.body.doorHinge[s],
    delay: BODY_DELAY.doors,
  });
}

type Corner = 'fl' | 'fr' | 'rl' | 'rr';
const CORNERS: Corner[] = ['fl', 'fr', 'rl', 'rr'];
const cornerName = (c: Corner) => `${c[0] === 'f' ? 'front' : 'rear'} ${sideName(c[1] as Side)}`;
const axleOf = (c: Corner) => DIMS.wheel[c[0] === 'f' ? 'front' : 'rear'];

function wheel(c: Corner) {
  const w = axleOf(c);
  const { widthMm, aspectPct, rimIn } = w.tyre;
  return modelPart({
    id: `wheel-${c}`,
    name: `Wheel (${cornerName(c)})`,
    group: 'wheels',
    description: 'Five-spoke alloy wheel with a single centre-lock nut, on a low-profile tyre. The rears are much wider than the fronts to put the turbo torque down.',
    specs: {
      Tyre: `${widthMm}/${aspectPct} ZR${rimIn}`,
      Rim: `${(w.rimWidth / 0.0254).toFixed(0)} × ${rimIn} in`,
      'Centre height': fmtMm(w.centreY),
      Track: fmtM(w.centreX * 2),
    },
    stage: 2,
    explodeOffset: [sideSign(c[1] as Side) * EXPLODE.wheelOut, 0, 0],
  });
}

function disc(c: Corner) {
  return modelPart({
    id: `brake-disc-${c}`,
    name: `Brake disc (${cornerName(c)})`,
    group: 'suspension',
    description: 'Ventilated iron brake disc, gripped by a four-piston aluminium caliper. The real discs are cross-drilled; the model’s are plain.',
    specs: { Diameter: fmtMm(axleOf(c).discDiameter, 0), Type: 'Ventilated, cross-drilled' },
    stage: 2,
    explodeOffset: [sideSign(c[1] as Side) * EXPLODE.discOut, 0, 0],
  });
}

/** Virtual hinge the rear clam swings on: opens it about the tail, then the clam lifts away. */
const rearClamHinge: PartDef = {
  id: 'rear-clam-hinge',
  name: 'Rear clam hinge',
  group: 'body',
  description: 'The rear clam’s hinge at the tail.',
  specs: {},
  position: ORIGIN,
  stage: 1,
  explodeOffset: ORIGIN,
  explodeRotation: [-EXPLODE.rearClamOpen, 0, 0],
  pivot: DIMS.body.rearClamHinge,
  delay: BODY_DELAY.rearClamOpen,
};

export const bodyParts: PartDef[] = [
  modelPart({
    id: 'body-shell',
    name: 'Roof, pillars & sills',
    group: 'body',
    description: 'The fixed centre of the body, bonded to the steel tube frame: roof, windscreen pillars, sills and the bulkhead behind the seats. Like every panel on the car it is carbon fibre and Kevlar.',
    specs: { Material: 'Carbon fibre and Kevlar' },
    stage: 1,
  }),
  modelPart({
    id: 'interior',
    name: 'Cockpit',
    group: 'body',
    description: 'Two composite bucket seats, the instrument binnacle, steering wheel and pedals. Built for lightness: no carpets and no sound system.',
    specs: { Seats: '2', Drive: 'Left-hand (as modelled)' },
    stage: 1,
  }),
  modelPart({
    id: 'undertray',
    name: 'Floor & diffuser',
    group: 'body',
    description: 'Flat floor under the cabin and the diffuser under the tail, which together keep the air under the car fast and the car pressed down.',
    stage: 1,
  }),
  modelPart({
    id: 'model-chassis',
    name: 'Frame & suspension (placeholder)',
    group: 'chassis',
    description: 'Stand-in frame rails, suspension and radiator from the body model, kept until the procedural steel tube frame and double-wishbone suspension replace them.',
    specs: { 'Real frame': 'Steel tube, strengthened with composites' },
    stage: 1,
  }),
  modelPart({
    id: 'glass',
    name: 'Windscreen & fixed glass',
    group: 'body',
    description: 'The windscreen, the small rear side windows and the pane behind the seats.',
    stage: 1,
    explodeOffset: EXPLODE.glass,
    delay: BODY_DELAY.glass,
  }),
  door('l'),
  door('r'),
  modelPart({
    id: 'front-clam',
    name: 'Front clam',
    group: 'body',
    description: 'Bonnet, front wings and nose in one composite piece, hinged at the very front. Lifting it bares the radiator and the front suspension.',
    specs: { Hinge: 'Nose', Material: 'Carbon fibre and Kevlar' },
    stage: 1,
    explodeRotation: [EXPLODE.frontClamOpen, 0, 0],
    pivot: DIMS.body.frontClamHinge,
    explodeOffset: EXPLODE.frontClam,
    delay: BODY_DELAY.frontClam,
  }),
  rearClamHinge,
  modelPart({
    id: 'rear-clam',
    name: 'Rear clam',
    group: 'body',
    parent: 'rear-clam-hinge',
    description: 'The whole tail in one composite piece, hinged at the very back: rear wings, tail lamps and the louvred Lexan cover the engine is seen through. Lifted, it bares the engine, gearbox and rear suspension.',
    specs: { Hinge: 'Tail', Opens: fmtDeg(EXPLODE.rearClamOpen), 'Engine cover': 'Louvred Lexan' },
    stage: 1,
    explodeOffset: EXPLODE.rearClamLift,
    delay: BODY_DELAY.rearClamLift,
  }),
  modelPart({
    id: 'rear-wing',
    name: 'Rear wing',
    group: 'body',
    parent: 'rear-clam',
    description: 'Full-width fixed wing on endplates that rise out of the rear wings, part of the same moulding as the clam.',
    stage: 1,
    explodeOffset: EXPLODE.rearWingOff,
    delay: BODY_DELAY.rearWing,
  }),
  ...CORNERS.map(wheel),
  ...CORNERS.map(disc),
];
