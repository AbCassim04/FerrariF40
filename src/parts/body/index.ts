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
    description: 'Butterfly door with its glass and the roof section it carries.',
    specs: {
      Hinge: `(${hinge.map((v) => v.toFixed(3)).join(', ')})`,
      Swing: `${fmtDeg(EXPLODE.door.pitch)} up, ${fmtDeg(EXPLODE.door.roll)} out`,
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
    description: 'Intake grille feeding the side-mounted radiator.',
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
    description: 'Forged wheel and tyre.',
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
    description: 'Monobloc caliper clamping the carbon-ceramic disc.',
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
    description: 'Monocoque with the seats moulded in, plus the interior and the structure the other panels mount to. Stays put.',
    stage: 1,
  }),
  door('l'),
  door('r'),
  modelPart({
    id: 'canopy',
    name: 'Roof & windscreen',
    group: 'body',
    description: 'Windscreen and roof, including the carbon trailing edge with the third brake light.',
    stage: 1,
    explodeOffset: EXPLODE.canopy,
    delay: BODY_DELAY.canopy,
  }),
  modelPart({
    id: 'front-clam',
    name: 'Front clam (bonnet)',
    group: 'body',
    description: 'Front lid over the crash structure.',
    stage: 1,
    explodeOffset: EXPLODE.frontClam,
    delay: BODY_DELAY.panels,
  }),
  modelPart({
    id: 'nose',
    name: 'Nose & front wings',
    group: 'body',
    description: 'Front bumper, splitter, headlamps and front wings.',
    stage: 1,
    explodeOffset: EXPLODE.nose,
    delay: BODY_DELAY.panels,
  }),
  modelPart({
    id: 'engine-cover',
    name: 'Engine cover',
    group: 'body',
    description: 'Glass engine cover with its black side rails and louvres, showing the V12 underneath. Lifts first and highest.',
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
    description: 'Rear haunches, tail and lamps.',
    stage: 1,
    explodeOffset: EXPLODE.rearClam,
    delay: BODY_DELAY.rearClam,
  }),
  modelPart({
    id: 'rear-wing',
    name: 'Rear wing',
    group: 'body',
    description: 'Active rear spoiler.',
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
    description: 'Rear diffuser and underbody aero.',
    stage: 1,
    explodeOffset: [0, 0, -EXPLODE.diffuserBack],
    delay: BODY_DELAY.panels,
  }),
  ...CORNERS.map(wheel),
  ...CORNERS.map(caliper),
];
