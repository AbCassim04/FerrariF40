import { SOUND } from '../../config/sound';

/**
 * The engine synth's DSP, sample by sample, with no Web Audio dependency (the AudioWorklet
 * wraps it; nothing else needs to). It keeps its OWN crank angle, integrated every sample
 * from the rpm it is given, and fires each cylinder's exhaust pulse as that angle crosses the
 * cylinder's exhaust opening: sample-accurate whatever the frame rate.
 */

const TAU = Math.PI * 2;
const CYCLE = 2 * TAU;
const deg = (v: number) => (v * Math.PI) / 180;

/** What drives the synth: the sim's state (live: once a frame; offline: a script). */
export interface SynthParams {
  rpm: number;
  throttle: number;
  boost: number;
  /** Fuel and spark on (exhaust pulses); off while cranking, at the limiter, stopping. */
  firing: boolean;
  /** Starter motor driving the crank. */
  starter: boolean;
  /** 8D-2: road speed, km/h (the rolling road's roar). */
  speed: number;
  /** Secondary shaft speed, rpm (the gearbox whine's pitch). */
  shaft: number;
  /** Torque through the gearbox, share of peak 0…1 (the whine grows under load). */
  drive: number;
  /** Shifts so far: each new one sounds the dog engagement's clunk. */
  shifts: number;
}

export interface Cylinder {
  /** Crank angle (rad, within the 720° cycle) of its firing TDC. */
  firing: number;
  /** 0 = left bank, 1 = right bank. */
  bank: 0 | 1;
}

/** RBJ biquad, transposed direct form II. */
class Biquad {
  b0 = 1;
  b1 = 0;
  b2 = 0;
  a1 = 0;
  a2 = 0;
  private z1 = 0;
  private z2 = 0;
  constructor(private sr: number) {}
  bandpass(f: number, q: number) {
    const w = (TAU * Math.min(f, this.sr * 0.45)) / this.sr;
    const alpha = Math.sin(w) / (2 * q);
    const a0 = 1 + alpha;
    this.b0 = alpha / a0;
    this.b1 = 0;
    this.b2 = -alpha / a0;
    this.a1 = (-2 * Math.cos(w)) / a0;
    this.a2 = (1 - alpha) / a0;
    return this;
  }
  lowpass(f: number, q = Math.SQRT1_2) {
    const w = (TAU * Math.min(f, this.sr * 0.45)) / this.sr;
    const alpha = Math.sin(w) / (2 * q);
    const c = Math.cos(w);
    const a0 = 1 + alpha;
    this.b0 = (1 - c) / 2 / a0;
    this.b1 = (1 - c) / a0;
    this.b2 = (1 - c) / 2 / a0;
    this.a1 = (-2 * c) / a0;
    this.a2 = (1 - alpha) / a0;
    return this;
  }
  highpass(f: number, q = Math.SQRT1_2) {
    const w = (TAU * f) / this.sr;
    const alpha = Math.sin(w) / (2 * q);
    const c = Math.cos(w);
    const a0 = 1 + alpha;
    this.b0 = (1 + c) / 2 / a0;
    this.b1 = -(1 + c) / a0;
    this.b2 = (1 + c) / 2 / a0;
    this.a1 = (-2 * c) / a0;
    this.a2 = (1 - alpha) / a0;
    return this;
  }
  process(x: number) {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
}

/** Damped resonator (a decaying sine when struck): the thump under each exhaust pulse. */
class Resonator {
  private y1 = 0;
  private y2 = 0;
  private c1: number;
  private c2: number;
  constructor(sr: number, f: number, decay: number) {
    const r = Math.exp(-1 / (decay * sr));
    this.c1 = 2 * r * Math.cos((TAU * f) / sr);
    this.c2 = -r * r;
  }
  process(x: number) {
    const y = x + this.c1 * this.y1 + this.c2 * this.y2;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

/** The starter's engagement knock: its length (s). */
const THUD_LENGTH = 0.004;

/** Crossing test on the unwrapped cycle: did the angle pass `at` between a and b (a ≤ b, within one cycle)? */
function crossed(a: number, b: number, at: number) {
  const x = ((at - a) % CYCLE + CYCLE) % CYCLE;
  return x > 0 && x <= b - a;
}

/** Small deterministic noise source (the same render twice gives the same clip). */
class Noise {
  private s = 0x9e3779b9;
  next() {
    // xorshift32 → [-1, 1)
    let x = this.s;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.s = x >>> 0;
    return this.s / 2147483648 - 1;
  }
}

export class EngineSynth {
  private readonly sr: number;
  private readonly cyl: Cylinder[];
  private readonly X = SOUND.exhaust;
  private noise = new Noise();
  // Smoothed parameters.
  private rpm = 0;
  private throttle = 0;
  private boost = 0;
  private target: SynthParams = { rpm: 0, throttle: 0, boost: 0, firing: false, starter: false, speed: 0, shaft: 0, drive: 0, shifts: 0 };
  private crank = 0;
  // Exhaust pulse states per bank: difference of two decays (attack / decay).
  private pd = [0, 0];
  private pa = [0, 0];
  /**
   * The rarefaction after each pulse, of equal area (so the pulses carry no DC and their jitter
   * makes no rumble); like the pulse, a difference of two decays, so it has no step either.
   */
  private pn = [0, 0];
  private pna = [0, 0];
  private thump: Resonator[];
  private res: Biquad[][];
  private turbine: Biquad[];
  private silencer: Biquad[];
  private gate: Biquad;
  private dc: Biquad[];
  // Induction.
  private inducEnv = 0;
  private inducBand: Biquad;
  // Turbo.
  private spool = 0;
  private whistle: Biquad;
  private whistlePhase = 0;
  // Flutter.
  private flutterEnv = 0;
  private flutterPhase = 0;
  private flutterBand: Biquad;
  // Mechanical.
  private tickEnv = 0;
  private tickBand: Biquad;
  private beltPhase = 0;
  // Starter.
  private starterLevel = 0;
  private starterPhase = 0;
  /** Each compression's labour on the starter: a difference of two decays (rise 5 ms, fall 50 ms), so no steps. */
  private chug = 0;
  private chugRise = 0;
  private thud: Resonator;
  private thudIn = 0;
  /**
   * Drive scales for the two resonators, so that a pulse of amplitude A rings at about A: a
   * resonator's ring is its input's area × 1/sin(ω), and a pulse's area is A × its length.
   */
  private thumpDrive: number;
  private thudDrive: number;
  private wasStarter = false;
  private block = 0;
  private gateMix = 0;
  // Drivetrain (8D-2).
  private speed = 0;
  private shaft = 0;
  private drive = 0;
  private whinePhase = 0;
  private roadLow: Biquad;
  private roadHigh: Biquad;
  private clunk: Resonator;
  private clunkIn = 0;
  private clunkDrive: number;
  private clickEnv = 0;
  private clickBand: Biquad;
  private shifts = 0;

  constructor(sampleRate: number, cylinders: Cylinder[]) {
    this.sr = sampleRate;
    this.cyl = cylinders;
    const X = this.X;
    this.thump = [0, 1].map(() => new Resonator(sampleRate, X.thump.freq, X.thump.decay));
    this.res = [X.resonances.l, X.resonances.r].map((list) => list.map((r) => new Biquad(sampleRate).bandpass(r.f, r.q)));
    this.turbine = [0, 1].map(() => new Biquad(sampleRate).lowpass(X.turbineCutoff.noBoost));
    this.silencer = [0, 1].map(() => new Biquad(sampleRate).lowpass(X.silencerCutoff));
    this.gate = new Biquad(sampleRate).lowpass(X.wastegateCutoff);
    this.dc = [0, 1].map(() => new Biquad(sampleRate).highpass(SOUND.master.dcHz));
    this.inducBand = new Biquad(sampleRate).bandpass(SOUND.induction.bandHz, SOUND.induction.q);
    this.whistle = new Biquad(sampleRate).bandpass(SOUND.turbo.fromHz, SOUND.turbo.q);
    this.flutterBand = new Biquad(sampleRate).bandpass(SOUND.flutter.bandHz, SOUND.flutter.q);
    this.tickBand = new Biquad(sampleRate).bandpass(SOUND.mechanical.tickBand, 1.5);
    this.thud = new Resonator(sampleRate, 75, 0.05);
    this.thumpDrive = Math.sin((TAU * X.thump.freq) / sampleRate) / (X.decay * sampleRate);
    this.thudDrive = Math.sin((TAU * 75) / sampleRate) / (THUD_LENGTH * sampleRate);
    const C = SOUND.clunk;
    this.roadLow = new Biquad(sampleRate).lowpass(SOUND.road.cutoff[0]);
    this.roadHigh = new Biquad(sampleRate).highpass(SOUND.road.highpass);
    this.clunk = new Resonator(sampleRate, C.freq, C.decay);
    this.clunkDrive = Math.sin((TAU * C.freq) / sampleRate) / (THUD_LENGTH * sampleRate);
    this.clickBand = new Biquad(sampleRate).bandpass(C.clickBand, 2);
  }

  /**
   * New targets (smoothed inside). Lifting off on boost (the throttle snapping shut from wide
   * open with boost up) sets off the compressor flutter, as hard as the boost was.
   */
  set(p: SynthParams) {
    // The first values arrive as they are (an offline clip can start at speed).
    if (!this.primed) {
      this.primed = true;
      this.rpm = p.rpm;
      this.throttle = p.throttle;
      this.boost = Math.max(0, p.boost);
      this.spool = Math.min(1, this.boost / 1.1);
      this.speed = p.speed;
      this.shaft = p.shaft;
      this.drive = p.drive;
      this.shifts = p.shifts;
    }
    // A new shift: the dogs going in.
    if (p.shifts !== this.shifts) {
      if (p.shifts > this.shifts) {
        this.clunkIn = SOUND.clunk.level;
        this.clickEnv = SOUND.clunk.click;
      }
      this.shifts = p.shifts;
    }
    const F = SOUND.flutter;
    if (p.throttle > 0.6 && p.boost > F.fromBoost) this.armed = true;
    else if (this.armed && p.throttle < 0.25) {
      this.armed = false;
      if (p.boost > F.fromBoost * 0.6) this.flutter(p.boost);
    }
    this.target = p;
  }
  private armed = false;
  private primed = false;

  /** Start the compressor flutter, as hard as the boost was. */
  flutter(boost: number) {
    this.flutterEnv = Math.min(1, boost / 1.1) * SOUND.flutter.level;
    this.flutterPhase = 0;
  }

  /** Fill one block of stereo output. */
  process(outL: Float32Array, outR: Float32Array) {
    const sr = this.sr;
    const X = this.X;
    const n = outL.length;
    const k = 1 - Math.exp(-1 / (SOUND.smoothing * sr));
    const t = this.target;
    const I = SOUND.induction;
    const T = SOUND.turbo;
    const M = SOUND.mechanical;
    const St = SOUND.starter;
    const F = SOUND.flutter;
    const pulseAt = deg(X.pulseAt);
    const inducAt = deg(I.pulseAt);
    // Starter engaging: a thud as the pinion goes in (once per start).
    if (t.starter && !this.wasStarter) this.thudIn = St.engageThud;
    this.wasStarter = t.starter;

    const W = SOUND.gearbox;
    const Rd = SOUND.road;
    const C = SOUND.clunk;
    for (let s = 0; s < n; s++) {
      this.speed += (t.speed - this.speed) * k;
      this.shaft += (t.shaft - this.shaft) * k;
      this.drive += (t.drive - this.drive) * k;
      this.rpm += (t.rpm - this.rpm) * k;
      this.throttle += (t.throttle - this.throttle) * k;
      this.boost += (Math.max(0, t.boost) - this.boost) * k;
      // Coefficients that follow boost and spool: every 16 samples, so they move in small steps.
      if ((this.block++ & 15) === 0) this.retune();

      const a = this.crank;
      const b = a + (this.rpm / 60) * TAU / sr;
      this.crank = b >= CYCLE ? b - CYCLE : b;
      const speed = this.rpm / 7000;
      const load = t.firing ? Math.min(1, this.throttle * (0.45 + 0.55 * (this.boost / 1.1)) + 0.08) : 0;

      const decay = X.decay + (X.decayAtRedline - X.decay) * Math.min(1, speed);
      const tail = X.tail * decay;
      // Cylinder events: exhaust pulse (blowdown), intake pull, valve ticks, starter's compression chug.
      for (const c of this.cyl) {
        if (crossed(a, b, c.firing + pulseAt)) {
          const strength = t.firing ? (X.base + X.load * load) * (1 + X.speedGain * speed) : 0.1 * Math.min(1, this.rpm / 200);
          const amp = strength * (1 + X.jitter * this.noise.next());
          this.pd[c.bank] += amp;
          this.pa[c.bank] += amp;
          const rare = (amp * (decay - X.attack)) / (tail - X.attack);
          this.pn[c.bank] += rare;
          this.pna[c.bank] += rare;
          this.tickEnv += 1;
        }
        if (crossed(a, b, c.firing + inducAt)) {
          this.inducEnv += 1;
          this.tickEnv += 1;
        }
        if (crossed(a, b, c.firing) && t.starter) {
          this.chug += 1;
          this.chugRise += 1;
        }
      }
      const kd = Math.exp(-1 / (decay * sr));
      const ka = Math.exp(-1 / (X.attack * sr));
      const kn = Math.exp(-1 / (tail * sr));

      // Exhaust per bank: pulse → thump + manifold resonances → turbine → silencer.
      const bank = [0, 0];
      let gateIn = 0;
      for (let q = 0; q < 2; q++) {
        this.pd[q] *= kd;
        this.pa[q] *= ka;
        this.pn[q] *= kn;
        this.pna[q] *= ka;
        const pulse = this.pd[q] - this.pa[q] - (this.pn[q] - this.pna[q]);
        let x = pulse * X.dry + this.thump[q].process(pulse * this.thumpDrive) * X.thump.level * Math.max(0, 1 - speed / X.thump.goneAt);
        const list = q === 0 ? X.resonances.l : X.resonances.r;
        for (let r = 0; r < list.length; r++) x += this.res[q][r].process(pulse) * list[r].g;
        gateIn += x;
        bank[q] = this.silencer[q].process(this.turbine[q].process(x)) * X.silencerGain * (X.flowFloor + (1 - X.flowFloor) * Math.min(1, speed));
      }
      // Centre outlet: the wastegates bypass the turbines when boost nears its peak.
      const gate = this.gate.process(gateIn) * this.gateMix;

      // Induction: noise drawn in on each intake stroke, with throttle.
      this.inducEnv *= Math.exp(-1 / (I.width * sr));
      const induction = this.inducBand.process(this.noise.next()) * this.inducEnv * I.level * (1 - I.throttle + I.throttle * this.throttle) * Math.min(1, this.rpm / 900);

      // Turbo: spool lags boost; a narrow whistle that rises with it.
      this.spool += (Math.min(1, this.boost / 1.1) - this.spool) * (1 - Math.exp(-1 / (T.spoolTau * sr)));
      this.whistlePhase += ((T.fromHz + (T.toHz - T.fromHz) * this.spool) / sr) * TAU;
      if (this.whistlePhase > TAU) this.whistlePhase -= TAU;
      const whistle = (this.whistle.process(this.noise.next()) * (1 - T.tone) * 6 + Math.sin(this.whistlePhase) * T.tone) * T.level * this.spool * this.spool;

      // Flutter: amplitude-modulated noise bursts after lifting off on boost, decaying.
      let flutter = 0;
      if (this.flutterEnv > 1e-4) {
        this.flutterEnv *= Math.exp(-1 / (F.decay * sr));
        const rate = F.rateHz + F.rateSpread * this.flutterEnv;
        this.flutterPhase += rate / sr;
        const gateAm = Math.max(0, Math.sin(this.flutterPhase * TAU)) ** 3;
        flutter = this.flutterBand.process(this.noise.next()) * gateAm * this.flutterEnv * 2.2;
      }

      // Mechanical: valve ticks (short, bright) and the cam belts' tooth whine.
      this.tickEnv *= Math.exp(-1 / (0.0004 * sr));
      const tick = this.tickBand.process(this.noise.next()) * this.tickEnv * M.tickLevel * Math.min(1, this.rpm / 800);
      this.beltPhase += ((M.beltTeeth * this.rpm) / 60 / sr) * TAU;
      if (this.beltPhase > TAU) this.beltPhase -= TAU;
      const belt = Math.sin(this.beltPhase) * M.beltLevel * speed * speed;

      // Starter: motor whine (a few harmonics) and the chug of each compression stroke.
      this.starterLevel += ((t.starter ? 1 : 0) - this.starterLevel) * (1 - Math.exp(-1 / (0.04 * sr)));
      let starter = 0;
      if (this.starterLevel > 1e-4) {
        // The pinion overruns on its one-way clutch once the engine catches: the motor keeps its own speed.
        this.starterPhase += (((Math.min(this.rpm, St.freeRpm) / 60) * St.motorRatio) / sr) * TAU;
        if (this.starterPhase > TAU) this.starterPhase -= TAU;
        const p = this.starterPhase;
        this.chug *= Math.exp(-1 / (0.05 * sr));
        this.chugRise *= Math.exp(-1 / (0.005 * sr));
        const chug = this.chug - this.chugRise;
        const labour = 0.65 + 0.35 * Math.min(1, chug);
        starter = (Math.sin(p) + 0.5 * Math.sin(2 * p) + 0.25 * Math.sin(3 * p)) * St.whineLevel * labour * this.starterLevel;
        starter += Math.sin(p * 0.5) * chug * St.chugLevel * 0.08 * this.starterLevel;
      }
      this.thudIn *= Math.exp(-1 / (THUD_LENGTH * sr));
      const thud = this.thud.process(this.thudIn * this.thudDrive);

      // Gearbox whine: the final drive's tooth mesh, louder under load.
      const shaftAbs = Math.abs(this.shaft);
      this.whinePhase += ((shaftAbs / 60) * W.pinionTeeth / sr) * TAU;
      if (this.whinePhase > TAU) this.whinePhase -= TAU;
      const whine = (Math.sin(this.whinePhase) + W.harmonic * Math.sin(2 * this.whinePhase)) * W.level * (1 + W.loadGain * this.drive) * Math.min(1, shaftAbs / W.fadeInRpm);
      // Rolling road: low noise, louder and brighter with speed.
      const v = Math.min(1.2, Math.abs(this.speed) / Rd.refKmh);
      const road = v > 1e-4 ? this.roadHigh.process(this.roadLow.process(this.noise.next())) * Rd.level * v ** Rd.power * 4 : 0;
      // Clunk: the dogs engaging, a short low knock and a small click.
      this.clunkIn *= Math.exp(-1 / (THUD_LENGTH * sr));
      this.clickEnv *= Math.exp(-1 / (C.clickDecay * sr));
      const clunk = this.clunk.process(this.clunkIn * this.clunkDrive) + this.clickBand.process(this.noise.next()) * this.clickEnv;

      // Mix: each bank leans to its side; everything else is centred.
      const w = X.width;
      const centre = gate + induction + whistle + flutter + tick + belt + starter + thud + whine + road + clunk;
      let l = bank[0] * (0.5 + w) + bank[1] * (0.5 - w) + centre * 0.5;
      let r = bank[1] * (0.5 + w) + bank[0] * (0.5 - w) + centre * 0.5;
      l = this.dc[0].process(l) * SOUND.master.outputGain;
      r = this.dc[1].process(r) * SOUND.master.outputGain;
      const g = this.compress(Math.max(Math.abs(l), Math.abs(r)));
      // Soft limit: unity for small signals, never past the ceiling.
      const c = SOUND.master.ceiling;
      outL[s] = c * Math.tanh((l * g) / c);
      outR[s] = c * Math.tanh((r * g) / c);
    }
  }

  private env = 0;
  /** Stereo-linked feed-forward compressor with a soft knee: the gain for this sample. */
  private compress(peak: number) {
    const C = SOUND.master.compressor;
    const coef = Math.exp(-1 / ((peak > this.env ? C.attack : C.release) * this.sr));
    this.env = peak + coef * (this.env - peak);
    const over = 20 * Math.log10(this.env + 1e-9) - C.threshold;
    const slope = 1 / C.ratio - 1;
    let reduction = 0;
    if (2 * Math.abs(over) <= C.knee) reduction = (slope * (over + C.knee / 2) ** 2) / (2 * C.knee);
    else if (over > 0) reduction = slope * over;
    return 10 ** ((reduction + C.makeup) / 20);
  }

  private retune() {
    const X = this.X;
    const b = Math.min(1, this.boost / 1.1);
    const cutoff = X.turbineCutoff.noBoost + (X.turbineCutoff.fullBoost - X.turbineCutoff.noBoost) * b;
    for (const f of this.turbine) f.lowpass(cutoff);
    const T = SOUND.turbo;
    this.whistle.bandpass(T.fromHz + (T.toHz - T.fromHz) * this.spool, T.q);
    this.gateMix = Math.max(0, (b - X.wastegateFrom) / (1 - X.wastegateFrom)) * X.wastegateLevel;
    const Rd = SOUND.road;
    const v = Math.min(1, Math.abs(this.speed) / Rd.refKmh);
    this.roadLow.lowpass(Rd.cutoff[0] + (Rd.cutoff[1] - Rd.cutoff[0]) * v);
  }
}
