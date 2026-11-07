import { CameraControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Box3, Vector3 } from 'three';
import { REFERENCE_LAYER, SCENE } from '../config/scene';

const { camera: view, controls } = SCENE;

/**
 * Damped orbit controls with zoom limits. The orbit target is boxed above the ground
 * (so panning can't sink it) and the polar limit keeps the camera above the target,
 * so the camera never dips below the floor in any control mode.
 */
export function CameraRig() {
  const ref = useRef<CameraControls>(null);
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    camera.layers.enable(REFERENCE_LAYER);
    const c = ref.current;
    if (!c) return;
    c.setBoundary(new Box3(new Vector3(...controls.targetBounds.min), new Vector3(...controls.targetBounds.max)));
    c.setLookAt(...view.position, ...view.target, false);
  }, [camera]);

  return (
    <CameraControls
      ref={ref}
      makeDefault
      minDistance={controls.minDistance}
      maxDistance={controls.maxDistance}
      maxPolarAngle={controls.maxPolarAngle}
      smoothTime={controls.smoothTime}
    />
  );
}
