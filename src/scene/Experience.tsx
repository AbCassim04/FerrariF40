import { Stats } from '@react-three/drei';
import { SCENE } from '../config/scene';
import { ExplodeController } from '../explode/ExplodeController';
import { useAppStore } from '../state/store';
import { CameraRig } from './CameraRig';
import { Ground } from './Ground';
import { Guides } from './Guides';
import { Lighting } from './Lighting';
import { PartLabels } from './PartLabels';
import { PartsRenderer } from './PartsRenderer';

const DEV = import.meta.env.DEV;

/** Everything inside the Canvas. Order matters: parts mount before the explode controller. */
export function Experience() {
  const showGuides = useAppStore((s) => s.showGuides);
  const showLabels = useAppStore((s) => s.showLabels);
  return (
    <>
      <color attach="background" args={[SCENE.background]} />
      <Lighting />
      <Ground />
      <PartsRenderer />
      <ExplodeController />
      <CameraRig />
      {DEV && showGuides && <Guides />}
      {DEV && showLabels && <PartLabels />}
      {DEV && <Stats className="stats" />}
    </>
  );
}
