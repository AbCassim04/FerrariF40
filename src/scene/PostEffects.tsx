import { EffectComposer, N8AO, SMAA, ToneMapping } from '@react-three/postprocessing';
import { N8AOPostPass } from 'n8ao';
import { ToneMappingMode } from 'postprocessing';
import type { WebGLRenderTarget } from 'three';
import { SCENE } from '../config/scene';
import { PartOutline } from './Inspect';

/**
 * Compatibility fix for n8ao 2.0.1 on three r187: its half-resolution depth target (a
 * two-texture render target) overrides `texture` to return the whole texture array,
 * while three expects the first texture there. Restore three's accessor on that target.
 */
type HalfResPass = { configureHalfResTargets: () => void; depthDownsampleTarget?: WebGLRenderTarget };
const proto = N8AOPostPass.prototype as unknown as HalfResPass;
const configureHalfResTargets = proto.configureHalfResTargets;
proto.configureHalfResTargets = function (this: HalfResPass) {
  configureHalfResTargets.call(this);
  const target = this.depthDownsampleTarget;
  if (target) {
    Object.defineProperty(target, 'texture', {
      configurable: true,
      get: () => target.textures[0],
      set: (t) => (target.textures[0] = t),
    });
  }
};

const { post } = SCENE;
/** Dev: `?ao=0` turns the ambient occlusion off (before/after shots), `?tone=aces|agx` overrides the tone mapping. */
const params = new URLSearchParams(location.search);
const AO_ON = !(import.meta.env.DEV && params.get('ao') === '0');
const TONE = (import.meta.env.DEV && params.get('tone')) || post.toneMapping;
/** Dev: `?aoView=1` shows the AO buffer alone (N8AO's debug render mode). */
const AO_VIEW = import.meta.env.DEV && params.get('aoView') === '1';
const AO_HALF = import.meta.env.DEV && params.has('aoHalf') ? params.get('aoHalf') === '1' : post.ao.halfRes;
const MSAA = import.meta.env.DEV && params.has('msaa') ? Number(params.get('msaa')) : post.multisampling;

/**
 * Screen-space ambient occlusion (N8AO at half resolution: it darkens the engine's
 * crevices and contact lines, which environment lighting alone leaves flat), the final
 * tone mapping, the outline round hovered and inspected parts, and SMAA. The renderer's own tone mapping is off while this is mounted.
 */
export function PostEffects() {
  const { ao } = post;
  return (
    <EffectComposer multisampling={MSAA}>
      <N8AO
        ref={(pass) => {
          if (!pass) return;
          // Gamma is applied once, at the end of the chain; N8AO would apply it too.
          pass.configuration.gammaCorrection = false;
          // N8AO turns this on by itself when anything in the scene is transparent, and then
          // re-renders every transparent mesh in two extra passes: with X-ray or an inspect,
          // that is hundreds of ghost shells. The glass and ghosts are see-through anyway.
          pass.configuration.transparencyAware = false;
        }}
        enabled={AO_ON}
        halfRes={AO_HALF}
        quality={ao.quality}
        aoRadius={ao.radius}
        distanceFalloff={ao.distanceFalloff}
        intensity={ao.intensity}
        renderMode={AO_VIEW ? 1 : 0}
      />
      <ToneMapping mode={TONE === 'aces' ? ToneMappingMode.ACES_FILMIC : ToneMappingMode.AGX} />
      <PartOutline />
      <SMAA />
    </EffectComposer>
  );
}
