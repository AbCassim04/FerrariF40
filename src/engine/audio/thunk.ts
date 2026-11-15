import { SOUND } from '../../config/sound';

/**
 * 9C door sounds, made on the spot (no samples): closing, a soft thunk (a low decaying tone
 * with a short thud of filtered noise); opening, a light latch click. Its own small audio
 * context, created on the first door press (a user gesture), so it works with the engine off.
 */
let ctx: AudioContext | null = null;

export async function thunk(kind: 'open' | 'close', delayS = 0) {
  const T = SOUND.doors;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') await ctx.resume();
  } catch {
    return;
  }
  const t0 = ctx.currentTime + delayS;
  const out = ctx.createGain();
  out.gain.value = kind === 'close' ? T.close : T.open;
  out.connect(ctx.destination);
  // Body: a decaying low tone (the panel and seal).
  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(kind === 'close' ? T.thumpHz : T.clickHz, t0);
  osc.frequency.exponentialRampToValueAtTime((kind === 'close' ? T.thumpHz : T.clickHz) * 0.7, t0 + T.decayS);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t0);
  env.gain.linearRampToValueAtTime(1, t0 + 0.004);
  env.gain.exponentialRampToValueAtTime(0.001, t0 + (kind === 'close' ? T.decayS : T.decayS * 0.3));
  osc.connect(env).connect(out);
  osc.start(t0);
  osc.stop(t0 + T.decayS + 0.05);
  // The latch: a short burst of band-passed noise.
  const n = Math.ceil(ctx.sampleRate * 0.04);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.006));
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = kind === 'close' ? T.latchHz : T.latchHz * 2;
  band.Q.value = 0.9;
  const ng = ctx.createGain();
  ng.gain.value = T.latch;
  src.connect(band).connect(ng).connect(out);
  src.start(t0);
}
