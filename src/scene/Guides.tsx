import { Line } from '@react-three/drei';
import { DIMS, type Vec3 } from '../config/dims';
import { REFERENCE_LAYER } from '../config/scene';
import { fmtM } from '../lib/format';
import { TextSprite } from './TextSprite';

const AXIS_LENGTH = 0.6;
const LIFT = 0.003; // keep ground lines just above the grid
const AXIS_COLOURS = { x: '#ff5d5d', y: '#7bdc6a', z: '#5aa8ff' };
const GUIDE_COLOUR = '#5fd0ff';

/** Dev overlay: origin axes, axle lines and centreline, to check scale and orientation. */
export function Guides() {
  const { axle, track, body } = DIMS;
  return (
    <group>
      <GuideLine from={[0, LIFT, 0]} to={[AXIS_LENGTH, LIFT, 0]} colour={AXIS_COLOURS.x} label="+X (left)" />
      <GuideLine from={[0, LIFT, 0]} to={[0, AXIS_LENGTH, 0]} colour={AXIS_COLOURS.y} label="+Y (up)" />
      <GuideLine from={[0, LIFT, 0]} to={[0, LIFT, AXIS_LENGTH]} colour={AXIS_COLOURS.z} label="+Z (front)" />

      <GuideLine
        from={[-track.front / 2, LIFT, axle.frontZ]}
        to={[track.front / 2, LIFT, axle.frontZ]}
        colour={GUIDE_COLOUR}
        label={`front axle z ${fmtM(axle.frontZ)}`}
        dashed
      />
      <GuideLine
        from={[-track.rear / 2, LIFT, axle.rearZ]}
        to={[track.rear / 2, LIFT, axle.rearZ]}
        colour={GUIDE_COLOUR}
        label={`rear axle z ${fmtM(axle.rearZ)}`}
        dashed
      />
      <GuideLine from={[0, LIFT, body.rearZ]} to={[0, LIFT, body.frontZ]} colour={GUIDE_COLOUR} dashed />
    </group>
  );
}

function GuideLine({
  from,
  to,
  colour,
  label,
  dashed = false,
}: {
  from: Vec3;
  to: Vec3;
  colour: string;
  label?: string;
  dashed?: boolean;
}) {
  return (
    <>
      <Line
        points={[from, to]}
        color={colour}
        lineWidth={dashed ? 1 : 2}
        dashed={dashed}
        dashSize={0.06}
        gapSize={0.04}
        layers={REFERENCE_LAYER}
      />
      {label && <TextSprite text={label} colour={colour} position={to} layer={REFERENCE_LAYER} />}
    </>
  );
}
