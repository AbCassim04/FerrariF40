import { useFrame, useThree } from '@react-three/fiber';
import { SCENE } from '../config/scene';
import { useAppStore } from '../state/store';

const { min, max } = SCENE.cabin;

/** Phase 9 fix-up: tells the UI whether the camera's eye is inside the cabin (the cockpit view). */
export function CabinWatch() {
  const camera = useThree((s) => s.camera);
  useFrame(() => {
    const p = camera.position;
    const inside = p.x > min[0] && p.x < max[0] && p.y > min[1] && p.y < max[1] && p.z > min[2] && p.z < max[2];
    if (useAppStore.getState().inCabin !== inside) useAppStore.setState({ inCabin: inside });
  });
  return null;
}
