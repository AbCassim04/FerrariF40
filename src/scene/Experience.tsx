import { Stats } from '@react-three/drei';
import { Suspense } from 'react';
import { BodyModelSetup } from '../body/BodyModel';
import { SCENE } from '../config/scene';
import { ExplodeController } from '../explode/ExplodeController';
import { useAppStore } from '../state/store';
import { CameraRig } from './CameraRig';
import { ClashCheck } from './ClashCheck';
import { Ground } from './Ground';
import { Guides } from './Guides';
import { Lighting } from './Lighting';
import { PartLabels } from './PartLabels';
import { PartsRenderer } from './PartsRenderer';

const DEV = import.meta.env.DEV;

/**
 * Everything inside the Canvas. Parts and the explode controller share one Suspense
 * boundary, so the timeline is only built once the body model has loaded and every
 * part has registered.
 */
export function Experience() {
  const showGuides = useAppStore((s) => s.showGuides);
  const showLabels = useAppStore((s) => s.showLabels);
  return (
    <>
      <color attach="background" args={[SCENE.background]} />
      <Lighting />
      <Ground />
      <Suspense fallback={null}>
        <BodyModelSetup />
        <PartsRenderer />
        <ExplodeController />
        {DEV && showLabels && <PartLabels />}
        {DEV && <ClashCheck />}
      </Suspense>
      <CameraRig />
      {DEV && showGuides && <Guides />}
      {DEV && <Stats className="stats" />}
    </>
  );
}
