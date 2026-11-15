import { EngineSynth, type Cylinder } from './synth';

/**
 * AudioWorklet processor: wraps EngineSynth. It is driven by AudioParams (live: set once a
 * frame from the sim; offline renders: automated from a scripted sim, sample-accurately and
 * deterministically). The synth integrates its own crank angle sample by sample. The
 * cylinders' firing angles come in through processorOptions (computed from the engine layout
 * on the main thread, so this bundle stays free of three.js).
 */

declare const sampleRate: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: unknown);
}
declare function registerProcessor(name: string, ctor: unknown): void;

export const SYNTH_PARAMS = [
  { name: 'rpm', defaultValue: 0, minValue: 0, maxValue: 12000, automationRate: 'k-rate' },
  { name: 'throttle', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
  { name: 'boost', defaultValue: 0, minValue: -1, maxValue: 3, automationRate: 'k-rate' },
  { name: 'firing', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
  { name: 'starter', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
  { name: 'speed', defaultValue: 0, minValue: -100, maxValue: 400, automationRate: 'k-rate' },
  { name: 'shaft', defaultValue: 0, minValue: -5000, maxValue: 12000, automationRate: 'k-rate' },
  { name: 'drive', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
  { name: 'shifts', defaultValue: 0, minValue: 0, maxValue: 1e9, automationRate: 'k-rate' },
] as const;
export type SynthParamName = (typeof SYNTH_PARAMS)[number]['name'];

class EngineProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return SYNTH_PARAMS;
  }
  private synth: EngineSynth;
  private scratch = new Float32Array(128);
  constructor(options: { processorOptions: { cylinders: Cylinder[] } }) {
    super();
    this.synth = new EngineSynth(sampleRate, options.processorOptions.cylinders);
  }
  process(_inputs: Float32Array[][], outputs: Float32Array[][], p: Record<SynthParamName, Float32Array>) {
    this.synth.set({
      rpm: p.rpm[0],
      throttle: p.throttle[0],
      boost: p.boost[0],
      firing: p.firing[0] > 0.5,
      starter: p.starter[0] > 0.5,
      speed: p.speed[0],
      shaft: p.shaft[0],
      drive: p.drive[0],
      shifts: Math.round(p.shifts[0]),
    });
    const out = outputs[0];
    if (out.length >= 2) this.synth.process(out[0], out[1]);
    else if (out.length === 1) {
      if (this.scratch.length !== out[0].length) this.scratch = new Float32Array(out[0].length);
      this.synth.process(out[0], this.scratch);
    }
    return true;
  }
}

registerProcessor('f40-engine', EngineProcessor);
