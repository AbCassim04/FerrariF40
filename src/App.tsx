import { Canvas } from '@react-three/fiber';
import { useRef, type CSSProperties } from 'react';
import { SCENE } from './config/scene';
import { Experience } from './scene/Experience';
import { claimedClicks } from './scene/partObjects';
import { useAppStore } from './state/store';
import { Credits } from './ui/Credits';
import { DevPanel } from './ui/DevPanel';
import { ExplodeButton } from './ui/ExplodeButton';
import { HoverTooltip } from './ui/HoverTooltip';
import { InspectPanel } from './ui/InspectPanel';
import { XrayToggle } from './ui/XrayToggle';

const { camera, inspect } = SCENE;
/** Pointer travel (px) that turns a click on empty space into a drag (orbit), which keeps the panel open. */
const DRAG = 4;
/** Dev: `?panel=0` hides the dev panel (product shots). */
const HIDE_DEV_PANEL = import.meta.env.DEV && new URLSearchParams(location.search).get('panel') === '0';

export function App() {
  const inspecting = useAppStore((s) => s.selectedId !== null);
  const down = useRef({ x: 0, y: 0 });
  return (
    <div
      className="app"
      data-inspecting={inspecting || undefined}
      style={{ '--panel-w': `${inspect.panelWidth}px`, '--sheet-h': `${inspect.sheetHeight * 100}vh` } as CSSProperties}
      onPointerDown={(e) => (down.current = { x: e.clientX, y: e.clientY })}
      onClick={(e) => {
        // A click on the canvas that no part claimed is a click on empty space.
        const moved = Math.hypot(e.clientX - down.current.x, e.clientY - down.current.y);
        if (e.target instanceof HTMLCanvasElement && !claimedClicks.has(e.nativeEvent) && moved < DRAG) useAppStore.getState().select(null);
      }}
    >
      <Canvas
        shadows="percentage"
        dpr={[1, 2]}
        gl={{ antialias: true }}
        camera={{ fov: camera.fov, near: camera.near, far: camera.far, position: [...camera.position] }}
      >
        <Experience />
      </Canvas>
      <div className="controls">
        <ExplodeButton />
        <XrayToggle />
      </div>
      <InspectPanel />
      <HoverTooltip />
      <Credits />
      {import.meta.env.DEV && !HIDE_DEV_PANEL && <DevPanel />}
    </div>
  );
}
