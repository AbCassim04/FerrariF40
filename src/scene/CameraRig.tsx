import { CameraControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { REFERENCE_LAYER, SCENE } from '../config/scene';

const { camera: view, controls } = SCENE;

/** Damped orbit controls with zoom limits; the camera never dips below the ground. */
export function CameraRig() {
  const ref = useRef<CameraControls>(null);
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    camera.layers.enable(REFERENCE_LAYER);
    ref.current?.setLookAt(...view.position, ...view.target, false);
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
