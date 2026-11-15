import { SOUND } from '../config/sound';
import { createSynthNode, masterChain, setSynth, synthValues } from '../engine/audio/engineAudio';
import { deriveShafts, gearboxRpm, createSim, kmh, placeGear, shiftBy, startEngine, stepSim, type SimState } from '../engine/sim';

/**
 * Dev only: offline renders of the engine sound (OfflineAudioContext with the same worklet
 * and the same sim as the live page), a spectrogram of each, and numeric checks. Used by
 * `__dev.renderAudio`; the clips go to docs/review/f40-phase8/audio/ (git-ignored).
 */

const SR = SOUND.sampleRate;
/** The sim steps once per render quantum, and the synth's params change at the same instants. */
const DT = 128 / SR;

interface Drive {
  pedal: number;
  /** Hold the speed here (steady-state clips; the sim does everything else). */
  hold?: number;
  /** Press Start. */
  start?: boolean;
  /** 8D-2: brake pedal 0…1. */
  brake?: number;
  /** Shift up by itself at this engine speed (the 1→5 run). */
  upAt?: number;
}

export interface Clip {
  name: string;
  title: string;
  seconds: number;
  /** Starts running at this speed (after a pre-roll at the first drive values), or off. */
  from: number | 'off';
  drive: (t: number) => Drive;
  /** Steady speed: the spectrum is checked for the firing and bank frequencies. */
  steady?: number;
  /**
   * Amplitude-modulation check: the dominant rate (Hz, within lo–hi) of the level's envelope
   * between `from` and `to` s, optionally within a frequency band first.
   */
  am?: { from: number; to: number; lo: number; hi: number; band?: [number, number]; what: string; dips?: boolean };
  /** 8D-2: start in this gear at this road speed (km/h), clutch locked if it can be. */
  car?: { gear: number; kmh: number };
  /** Lever moves at these times: one step up or down. */
  shifts?: { t: number; dir: 1 | -1 }[];
}

const steady = (rpm: number, pedal: number): Clip => ({
  name: `steady-${rpm}`,
  title: `${rpm} rpm steady, throttle ${Math.round(pedal * 100)}%`,
  seconds: 5,
  from: rpm,
  drive: () => ({ pedal, hold: rpm }),
  steady: rpm,
});

export const CLIPS: Clip[] = [
  { ...steady(1000, 0), name: 'idle', title: 'Idle, 1000 rpm' },
  steady(3000, 0.3),
  steady(5000, 0.6),
  steady(7000, 1),
  {
    name: 'rev-2000-7750',
    title: 'Full throttle from 2000 rpm to the limiter, then lift',
    seconds: 7,
    from: 2000,
    drive: (t) => (t < 0.8 ? { pedal: 0.1, hold: 2000 } : t < 5 ? { pedal: 1 } : { pedal: 0 }),
  },
  {
    name: 'liftoff-7000',
    title: 'Lift-off at 7000 rpm on full boost (flutter)',
    seconds: 5,
    from: 7000,
    drive: (t) => (t < 2 ? { pedal: 1, hold: 7000 } : { pedal: 0 }),
    am: { from: 2.1, to: 3.1, lo: 8, hi: 40, band: [600, 1500], what: 'compressor flutter (15–25 Hz)' },
  },
  {
    name: 'limiter',
    title: 'Held on the limiter',
    seconds: 6,
    from: 6500,
    drive: (t) => (t < 4.5 ? { pedal: 1, hold: t < 0.3 ? 6500 : undefined } : { pedal: 0 }),
    am: { from: 1.2, to: 4.4, lo: 1.5, hi: 15, what: 'limiter cuts (the sim cuts 4.4 times a second, 32 ms each)', dips: true },
  },
  // 8D-2: the drivetrain on the rolling road.
  {
    name: 'run-1-5',
    title: 'Full throttle from rest, 1st to 5th (upshifts at 7700 rpm)',
    seconds: 30,
    from: 1000,
    car: { gear: 1, kmh: 0 },
    drive: (t) => (t < 0.6 ? { pedal: 0 } : { pedal: 1, upAt: 7700 }),
  },
  {
    name: 'downshift-blip',
    title: 'Off throttle in 4th at 150 km/h: braking, then 4→3 and 3→2, each with a blip',
    seconds: 7,
    from: 1000,
    car: { gear: 4, kmh: 150 },
    drive: (t) => ({ pedal: t > 5.4 ? 0.35 : 0, brake: t > 0.5 && t < 2.4 ? 0.5 : 0 }),
    shifts: [
      { t: 2.6, dir: -1 },
      { t: 4.2, dir: -1 },
    ],
  },
  {
    name: 'pullaway-slip',
    title: 'Pulling away in 1st at half throttle: the clutch slips, then locks',
    seconds: 6,
    from: 1000,
    car: { gear: 1, kmh: 0 },
    drive: (t) => ({ pedal: t < 0.8 ? 0 : t < 4.5 ? 0.5 : 0 }),
  },
  {
    name: 'refused-downshift',
    title: '3rd at 180 km/h: 3→2 refused (would over-rev), brake, then 3→2 accepted with a blip',
    seconds: 7,
    from: 1000,
    car: { gear: 3, kmh: 180 },
    drive: (t) => ({ pedal: t < 0.9 ? 0.6 : 0, brake: t > 1.6 && t < 4 ? 0.7 : 0 }),
    shifts: [
      { t: 1.0, dir: -1 },
      { t: 4.6, dir: -1 },
    ],
  },
  {
    name: 'start',
    title: 'Start: pinion in, cranking, catch, flare, idle',
    seconds: 5,
    from: 'off',
    drive: (t) => ({ pedal: 0, start: t >= 0.3 }),
    am: { from: 0.65, to: 1.25, lo: 5, hi: 30, what: 'cranking compression pulses (200 rpm × 4 / 60 = 13.3 Hz)' },
  },
];

interface TracePoint {
  t: number;
  rpm: number;
  boost: number;
  throttle: number;
  /** Secondary shaft rpm (the gearbox whine). */
  shaft: number;
  gear: number;
}

/** What the sim did in a drivetrain clip (for the report: shift points, refusals, slip). */
interface DriveLog {
  shifts: { t: number; from: number; to: number; kmh: number; rpm: number }[];
  refused: number[];
  slip?: { from: number; to: number; rpm: [number, number] };
  kmh100?: number;
  endKmh: number;
}

export async function renderClip(clip: Clip) {
  const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: Math.round(clip.seconds * SR), sampleRate: SR });
  const node = await createSynthNode(ctx);
  // Full volume: the worst case for the peak check.
  masterChain(ctx, node, 1);
  const sim = createSim();
  if (clip.from !== 'off') {
    Object.assign(sim, { phase: 'running', t: 10, rpm: clip.from, firing: true });
    const d = clip.drive(0);
    for (let t = 0; t < 3; t += DT) {
      stepSim(sim, { pedal: d.pedal }, DT);
      sim.rpm = d.hold ?? clip.from;
    }
  }
  if (clip.car) {
    // In gear at speed: the engine tied to the road (or idling with the clutch open, stopped).
    const v = clip.car.kmh / 3.6;
    placeGear(sim, clip.car.gear);
    const gb = gearboxRpm(clip.car.gear, v);
    Object.assign(sim, { speed: v, clutch: gb >= 1100 ? 'locked' : 'open', rpm: gb >= 1100 ? gb : 1000, boost: 0, throttle: 0 });
    deriveShafts(sim);
  }
  const trace: TracePoint[] = [];
  const log: DriveLog = { shifts: [], refused: [], endKmh: 0 };
  const steps = Math.ceil(clip.seconds / DT);
  const queued = [...(clip.shifts ?? [])];
  let gear = sim.gear;
  let refused = 0;
  for (let k = 0; k < steps; k++) {
    const t = k * DT;
    setSynth(node, synthValues(sim), t);
    if (k % 12 === 0) trace.push({ t, rpm: sim.rpm, boost: sim.boost, throttle: sim.throttle, shaft: sim.outputRpm, gear: sim.gear });
    const d = clip.drive(t);
    if (d.start && sim.phase === 'off') startEngine(sim);
    while (queued.length && queued[0].t <= t) shiftBy(sim, queued.shift()!.dir);
    if (d.upAt && !sim.shift && sim.gear >= 1 && sim.gear < 5 && sim.rpm >= d.upAt) shiftBy(sim, 1);
    stepSim(sim, { pedal: d.pedal, brake: d.brake ?? 0 }, DT);
    if (d.hold !== undefined) sim.rpm = d.hold;
    if (clip.car) {
      if (sim.gear !== gear) log.shifts.push({ t: +t.toFixed(2), from: gear, to: sim.gear, kmh: +kmh(sim.speed).toFixed(1), rpm: Math.round(sim.rpm) });
      gear = sim.gear;
      if (sim.refused > refused) log.refused.push(+t.toFixed(2));
      refused = sim.refused;
      if (sim.clutch === 'slip') {
        if (!log.slip) log.slip = { from: +t.toFixed(2), to: +t.toFixed(2), rpm: [sim.rpm, sim.rpm] };
        log.slip.to = +t.toFixed(2);
        log.slip.rpm = [Math.min(log.slip.rpm[0], sim.rpm), Math.max(log.slip.rpm[1], sim.rpm)];
      }
      if (log.kmh100 === undefined && kmh(sim.speed) >= 100) log.kmh100 = +t.toFixed(2);
    }
  }
  log.endKmh = +kmh(sim.speed).toFixed(1);
  if (log.slip) log.slip.rpm = [Math.round(log.slip.rpm[0]), Math.round(log.slip.rpm[1])];
  const buffer = await ctx.startRendering();
  return { buffer, trace, log: clip.car ? log : undefined };
}

// ─── Analysis ────────────────────────────────────────────────────────────────

/** In-place radix-2 FFT. */
function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

/** Magnitude spectrum (dB) of `x` from `start`, Hann-windowed, size n. */
function spectrum(x: Float32Array | Float64Array, start: number, n: number) {
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = (x[start + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  fft(re, im);
  const db = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) db[i] = 10 * Math.log10(re[i] * re[i] + im[i] * im[i] + 1e-20);
  return db;
}

/** How far a peak near f stands above its surroundings (dB): max within ±3 %, against the median of 0.6–1.4 f. */
function prominence(db: Float64Array, n: number, f: number) {
  const bin = (hz: number) => Math.round((hz * n) / SR);
  let peak = -Infinity;
  let at = f;
  for (let b = bin(f * 0.97); b <= bin(f * 1.03); b++)
    if (db[b] > peak) {
      peak = db[b];
      at = (b * SR) / n;
    }
  const around: number[] = [];
  for (let b = bin(f * 0.6); b <= bin(f * 1.4); b++) if (Math.abs(b - bin(f)) > bin(f * 0.05) - bin(0)) around.push(db[b]);
  around.sort((a, b) => a - b);
  return { hz: +at.toFixed(1), db: +(peak - around[around.length >> 1]).toFixed(1) };
}

export interface Checks {
  peakDbfs: number;
  rmsDbfs: number;
  nan: boolean;
  /** Frames whose high-frequency energy jumps far above the clip's norm (clicks). */
  clicks: number;
  /** Mean step size at render-block boundaries vs everywhere (≈1 means no block-edge artefacts). */
  blockEdgeRatio: number;
  firing?: { expectHz: number; hz: number; db: number };
  bankLeft?: { expectHz: number; hz: number; db: number };
  bankSide?: { expectHz: number; hz: number; db: number };
  /** The bank frequency in the mono sum: much weaker than in each channel (the banks interleave). */
  bankMono?: { expectHz: number; hz: number; db: number };
  /** Strongest component 20–600 Hz in the mono sum. */
  dominantHz?: number;
  /** A-weighted level of the mono sum (dBFS, A-weighted): how loud it sounds, roughly. */
  levelA?: number;
  /** The clip's amplitude-modulation check (see Clip.am); `dipsPerSecond` counts drops of 6 dB or more in the 10 ms level. */
  am?: { what: string; hz: number; db: number; dipsPerSecond?: number };
}

/** Drops of 6 dB or more below the median in the level of 10 ms frames, per second (fuel cuts). */
function dipRate(mono: Float64Array, from: number, to: number) {
  const frame = SR / 100;
  const levels: number[] = [];
  for (let s = Math.floor(from * SR); s + frame <= to * SR; s += frame) {
    let e = 0;
    for (let i = s; i < s + frame; i++) e += mono[i] * mono[i];
    levels.push(10 * Math.log10(e / frame + 1e-20));
  }
  const median = [...levels].sort((a, b) => a - b)[levels.length >> 1];
  let dips = 0;
  let inDip = false;
  for (const l of levels) {
    if (!inDip && l < median - 6) dips++;
    inDip = l < median - 6 ? true : l > median - 3 ? false : inDip;
  }
  return +(dips / (to - from)).toFixed(1);
}

/** RBJ bandpass over a whole signal (analysis only). */
function bandpass(x: Float64Array, lo: number, hi: number) {
  const f = Math.sqrt(lo * hi);
  const q = f / (hi - lo);
  const w = (2 * Math.PI * f) / SR;
  const alpha = Math.sin(w) / (2 * q);
  const a0 = 1 + alpha;
  const [b0, b2, a1, a2] = [alpha / a0, -alpha / a0, (-2 * Math.cos(w)) / a0, (1 - alpha) / a0];
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = v;
    y[i] = v;
  }
  return y;
}

/** Dominant rate (Hz) of a signal's level envelope between two times, within lo–hi, and how far it stands out (dB). */
function modulationRate(mono: Float64Array, am: NonNullable<Clip['am']>) {
  const x = am.band ? bandpass(mono, am.band[0], am.band[1]) : mono;
  // Rectify, smooth (one pole at 80 Hz), decimate to 1 kHz.
  const k = 1 - Math.exp((-2 * Math.PI * 80) / SR);
  const step = SR / 1000;
  const env: number[] = [];
  let e = 0;
  for (let i = Math.floor(am.from * SR); i < Math.min(x.length, am.to * SR); i++) {
    e += (Math.abs(x[i]) - e) * k;
    if (i % step === 0) env.push(e);
  }
  const mean = env.reduce((a, b) => a + b, 0) / env.length;
  const N = 8192;
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  env.forEach((v, i) => (re[i] = (v - mean) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (env.length - 1)))));
  fft(re, im);
  const mag = (b: number) => 10 * Math.log10(re[b] * re[b] + im[b] * im[b] + 1e-30);
  const bin = (hz: number) => Math.round((hz * N) / 1000);
  let best = -Infinity;
  let at = 0;
  for (let b = bin(am.lo); b <= bin(am.hi); b++) if (mag(b) > best) [best, at] = [mag(b), b];
  const around: number[] = [];
  for (let b = bin(am.lo); b <= bin(am.hi); b++) around.push(mag(b));
  around.sort((a, b) => a - b);
  return { what: am.what, hz: +((at * 1000) / N).toFixed(1), db: +(best - around[around.length >> 1]).toFixed(1) };
}

/** A-weighting gain (dB) at f. */
function aWeight(f: number) {
  const f2 = f * f;
  const ra = (12194 ** 2 * f2 * f2) / ((f2 + 20.6 ** 2) * Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) * (f2 + 12194 ** 2));
  return 20 * Math.log10(ra) + 2;
}

export function analyse(buffer: AudioBuffer, clip: Clip): Checks {
  const L = buffer.getChannelData(0);
  const R = buffer.getChannelData(1);
  const n = L.length;
  let peak = 0;
  let sum = 0;
  let nan = false;
  let stepAll = 0;
  let stepEdge = 0;
  let edges = 0;
  for (let i = 0; i < n; i++) {
    const l = L[i];
    const r = R[i];
    if (!Number.isFinite(l) || !Number.isFinite(r)) nan = true;
    peak = Math.max(peak, Math.abs(l), Math.abs(r));
    sum += l * l + r * r;
    if (i > 0) {
      const d = Math.abs(l - L[i - 1]) + Math.abs(r - R[i - 1]);
      stepAll += d;
      if (i % 128 === 0) {
        stepEdge += d;
        edges++;
      }
    }
  }
  // Clicks: second difference (rises ~f², so broadband steps stand out), RMS per 256-sample frame.
  const frame = 256;
  const hf: number[] = [];
  for (let s = 2; s + frame < n; s += frame) {
    let e = 0;
    for (let i = s; i < s + frame; i++) {
      const d2 = L[i] - 2 * L[i - 1] + L[i - 2];
      const e2 = R[i] - 2 * R[i - 1] + R[i - 2];
      e += d2 * d2 + e2 * e2;
    }
    hf.push(Math.sqrt(e / frame));
  }
  const sorted = [...hf].sort((a, b) => a - b);
  const median = sorted[sorted.length >> 1] || 1e-9;
  // A frame far above the norm, and far above its own neighbours (not a gradual build-up).
  let clicks = 0;
  for (let k = 1; k < hf.length - 1; k++) if (hf[k] > 12 * median && hf[k] > 1e-3 && hf[k] > 4 * Math.max(hf[k - 1], hf[k + 1])) clicks++;

  const checks: Checks = {
    peakDbfs: +(20 * Math.log10(peak + 1e-12)).toFixed(2),
    rmsDbfs: +(10 * Math.log10(sum / (2 * n) + 1e-20)).toFixed(1),
    nan,
    clicks,
    blockEdgeRatio: +(stepEdge / Math.max(1, edges) / (stepAll / (n - 1))).toFixed(3),
  };
  if (clip.am) {
    const mono = new Float64Array(n);
    for (let i = 0; i < n; i++) mono[i] = (L[i] + R[i]) / 2;
    checks.am = modulationRate(mono, clip.am);
    if (clip.am.dips) checks.am.dipsPerSecond = dipRate(mono, clip.am.from, clip.am.to);
  }
  if (clip.steady) {
    const N = 1 << 17;
    const start = Math.max(0, n - N);
    const mono = new Float64Array(N);
    const side = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      mono[i] = ((L[start + i] ?? 0) + (R[start + i] ?? 0)) / 2;
      side[i] = ((L[start + i] ?? 0) - (R[start + i] ?? 0)) / 2;
    }
    const firing = (clip.steady / 60) * 4;
    const bank = (clip.steady / 60) * 2;
    const m = spectrum(mono, 0, N);
    const l = spectrum(L, start, N);
    const sd = spectrum(side, 0, N);
    checks.firing = { expectHz: +firing.toFixed(1), ...prominence(m, N, firing) };
    checks.bankLeft = { expectHz: +bank.toFixed(1), ...prominence(l, N, bank) };
    checks.bankSide = { expectHz: +bank.toFixed(1), ...prominence(sd, N, bank) };
    checks.bankMono = { expectHz: +bank.toFixed(1), ...prominence(m, N, bank) };
    // Parseval with the Hann window's power (3/8) and the one-sided spectrum (×2).
    let pa = 0;
    for (let b = 1; b < N / 2; b++) pa += 10 ** ((m[b] + aWeight((b * SR) / N)) / 10);
    checks.levelA = +(10 * Math.log10((2 * pa) / (N * N * 0.375)) ).toFixed(1);
    let best = -Infinity;
    for (let b = Math.round((20 * N) / SR); b < (600 * N) / SR; b++)
      if (m[b] > best) {
        best = m[b];
        checks.dominantHz = +((b * SR) / N).toFixed(1);
      }
  }
  return checks;
}

// ─── Files ───────────────────────────────────────────────────────────────────

/** 16-bit PCM WAV. */
export function wav(buffer: AudioBuffer) {
  const ch = buffer.numberOfChannels;
  const n = buffer.length;
  const out = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const text = (o: number, s: string) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  out.setUint32(4, 36 + n * ch * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true);
  out.setUint16(22, ch, true);
  out.setUint32(24, buffer.sampleRate, true);
  out.setUint32(28, buffer.sampleRate * ch * 2, true);
  out.setUint16(32, ch * 2, true);
  out.setUint16(34, 16, true);
  text(36, 'data');
  out.setUint32(40, n * ch * 2, true);
  const data = Array.from({ length: ch }, (_, c) => buffer.getChannelData(c));
  for (let i = 0, o = 44; i < n; i++)
    for (let c = 0; c < ch; c++, o += 2) out.setInt16(o, Math.max(-32768, Math.min(32767, Math.round(data[c][i] * 32767))), true);
  return new Blob([out.buffer], { type: 'audio/wav' });
}

/** Sequential ramp (one hue, light = quiet → dark = loud), from the dataviz reference palette's blue. */
const RAMP = ['#fcfcfb', '#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'].map((h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16)));
const rampAt = (v: number) => {
  const x = Math.min(1, Math.max(0, v)) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(x));
  const f = x - i;
  return RAMP[i].map((c, k) => Math.round(c + (RAMP[i + 1][k] - c) * f));
};

const INK = '#2b2b28';
const MUTED = '#6b6a64';
const GRID = '#e4e3de';

/**
 * Spectrogram (mono sum, log frequency 30 Hz–12 kHz, −90…−10 dB), with the expected firing
 * (rpm/60 × 4) and bank (rpm/60 × 2) frequencies drawn over it from the sim's trace.
 */
export async function spectrogram(buffer: AudioBuffer, clip: Clip, trace: TracePoint[]) {
  const W = 1000;
  const H = 440;
  const pad = { l: 64, r: 20, t: 56, b: 44 };
  const pw = W - pad.l - pad.r;
  const ph = H - pad.t - pad.b;
  const canvas = new OffscreenCanvas(W * 2, H * 2);
  const g = canvas.getContext('2d')!;
  g.scale(2, 2);
  g.fillStyle = '#fcfcfb';
  g.fillRect(0, 0, W, H);

  const L = buffer.getChannelData(0);
  const R = buffer.getChannelData(1);
  const mono = new Float64Array(L.length);
  for (let i = 0; i < L.length; i++) mono[i] = (L[i] + R[i]) / 2;
  const N = 4096;
  const fLo = 30;
  const fHi = 12000;
  const yOf = (f: number) => pad.t + ph * (1 - Math.log(f / fLo) / Math.log(fHi / fLo));
  const img = g.createImageData(pw, ph);
  const cols = pw;
  const dur = buffer.duration;
  for (let x = 0; x < cols; x++) {
    const centre = Math.round((x / cols) * L.length);
    const db = spectrum(mono, Math.min(L.length - N, Math.max(0, centre - N / 2)), N);
    for (let y = 0; y < ph; y++) {
      const f = fLo * Math.pow(fHi / fLo, 1 - y / ph);
      const b = (f * N) / SR;
      const b0 = Math.floor(b);
      const v = db[b0] + (db[b0 + 1] - db[b0]) * (b - b0) - 20 * Math.log10(N / 4);
      const [r, gg, bb] = rampAt((v + 90) / 80);
      const o = (y * pw + x) * 4;
      img.data[o] = r;
      img.data[o + 1] = gg;
      img.data[o + 2] = bb;
      img.data[o + 3] = 255;
    }
  }
  // putImageData ignores the transform: draw it at device scale through a bitmap.
  const bmp = await createImageBitmap(img);
  g.drawImage(bmp, pad.l, pad.t, pw, ph);

  // Axes (recessive).
  g.font = '12px Inter, system-ui, sans-serif';
  g.textBaseline = 'middle';
  g.strokeStyle = GRID;
  g.lineWidth = 1;
  g.fillStyle = MUTED;
  for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) {
    const y = yOf(f);
    g.textAlign = 'right';
    g.fillText(f >= 1000 ? `${f / 1000}k` : String(f), pad.l - 8, y);
    g.beginPath();
    g.moveTo(pad.l - 4, y);
    g.lineTo(pad.l, y);
    g.stroke();
  }
  g.textAlign = 'center';
  g.textBaseline = 'top';
  for (let s = 0; s <= Math.floor(dur); s++) {
    const x = pad.l + (s / dur) * pw;
    g.fillText(`${s} s`, x, pad.t + ph + 8);
  }
  g.save();
  g.translate(16, pad.t + ph / 2);
  g.rotate(-Math.PI / 2);
  g.fillText('Hz', 0, 0);
  g.restore();

  // Expected firing and bank frequencies (where the engine turns), as ink lines: solid and dashed.
  const line = (mult: number, dash: number[]) => {
    g.setLineDash(dash);
    g.strokeStyle = INK;
    g.lineWidth = 1.5;
    g.beginPath();
    let on = false;
    for (const p of trace) {
      const f = (p.rpm / 60) * mult;
      if (f < fLo) {
        on = false;
        continue;
      }
      const x = pad.l + (p.t / dur) * pw;
      const y = yOf(f);
      if (on) g.lineTo(x, y);
      else g.moveTo(x, y);
      on = true;
    }
    g.stroke();
    g.setLineDash([]);
  };
  line(4, []);
  line(2, [5, 4]);
  // 8D-2: the gearbox whine (secondary shaft × pinion teeth), dotted, and the gear along the top.
  const drivetrain = trace.some((p) => p.shaft > 1);
  if (drivetrain) {
    g.setLineDash([1.5, 3]);
    g.strokeStyle = INK;
    g.lineWidth = 1.5;
    g.beginPath();
    let on = false;
    for (const p of trace) {
      const f = (Math.abs(p.shaft) / 60) * SOUND.gearbox.pinionTeeth;
      if (f < fLo) {
        on = false;
        continue;
      }
      const x = pad.l + (p.t / dur) * pw;
      if (on) g.lineTo(x, yOf(f));
      else g.moveTo(x, yOf(f));
      on = true;
    }
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = INK;
    g.font = '600 11px Inter, system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'top';
    let last = NaN;
    for (const p of trace) {
      if (p.gear === last) continue;
      last = p.gear;
      g.fillText(p.gear === 0 ? 'N' : p.gear === -1 ? 'R' : String(p.gear), pad.l + (p.t / dur) * pw + 6, pad.t + 4);
    }
  }

  // Title and legend.
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  g.fillStyle = INK;
  g.font = '600 15px Inter, system-ui, sans-serif';
  g.fillText(clip.title, pad.l, 24);
  g.font = '12px Inter, system-ui, sans-serif';
  g.fillStyle = MUTED;
  g.fillText('Mono sum, 4096-point frames; darker = louder (−90 to −10 dB)', pad.l, 42);
  const lx = W - pad.r - 330;
  const legend = (x: number, dash: number[], label: string) => {
    g.setLineDash(dash);
    g.strokeStyle = INK;
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(x, 38);
    g.lineTo(x + 22, 38);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = INK;
    g.fillText(label, x + 28, 42);
  };
  if (drivetrain) {
    legend(lx - 180, [1.5, 3], `gear whine (shaft × ${SOUND.gearbox.pinionTeeth})`);
  }
  legend(lx, [], 'firing (rpm/60 × 4)');
  legend(lx + 165, [5, 4], 'bank (rpm/60 × 2)');
  return canvas.convertToBlob({ type: 'image/png' });
}

/** Saves a blob through a download (the review harness collects downloads into the folder). */
export function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

export async function renderAudio(names?: string[], save = false) {
  const report: Record<string, Checks & { seconds: number; drive?: DriveLog }> = {};
  for (const clip of CLIPS.filter((c) => !names || names.includes(c.name))) {
    const { buffer, trace, log } = await renderClip(clip);
    report[clip.name] = { seconds: clip.seconds, ...analyse(buffer, clip), ...(log && { drive: log }) };
    if (save) {
      download(wav(buffer), `${clip.name}.wav`);
      download(await spectrogram(buffer, clip, trace), `${clip.name}.png`);
    }
  }
  return report;
}

export type { SimState };
