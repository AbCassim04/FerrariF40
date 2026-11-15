import { Canvas } from '@react-three/fiber';
import { useRef, type CSSProperties } from 'react';
import { SCENE } from './config/scene';
import { Experience } from './scene/Experience';
import { claimedClicks } from './scene/partObjects';
import { tap, tapSlop } from './scene/taps';
import { useEngineStore } from './state/engine';
import { tierOf, useQuality } from './state/quality';
import { useUiStore } from './state/ui';
import { useAppStore } from './state/store';
import { CameraButtons } from './ui/CameraButtons';
import { ControlBar } from './ui/ControlBar';
import { Credits } from './ui/Credits';
import { FlowCaption } from './ui/FlowCaption';
import { DynoGraph } from './ui/DynoGraph';
import { DevPanel } from './ui/DevPanel';
import { EngineKeys, VolumeSync } from './ui/EngineControls';
import { HoverTooltip } from './ui/HoverTooltip';
import { InspectPanel } from './ui/InspectPanel';
import { SoundHint } from './ui/SoundHint';

const { camera, inspect } = SCENE;
/** Dev: `?panel=0` hides the dev panel (product shots). */
const HIDE_DEV_PANEL = import.meta.env.DEV && new URLSearchParams(location.search).get('panel') === '0';
/** The pixel ratio the first frame renders at (the quality controller keeps it in step with the tier). */
const START_DPR = Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, tierOf(useQuality.getState().tier).dpr);

export function App() {
  const inspecting = useAppStore((s) => s.selectedId !== null);
  const running = useEngineStore((s) => s.engineRunning);
  const compact = useUiStore((s) => s.compact);
  const down = useRef({ x: 0, y: 0 });
  return (
    <div
      className="app"
      data-inspecting={inspecting || undefined}
      data-driving={(running && !compact) || undefined}
      style={{ '--panel-w': `${inspect.panelWidth}px`, '--sheet-h': `${inspect.sheetHeight * 100}dvh` } as CSSProperties}
      onPointerDown={(e) => (down.current = { x: e.clientX, y: e.clientY })}
      onClick={(e) => {
        // A tap on the canvas that no part claimed is a tap on empty space: it closes the panel
        // (unless it turns out to be a double tap, or it was a drag).
        const moved = Math.hypot(e.clientX - down.current.x, e.clientY - down.current.y);
        if (e.target instanceof HTMLCanvasElement && !claimedClicks.has(e.nativeEvent) && moved < tapSlop(e.nativeEvent)) {
          tap(e.nativeEvent, () => useAppStore.getState().select(null));
        }
      }}
    >
      <Canvas shadows="percentage" dpr={START_DPR} gl={{ antialias: true }} camera={{ fov: camera.fov, near: camera.near, far: camera.far, position: [...camera.position] }}>
        <Experience />
      </Canvas>
      <CameraButtons />
      <ControlBar />
      <InspectPanel />
      <HoverTooltip />
      <DynoGraph />
      <Credits />
      <SoundHint />
      <FlowCaption />
      <EngineKeys />
      <VolumeSync />
      {import.meta.env.DEV && !HIDE_DEV_PANEL && <DevPanel />}
    </div>
  );
}
