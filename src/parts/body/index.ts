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
  const hinge = DIMS.body.doorHinge[s];
  return modelPart({
    id: `door-${s}`,
    name: `Door (${sideName(s)})`,
    group: 'body',
    description: 'Butterfly door hinged at the windscreen pillar. It swings up and out and takes a slice of the roof with it, so getting in over the wide sill is easier.',
    specs: {
      Type: 'Butterfly',
      Opens: `${fmtDeg(EXPLODE.door.pitch)} up, ${fmtDeg(EXPLODE.door.roll)} out`,
    },
    stage: 1,
    explodeRotation: [EXPLODE.door.pitch, 0, sideSign(s) * EXPLODE.door.roll],
    pivot: hinge,
    delay: BODY_DELAY.doors,
  });
}

function sideIntake(s: Side) {
  return modelPart({
    id: `side-intake-${s}`,
    name: `Side intake (${sideName(s)})`,
    group: 'cooling',
    description: 'Grille in the scoop behind the door, feeding air to the radiator in the side pod.',
    stage: 1,
    explodeOffset: [sideSign(s) * EXPLODE.sideIntakeOut, 0, 0],
    delay: BODY_DELAY.panels,
  });
}

type Corner = 'fl' | 'fr' | 'rl' | 'rr';
const CORNERS: Corner[] = ['fl', 'fr', 'rl', 'rr'];
const cornerName = (c: Corner) => `${c[0] === 'f' ? 'front' : 'rear'} ${sideName(c[1] as Side)}`;

function wheel(c: Corner) {
  const w = DIMS.wheel[c[0] === 'f' ? 'front' : 'rear'];
  const { widthMm, aspectPct, rimIn } = w.tyre;
  return modelPart({
    id: `wheel-${c}`,
    name: `Wheel (${cornerName(c)})`,
    group: 'wheels',
    description: 'Forged alloy wheel and low-profile tyre. The rears are much wider, to put the hybrid’s torque down.',
    specs: {
      Tyre: `${widthMm}/${aspectPct} R${rimIn}`,
      'Outer diameter': fmtMm(w.diameter),
      'Centre height': fmtMm(w.centreY),
      Track: fmtM(w.centreX * 2),
    },
    stage: 2,
    explodeOffset: [sideSign(c[1] as Side) * EXPLODE.wheelOut, 0, 0],
  });
}

function caliper(c: Corner) {
  const w = DIMS.wheel[c[0] === 'f' ? 'front' : 'rear'];
  return modelPart({
    id: `caliper-${c}`,
    name: `Brake caliper (${cornerName(c)})`,
    group: 'suspension',
    description: 'Monobloc brake caliper clamping a carbon-ceramic disc. Under braking the e-motor also recovers energy before the brakes do most of the work.',
    specs: { Disc: fmtMm(w.discDiameter, 0) },
    stage: 2,
    explodeOffset: [sideSign(c[1] as Side) * EXPLODE.caliperOut, 0, 0],
  });
}

export const bodyParts: PartDef[] = [
  modelPart({
    id: 'carbon-tub',
    name: 'Carbon tub & interior',
    group: 'chassis',
    description: 'Carbon-fibre monocoque: the passenger cell, with the seats moulded into it, and the backbone everything else mounts to. The engine hangs off its rear bulkhead.',
    specs: { Material: 'Carbon fibre' },
    stage: 1,
  }),
  door('l'),
  door('r'),
  modelPart({
    id: 'canopy',
    name: 'Roof & windscreen',
    group: 'body',
    description: 'Windscreen and roof, with the carbon trailing edge that carries the third brake light.',
    stage: 1,
    explodeOffset: EXPLODE.canopy,
    delay: BODY_DELAY.canopy,
  }),
  modelPart({
    id: 'front-clam',
    name: 'Front clam (bonnet)',
    group: 'body',
    description: 'Front lid over the crash structure and the ducts feeding the front of the car.',
    stage: 1,
    explodeOffset: EXPLODE.frontClam,
    delay: BODY_DELAY.panels,
  }),
  modelPart({
    id: 'nose',
    name: 'Nose & front wings',
    group: 'body',
    description: 'Front bumper and splitter, headlamps and front wings, shaped to feed air to the brakes and the underbody.',
    stage: 1,
    explodeOffset: EXPLODE.nose,
    delay: BODY_DELAY.panels,
  }),
  modelPart({
    id: 'engine-cover',
    name: 'Engine cover',
    group: 'body',
    description: 'Glass engine cover with black side rails and louvres, putting the V12 on display. Hot air from the bay escapes through the louvres.',
    stage: 1,
    explodeOffset: [0, EXPLODE.engineCoverLift, 0],
    explodeRotation: [EXPLODE.engineCoverTilt, 0, 0],
    pivot: DIMS.body.engineCoverHinge,
    delay: BODY_DELAY.engineCover,
  }),
  modelPart({
    id: 'rear-clam',
    name: 'Rear clam',
    group: 'body',
    description: 'Rear haunches, tail lamps and rear grille in one large panel that lifts away to expose the engine and gearbox.',
    stage: 1,
    explodeOffset: EXPLODE.rearClam,
    delay: BODY_DELAY.rearClam,
  }),
  modelPart({
    id: 'rear-wing',
    name: 'Rear wing',
    group: 'body',
    description: 'Active rear spoiler: it rises for downforce under braking and in corners, and lies flat on straights to cut drag.',
    stage: 1,
    explodeOffset: EXPLODE.rearWing,
    delay: BODY_DELAY.rearWing,
  }),
  sideIntake('l'),
  sideIntake('r'),
  modelPart({
    id: 'undertray-diffuser',
    name: 'Undertray & diffuser',
    group: 'body',
    description: 'Flat underbody and rear diffuser. The diffuser’s tunnels speed up the air under the car, pulling it down onto the road.',
    stage: 1,
    explodeOffset: [0, 0, -EXPLODE.diffuserBack],
    delay: BODY_DELAY.panels,
  }),
  ...CORNERS.map(wheel),
  ...CORNERS.map(caliper),
];
