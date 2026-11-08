import { Environment, Lightformer } from '@react-three/drei';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { SCENE } from '../config/scene';

RectAreaLightUniformsLib.init();

const { bayLight } = SCENE;

/**
 * Dark studio: a procedural softbox environment (no HDR download) for reflections,
 * one shadow-casting key light, and soft display strips in the engine bay.
 */
export function Lighting() {
  return (
    <>
      <Environment resolution={256} frames={1} environmentIntensity={0.9}>
        {/* Dim studio walls, so metals always have something to reflect */}
        <color attach="background" args={['#2a2e35']} />
        {/* Overhead softbox */}
        <Lightformer form="rect" intensity={3} position={[0, 6, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[12, 5, 1]} />
        {/* Side strips for long highlights down the flanks */}
        <Lightformer form="rect" intensity={1.2} position={[-7, 2.5, 0]} rotation={[0, Math.PI / 2, 0]} scale={[10, 2, 1]} />
        <Lightformer form="rect" intensity={1.2} position={[7, 2.5, 0]} rotation={[0, -Math.PI / 2, 0]} scale={[10, 2, 1]} />
        {/* Front fill and rear rim */}
        <Lightformer form="rect" intensity={0.6} position={[0, 2, 9]} scale={[8, 2, 1]} />
        <Lightformer form="ring" intensity={2} position={[-4, 4, -8]} scale={3} />
        {/* Faint floor bounce for undersides */}
        <Lightformer form="rect" intensity={0.3} position={[0, -3, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[12, 12, 1]} />
      </Environment>

      <directionalLight
        castShadow
        position={[3.5, 7, 4.5]}
        intensity={1.6}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0002}
        shadow-normalBias={0.02}
      >
        <orthographicCamera attach="shadow-camera" args={[-4, 4, 4, -4, 0.5, 20]} />
      </directionalLight>

      {/* Each faces down (its −z) onto the engine from just under the cover glass. */}
      {[1, -1].map((side) => (
        <rectAreaLight
          key={side}
          args={[bayLight.colour, bayLight.intensity, ...bayLight.size]}
          position={[side * bayLight.x, bayLight.y, bayLight.z]}
          rotation={[-Math.PI / 2, 0, 0]}
        />
      ))}
    </>
  );
}
