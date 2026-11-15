import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { AdditiveBlending, DoubleSide, InstancedMesh, LatheGeometry, Matrix4, PointLight, ShaderMaterial, Vector2, Vector3 } from 'three';
import { DIMS } from '../config/dims';
import { ENGINE_SIM } from '../config/engine-sim';
import { partObjects } from '../scene/partObjects';
import { reducedMotion, sim } from '../state/engine';
import { useQuality } from '../state/quality';

/**
 * 9B exhaust flames: when the sim fires a pop (lifting off on boost at high revs, or the
 * limiter cutting in), a short flame from each outer tailpipe (the centre pipe is the
 * wastegates' and doesn't flame): a blue-white core turning orange, soft-edged, additive, a
 * little different in length each side, and a brief warm light on the rear bodywork. One
 * instanced mesh (one draw call, only while a flame shows) and one light (kept at zero
 * between pops: switching a light on or off would recompile every shader). Both ride on the
 * tailpipes part, so they follow it in the explode. Reduced motion: smaller, no light.
 */

const E = DIMS.engine;
const TP = E.tailpipe;
const F = ENGINE_SIM.flames;
/** The outer tips' mouths (engine coordinates), facing −z. */
const TIPS = [new Vector3(TP.sideX, TP.y, TP.exitZ), new Vector3(-TP.sideX, TP.y, TP.exitZ)];

function flameGeometry() {
  // Unit flame along +y (base 0, tip 1), then turned to point along −z.
  const profile: [number, number][] = [
    [0.62, 0],
    [1, 0.12],
    [0.92, 0.35],
    [0.62, 0.6],
    [0.28, 0.85],
    [0.02, 1],
  ];
  const g = new LatheGeometry(
    profile.map(([r, y]) => new Vector2(r, y)),
    16,
  );
  g.rotateX(-Math.PI / 2);
  return g;
}

function flameMaterial() {
  return new ShaderMaterial({
    uniforms: { uHot: { value: 1 }, uI: { value: 0 } },
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
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uHot;
      uniform float uI;
      varying float vT;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        // Soft edges: bright where the surface faces the eye, nothing at the rim.
        float soft = pow(abs(dot(normalize(vN), normalize(vV))), 2.2);
        float along = smoothstep(1.0, 0.45, vT) * smoothstep(0.0, 0.05, vT);
        // Blue-white only at the base while it is young; yellow-orange out to a red tip.
        vec3 core = vec3(0.55, 0.7, 1.6);
        vec3 yellow = vec3(1.5, 0.8, 0.25);
        vec3 orange = vec3(1.4, 0.35, 0.05);
        vec3 c = mix(yellow, orange, smoothstep(0.25, 0.9, vT));
        c = mix(c, core, uHot * (1.0 - smoothstep(0.0, 0.35, vT)));
        gl_FragColor = vec4(c * soft * along * uI, 1.0);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
  });
}

const m = new Matrix4();
const s = new Matrix4();

export function Flames() {
  const { mesh, light, material } = useMemo(() => {
    const material = flameMaterial();
    const mesh = new InstancedMesh(flameGeometry(), material, 2);
    mesh.frustumCulled = false;
    mesh.visible = false;
    mesh.castShadow = mesh.receiveShadow = false;
    mesh.userData.effect = true;
    mesh.renderOrder = 10;
    const light = new PointLight(F.light.color, 0, F.light.distance, 2);
    light.position.set(0, TP.y + 0.04, TP.exitZ - 0.1);
    light.castShadow = false;
    return { mesh, light, material };
  }, []);
  useEffect(
    () => () => {
      mesh.removeFromParent();
      light.removeFromParent();
      mesh.geometry.dispose();
      material.dispose();
    },
    [mesh, light, material],
  );
  useFrame(() => {
    const o = partObjects.get('tailpipes');
    if (!o) return;
    if (mesh.parent !== o.content) o.content.add(mesh);
    // The light only above the low tier: every lit material pays for it while it exists (one
    // recompile when it goes, if the tier drops).
    const lit = useQuality.getState().tier < 2;
    if (lit && light.parent !== o.content) o.content.add(light);
    else if (!lit && light.parent) light.removeFromParent();
    const age = sim.popLength > 0 ? (sim.t - sim.popAt) / sim.popLength : Infinity;
    const on = sim.phase !== 'off' && age >= 0 && age < 1;
    mesh.visible = on;
    const lightOn = on && !reducedMotion && lit;
    light.intensity = lightOn ? F.light.intensity * sim.popStrength * Math.max(0, 1 - age) ** 1.5 : 0;
    if (!on) return;
    // Out fast, then shrinks and cools.
    const env = age < F.rise ? age / F.rise : 1 - (age - F.rise) / (1 - F.rise);
    const small = reducedMotion ? F.reducedScale : 1;
    material.uniforms.uHot.value = 1 - Math.min(1, age / F.coolAt);
    material.uniforms.uI.value = F.intensity * (0.5 + 0.5 * sim.popStrength) * Math.min(1, env * 1.6);
    TIPS.forEach((tip, k) => {
      // Each side a little different, but the same every time this pop is replayed.
      const vary = 1 + F.sideVary * Math.sin(sim.pops * 12.9898 + k * 78.233);
      const length = sim.popFlame * env * vary * small;
      const width = F.width * (0.7 + 0.3 * sim.popStrength) * (0.6 + 0.4 * env) * small;
      mesh.setMatrixAt(k, m.makeTranslation(tip.x, tip.y, tip.z).multiply(s.makeScale(width, width, Math.max(0.001, length))));
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return null;
}
