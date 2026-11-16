import { Stats } from '@react-three/drei';
import { Suspense } from 'react';
import { BodyModelSetup, EngineBayGhost } from '../body/BodyModel';
import { SCENE } from '../config/scene';
import { DevApi } from '../dev/DevApi';
import { EngineController } from '../engine/EngineController';
import { EngineEffects } from '../engine/EngineEffects';
import { Flames } from '../engine/Flames';
import { GasFlow } from '../engine/GasFlow';
import { Doors } from '../engine/Doors';
import { Gauges } from '../engine/Gauges';
import { Lights } from '../engine/Lights';
import { ExplodeController } from '../explode/ExplodeController';
import { useAppStore } from '../state/store';
import { CabinWatch } from './CabinWatch';
import { CameraRig } from './CameraRig';
import { ClashCheck } from './ClashCheck';
import { Enclosed } from './Enclosed';
import { EnvironmentLevels } from './EnvironmentLevels';
import { Ground } from './Ground';
import { InspectController } from './Inspect';
import { Guides } from './Guides';
import { Lighting } from './Lighting';
import { PartLabels } from './PartLabels';
import { PartsRenderer } from './PartsRenderer';
import { PerfProbe } from './PerfProbe';
import { PostEffects } from './PostEffects';
import { QualityController } from './QualityController';
import { ShadowScheduler } from './ShadowScheduler';

const DEV = import.meta.env.DEV;
/** Dev: `?panel=0` (product and review shots) also hides the frame-rate meter. */
const STATS = DEV && new URLSearchParams(location.search).get('panel') !== '0';

/**
 * Everything inside the Canvas. Parts and the explode controller share one Suspense
 * boundary, so the timeline is only built once the body model has loaded and every
 * part has registered.
 */
export function Experience() {
  const showGuides = useAppStore((s) => s.showGuides);
  const showLabels = useAppStore((s) => s.showLabels);
  const showGhost = useAppStore((s) => s.showGhost);
  return (
    <>
      <color attach="background" args={[SCENE.background]} />
      <Lighting />
      <Ground />
      <Suspense fallback={null}>
        <BodyModelSetup />
        <PartsRenderer />
        <ExplodeController />
        <Enclosed />
        <ShadowScheduler />
        <EnvironmentLevels />
        <InspectController />
        <EngineController />
        <EngineEffects />
        <Flames />
        <GasFlow />
        <Gauges />
        <Lights />
        <Doors />
        {DEV && showLabels && <PartLabels />}
        {DEV && <ClashCheck />}
        {DEV && showGhost && <EngineBayGhost />}
      </Suspense>
      <CameraRig />
      <CabinWatch />
      <QualityController />
      {DEV && <DevApi />}
      <PostEffects />
      {DEV && showGuides && <Guides />}
      {STATS && <Stats className="stats" />}
      {DEV && <PerfProbe />}
    </>
  );
}
