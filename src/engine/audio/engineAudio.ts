import { SOUND } from '../../config/sound';
import { CYLINDERS, firingAngle, SIDES } from '../../parts/engine/layout';
import type { SimState } from '../sim';
import type { SynthParamName } from './processor';
import type { Cylinder } from './synth';
import processorUrl from './processor.ts?worker&url';

/**
 * The engine's sound: an AudioWorklet synth (./synth.ts) driven by the sim's state once a
 * frame, then a compressor and the volume. The AudioContext is only created (or resumed) by
 * the Start click: browsers don't let a page make sound before a user gesture, and nothing
 * loads until then. Hidden tab: ducked to silence (the sim pauses too); back in view (or at
 * the next touch, after a system interruption) the context resumes. iOS: the audio session
 * is set to 'playback' where supported, so the silent switch doesn't mute it.
 */

/** Each cylinder's firing TDC within the 720° cycle and its bank, for the worklet. */
export const CYLINDER_EVENTS: Cylinder[] = SIDES.flatMap((s) => CYLINDERS.map((i): Cylinder => ({ firing: firingAngle(s, i), bank: s === 'l' ? 0 : 1 })));

/**
 * After the synth (whose own compressor and limiter end its chain): only the volume, with
 * mute and the hidden-tab duck. Never above 1, so nothing can pass the synth's ceiling.
 */
export function masterChain(ctx: BaseAudioContext, input: AudioNode, level = 0) {
  const gain = new GainNode(ctx, { gain: level });
  input.connect(gain).connect(ctx.destination);
  return { gain };
}

/** Loads the worklet module into a context and makes the synth node. */
export async function createSynthNode(ctx: BaseAudioContext) {
  await ctx.audioWorklet.addModule(processorUrl);
  return new AudioWorkletNode(ctx, 'f40-engine', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    processorOptions: { cylinders: CYLINDER_EVENTS },
  });
}

/** The synth's inputs from the sim. */
export const synthValues = (sim: SimState): Record<SynthParamName, number> => ({
  rpm: sim.rpm,
  throttle: sim.throttle,
  boost: sim.boost,
  firing: sim.firing ? 1 : 0,
  starter: sim.starter ? 1 : 0,
});

/** Sets the synth's params at `time` (live: now; offline: along a scripted run). */
export function setSynth(node: AudioWorkletNode, values: Record<SynthParamName, number>, time: number) {
  for (const [name, v] of Object.entries(values)) node.parameters.get(name)?.setValueAtTime(v, time);
}

let ctx: AudioContext | null = null;
let node: AudioWorkletNode | null = null;
let gain: GainNode | null = null;
let loading: Promise<void> | null = null;
let volume = 0.7;
let muted = false;
let hidden = false;
let offFor = 0;
/** The engine is on (not off): the context should be running. */
let wanted = false;

/** iOS 17+ (and Safari 16.4+): the audio session's category; 'playback' plays through the ringer's silent switch. */
type AudioSessionNavigator = Navigator & { audioSession?: { type: string } };
const session = () => (typeof navigator === 'undefined' ? undefined : (navigator as AudioSessionNavigator).audioSession);
/** iPhone or iPad (iPadOS reports a Mac with touch). */
const appleTouch = () => typeof navigator !== 'undefined' && (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
const HINT_KEY = 'f40.silentSwitchHint';
let hintListener: (() => void) | null = null;

/** A context the system suspended or interrupted (tab or app in the background, a call): back on while the engine runs. */
function wake() {
  if (ctx && wanted && !hidden && ctx.state !== 'running') void ctx.resume().catch(() => {});
}

const level = () => (muted || hidden ? SOUND.master.duckHidden : volume * volume);

function applyLevel() {
  if (!ctx || !gain) return;
  const t = ctx.currentTime;
  gain.gain.cancelScheduledValues(t);
  gain.gain.setTargetAtTime(level(), t, SOUND.master.ramp / 3);
}

export const engineAudio = {
  /** On the Start click: create the context (the first time) or resume it. */
  async start() {
    if (typeof AudioContext === 'undefined') return;
    wanted = true;
    // Play like a media app: on iOS this sounds even with the ringer switched to silent.
    const audioSession = session();
    if (audioSession) {
      try {
        audioSession.type = 'playback';
      } catch {
        /* not settable here */
      }
    }
    if (!ctx) {
      ctx = new AudioContext({ latencyHint: 'interactive', sampleRate: SOUND.sampleRate });
      const c = ctx;
      // Interrupted or suspended by the system: resume at the next touch (iOS wants a gesture) or when the page is shown.
      c.addEventListener('statechange', wake);
      window.addEventListener('pointerdown', wake, { capture: true });
      window.addEventListener('pageshow', wake);
      loading = (async () => {
        try {
          node = await createSynthNode(c);
          gain = masterChain(c, node).gain;
          applyLevel();
        } catch (e) {
          console.warn('[engine audio] unavailable:', e);
        }
      })();
    }
    offFor = 0;
    if (ctx.state !== 'running') await ctx.resume().catch(() => {});
    await loading;
    // Older iOS can't route past the silent switch: say so once, if sound is likely muted by it.
    if (!audioSession && appleTouch() && ctx.state === 'running' && hintListener) {
      let shown = false;
      try {
        shown = localStorage.getItem(HINT_KEY) === '1';
        localStorage.setItem(HINT_KEY, '1');
      } catch {
        /* private mode: show it anyway */
      }
      if (!shown) hintListener();
    }
  },
  /** The silent-switch hint (one listener: the SoundHint toast). */
  onHint(fn: () => void) {
    hintListener = fn;
    return () => {
      if (hintListener === fn) hintListener = null;
    };
  },
  /** Every frame while the engine turns (or settles): the sim's state to the synth. */
  update(sim: SimState, dt: number) {
    wanted = sim.phase !== 'off';
    if (!node || !ctx) return;
    if (sim.phase === 'off') {
      // Off and quiet for a moment: suspend (no audio-thread work while the engine is off).
      offFor += dt;
      if (offFor > 1.5 && ctx.state === 'running') void ctx.suspend();
      if (ctx.state !== 'running') return;
    } else {
      offFor = 0;
      if (ctx.state === 'suspended' && !hidden) void ctx.resume();
    }
    setSynth(node, synthValues(sim), ctx.currentTime);
  },
  setHidden(h: boolean) {
    hidden = h;
    applyLevel();
    // Back from another tab or app: resume the context (the system may have suspended it).
    if (!h) wake();
  },
  setVolume(v: number, m: boolean) {
    volume = v;
    muted = m;
    applyLevel();
  },
  /** For checks: the context's state, whether the synth is running, the output level. */
  status() {
    return { context: ctx?.state ?? 'none', synth: !!node, level: gain ? +gain.gain.value.toFixed(3) : null, sampleRate: ctx?.sampleRate ?? null };
  },
};
