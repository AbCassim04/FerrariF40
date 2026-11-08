import { CameraControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Box3, Vector3, type PerspectiveCamera } from 'three';
import { REFERENCE_LAYER, SCENE } from '../config/scene';
import { useAppStore } from '../state/store';
import { fitView } from './fitView';

const { camera: initial, controls } = SCENE;

/**
 * Damped orbit controls with zoom limits. The orbit target is boxed above the ground
 * (so panning can't sink it) and the polar limit keeps the camera above the target,
 * so the camera never dips below the floor in any control mode.
 */
export function CameraRig() {
  const ref = useRef<CameraControls>(null);
  const camera = useThree((s) => s.camera);
  const view = useAppStore((s) => s.view);
  const fit = useAppStore((s) => s.cameraFit);
  const saved = useRef<{ position: Vector3; target: Vector3 } | null>(null);

  useEffect(() => {
    camera.layers.enable(REFERENCE_LAYER);
    const c = ref.current;
    if (!c) return;
    c.setBoundary(new Box3(new Vector3(...controls.targetBounds.min), new Vector3(...controls.targetBounds.max)));
    const start = useAppStore.getState().devCamera ?? initial;
    c.setLookAt(...start.position, ...start.target, false);
  }, [camera]);

  useEffect(() => {
    if (!view) return;
    const v = SCENE.views[view.name];
    // The very first request (from the URL) snaps; later ones ease.
    ref.current?.setLookAt(...v.position, ...v.target, view.seq > 0);
  }, [view]);

  useEffect(() => {
    const c = ref.current;
    if (!fit || !c) return;
    if (!fit.box) {
      // Back to the view from before the explode.
      if (saved.current) c.setLookAt(...saved.current.position.toArray(), ...saved.current.target.toArray(), true);
      saved.current = null;
      return;
    }
    const from = c.getPosition(new Vector3(), true);
    const to = c.getTarget(new Vector3(), true);
    if (fit.remember && !saved.current) saved.current = { position: from.clone(), target: to.clone() };
    const box = new Box3(new Vector3(...fit.box[0]), new Vector3(...fit.box[1]));
    const { position, target } = fitView(box, from, to, camera as PerspectiveCamera, controls.fitPadding);
    c.setLookAt(...position.toArray(), ...target.toArray(), true);
  }, [fit, camera]);

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
