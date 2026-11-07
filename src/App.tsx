import { Canvas } from '@react-three/fiber';
import { SCENE } from './config/scene';
import { Experience } from './scene/Experience';
import { DevPanel } from './ui/DevPanel';
import { ExplodeButton } from './ui/ExplodeButton';

const { camera } = SCENE;

export function App() {
  return (
    <div className="app">
      <Canvas
        shadows="percentage"
        dpr={[1, 2]}
        gl={{ antialias: true }}
        camera={{ fov: camera.fov, near: camera.near, far: camera.far, position: [...camera.position] }}
      >
        <Experience />
      </Canvas>
      <ExplodeButton />
      {import.meta.env.DEV && <DevPanel />}
    </div>
  );
}
