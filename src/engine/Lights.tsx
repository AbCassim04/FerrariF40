import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { AdditiveBlending, ConeGeometry, InstancedMesh, Matrix4, Quaternion, ShaderMaterial, Vector3, type Material, type Mesh, type MeshStandardMaterial } from 'three';
import { BODY_URL } from '../body/BodyModel';
import { LIGHTS } from '../config/details';
import { partObjects } from '../scene/partObjects';
import { reducedMotion, sim } from '../state/engine';
import { useAppStore } from '../state/store';

/**
 * 9C lights ("Lights" in "more", key L). The pop-up pods (split from the body model's front
 * clam, see body-rules) turn up about their hinge and their lamps light, with a soft beam glow
 * ahead of each; the parking lamps behind the front covers and the tail lamps light. Whatever
 * the switch: the brake lamps follow the brake pedal, the reverse lamps light in R. The body
 * model's lamp materials are kept out of the per-part merge (BodyModel `LAMPS`) so their glow
 * can change; the pod lamps get their own copy of the head-lamp material.
 */

const L = LIGHTS;
const DEG = Math.PI / 180;
const X = new Vector3(1, 0, 0);
const hinge = new Vector3(...L.pod.hinge);
const ease = (t: number) => t * t * (3 - 2 * t);

/** The animated state: how far up the pods are (0…1). */
export const lightState = { raise: 0 };

function beamMaterial() {
  return new ShaderMaterial({
    uniforms: { uI: { value: 0 } },
    vertexShader: /* glsl */ `
      varying float vT;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vT = uv.y;
        vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * mat3(instanceMatrix) * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uI;
      varying float vT;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        float face = pow(abs(dot(normalize(vN), normalize(vV))), 1.5);
        // Bright at the lamp (the cone's tip end), fading out along the beam.
        float along = pow(clamp(vT, 0.0, 1.0), 2.2);
        gl_FragColor = vec4(vec3(1.0, 0.93, 0.8) * face * along * uI, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
  });
}

const tmp = new Matrix4();
const q = new Quaternion();

export function Lights() {
  const on = useAppStore((s) => s.lights);
  const gltf = useGLTF(BODY_URL, false, true);
  const mats = gltf.materials as Record<string, MeshStandardMaterial>;
  const podLamp = useMemo(() => {
    const m = mats[L.materials.head]?.clone();
    if (m) m.name = 'pod-lamp';
    return m ?? null;
  }, [mats]);
  const beams = useMemo(() => {
    // A cone along −y (tip at the lamp), turned to point along +z.
    const g = new ConeGeometry(L.beam.radius, L.beam.length, 20, 1, true).translate(0, -L.beam.length / 2, 0).rotateX(-Math.PI / 2);
    const mesh = new InstancedMesh(g, beamMaterial(), 2);
    mesh.frustumCulled = false;
    mesh.visible = false;
    mesh.renderOrder = 10;
    mesh.userData.effect = true;
    mesh.castShadow = mesh.receiveShadow = false;
    return mesh;
  }, []);
  useEffect(
    () => () => {
      beams.removeFromParent();
      beams.geometry.dispose();
      (beams.material as Material).dispose();
      podLamp?.dispose();
    },
    [beams, podLamp],
  );
  const state = useMemo(() => ({ podsSwapped: new WeakSet<object>(), base: new Map<string, { p: Vector3; q: Quaternion }>() }), []);

  useFrame(({ scene }, dt) => {
    // Pods: up when the lights are on, a turn about the hinge.
    const target = on ? 1 : 0;
    const speed = 1 / (target > lightState.raise ? L.pod.upS : L.pod.downS);
    lightState.raise = reducedMotion ? target : Math.min(1, Math.max(0, lightState.raise + Math.sign(target - lightState.raise) * speed * Math.min(dt, 0.1)));
    const angle = -L.pod.raiseDeg * DEG * ease(lightState.raise);
    for (const s of ['l', 'r'] as const) {
      const o = partObjects.get(`pod-${s}`);
      if (!o) continue;
      const c = o.content;
      if (!state.base.has(c.uuid)) state.base.set(c.uuid, { p: c.position.clone(), q: c.quaternion.clone() });
      const base = state.base.get(c.uuid)!;
      // About the hinge line in car coordinates (the pods' frame): p' = h + R (p − h).
      q.setFromAxisAngle(X, angle);
      c.quaternion.copy(q).multiply(base.q);
      c.position.copy(base.p).sub(hinge).applyQuaternion(q).add(hinge);
      // The pod lamps: their own copy of the head-lamp material.
      if (podLamp && !state.podsSwapped.has(c)) {
        state.podsSwapped.add(c);
        c.traverse((x) => {
          const mesh = x as Mesh;
          if (mesh.isMesh && (mesh.material as Material).name === L.materials.head) mesh.material = podLamp;
        });
      }
    }
    const lit = on && lightState.raise > 0.85;
    if (podLamp) glow(podLamp, L.head.colour, lit ? L.head.intensity : 0);
    glow(mats[L.materials.head], L.parking.colour, on ? L.parking.intensity : 0);
    const braking = sim.phase !== 'off' && sim.brake > L.brake.brakeFrom;
    glow(mats[L.materials.tail], L.tail.colour, braking ? L.brake.intensity : on ? L.tail.intensity : 0);
    glow(mats[L.materials.reverse], L.reverse.colour, sim.phase !== 'off' && sim.gear === -1 ? L.reverse.intensity : 0);
    // Beams ahead of the lit pod lamps.
    if (beams.parent !== scene) scene.add(beams);
    beams.visible = lit;
    if (lit) {
      (beams.material as ShaderMaterial).uniforms.uI.value = L.beam.intensity * (lightState.raise - 0.85) / 0.15;
      (['l', 'r'] as const).forEach((s, k) => {
        const o = partObjects.get(`pod-${s}`);
        if (!o) return;
        const lamp = new Vector3(s === 'l' ? L.podLamp[0] : -L.podLamp[0], L.podLamp[1], L.podLamp[2]);
        // The lamp's place and the pod's turn, in the pod's frame, then to the world.
        beams.setMatrixAt(k, tmp.copy(o.content.matrixWorld).multiply(new Matrix4().makeRotationX(L.pod.raiseDeg * DEG).setPosition(lamp)));
      });
      beams.instanceMatrix.needsUpdate = true;
    }
  });
  return null;
}

/** Sets a lamp material's glow (only when it changes: no shader recompiles, emissive is always there). */
function glow(m: MeshStandardMaterial | undefined, colour: string, intensity: number) {
  if (!m) return;
  if (m.userData.glowColour !== colour) {
    m.emissive.set(colour);
    m.userData.glowColour = colour;
  }
  if (m.emissiveIntensity !== intensity) m.emissiveIntensity = intensity;
}
