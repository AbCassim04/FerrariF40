/**
 * Voicing of the procedural engine sound (phase 8C): every figure the synth uses. No
 * samples: each voice is generated in the AudioWorklet (src/engine/audio/). Frequencies in
 * Hz, times in seconds, levels as linear gains unless named dB. All (est): tuned by ear is
 * the owner's call; the offline renders (docs/review/f40-phase8/audio/) are for that.
 */
export const SOUND = {
  sampleRate: 48000,
  /**
   * Exhaust: one pressure pulse per cylinder as its exhaust valve opens, into its bank's own
   * manifold. A flat-plane V8 fires each bank evenly every 180°, so each bank on its own is
   * a four-cylinder: that rasp (the bank frequency, rpm/60 × 2) is the signature.
   */
  exhaust: {
    /** Crank degrees after firing TDC at which the exhaust valve opens (blowdown). */
    pulseAt: 130,
    /** Pulse shape: rise and decay time constants (decay shortens a little with speed). */
    attack: 0.00025,
    decay: 0.0026,
    decayAtRedline: 0.0014,
    /** The suction after each pulse (equal area, so no DC): its time constant, × the decay. */
    tail: 3,
    /**
     * Low thump under each pulse at idle and low revs: a damped sine, gone by `goneAt` × 7000
     * rpm (fixed in pitch, it would ring on as a drone once the pulses come faster than it decays).
     */
    thump: { freq: 58, decay: 0.012, level: 0.6, goneAt: 0.4 },
    /** Pulse strength: base + share that follows load; and how much it grows with speed. */
    base: 0.15,
    load: 0.85,
    speedGain: 0.6,
    /** Exhaust level with flow: × (`flowFloor` + (1 − flowFloor) × rpm / 7000), on top of the pulses' own strength. */
    flowFloor: 0.6,
    /** Small random spread per pulse (no two combustion events are identical). */
    jitter: 0.08,
    /**
     * Per-bank manifold resonances (bandpass: centre, Q, gain), slightly different per bank
     * (the two manifolds are mirror images, not identical runs), so the banks don't cancel.
     */
    resonances: {
      l: [
        { f: 118, q: 2.2, g: 1.0 },
        { f: 352, q: 3.0, g: 0.55 },
        { f: 1180, q: 2.0, g: 0.18 },
      ],
      r: [
        { f: 131, q: 2.2, g: 1.0 },
        { f: 389, q: 3.0, g: 0.5 },
        { f: 1270, q: 2.0, g: 0.16 },
      ],
    },
    /** Dry share of the raw pulse kept beside the resonances (the bark). */
    dry: 0.35,
    /** Turbine muffling: low-pass that darkens as boost rises (the turbine eats the pulse's edge). */
    turbineCutoff: { noBoost: 4200, fullBoost: 1350 },
    /** Silencer: a further low-pass and an overall gain. */
    silencerCutoff: 2600,
    silencerGain: 0.9,
    /** Stereo: each bank leans to its own side (left bank to the left channel). */
    width: 0.32,
    /**
     * Centre outlet (wastegates): opens above this share of peak boost and adds a brighter,
     * barely muffled share of both banks.
     */
    wastegateFrom: 0.82,
    wastegateLevel: 0.45,
    wastegateCutoff: 5200,
  },
  /** Induction: filtered noise pulled by each intake stroke, rising with throttle. */
  induction: { pulseAt: 380, width: 0.006, bandHz: 1100, q: 0.9, level: 0.05, throttle: 0.85 },
  /** Turbo whistle: narrow band tracking a spool-lagged turbo speed (0…1), louder with boost. */
  turbo: { spoolTau: 0.7, fromHz: 2300, toHz: 7400, q: 38, level: 0.05, tone: 0.35 },
  /** Lift-off on boost: compressor flutter, amplitude-modulated noise bursts, decaying. */
  flutter: { fromBoost: 0.5, rateHz: 19, rateSpread: 6, decay: 0.42, bandHz: 950, q: 1.4, level: 0.5 },
  /** Mechanical: valvetrain tick at each valve opening (cam frequency), and the cam belts' whine. */
  mechanical: { tickLevel: 0.012, tickBand: 4200, beltTeeth: 20, beltLevel: 0.004 },
  /** Starter: motor whine and the slow compression pulses while cranking. */
  /** `freeRpm`: crank-equivalent speed the motor spins at most (its pinion overruns once the engine fires). */
  starter: { motorRatio: 34, freeRpm: 230, whineLevel: 0.06, chugLevel: 0.45, engageThud: 0.5 },
  /**
   * 8D-2, the drivetrain (all est). Gearbox whine: the straight-cut final drive's tooth mesh
   * (secondary shaft speed × pinion teeth), with a second harmonic; a little at a cruise,
   * louder under load. Rolling road: low noise whose level and brightness rise with road
   * speed. Clunk: each dog engagement, a short low knock with a small metallic click.
   */
  gearbox: { pinionTeeth: 17, level: 0.004, loadGain: 3, harmonic: 0.35, fadeInRpm: 300 },
  road: { level: 0.09, refKmh: 324, power: 1.5, cutoff: [160, 820] as const, highpass: 35 },
  clunk: { freq: 92, decay: 0.035, level: 0.55, click: 0.18, clickBand: 2200, clickDecay: 0.003 },
  /**
   * 9B exhaust pops (est), one per pop the sim fires (with the flame): a short crack (band-
   * passed noise), a low thump, then a few ms of crackle; all × the pop's strength.
   */
  pops: { crack: 2.4, crackHz: 1300, crackQ: 0.7, crackDecay: 0.022, thump: 1.2, thumpHz: 62, thumpDecay: 0.06, crackle: 0.9, crackleS: 0.14, crackleRate: 900 },
  /**
   * 9B sound by camera position (all est), computed on the main thread from where the camera
   * is relative to the car and smoothed over `smoothS`: the exhaust louder (`exhaust`, at most
   * ×) and brighter from behind; induction and turbo louder from above or near the engine bay;
   * a gentle distance falloff (× (refM / d)^`falloff`, clamped); and a slight pan toward the
   * side of the screen the car's rear is on. Never silent; the offline review clips stay
   * camera-neutral except the orbit clip.
   */
  position: {
    smoothS: 0.25,
    exhaust: { behind: 1.35, front: 0.72 },
    bright: 0.55,
    intake: { above: 1.35, nearBay: 1.4, nearM: 1.6 },
    falloff: 0.45,
    refM: 6,
    gain: [0.5, 1.2] as const,
    pan: 0.25,
  },
  /**
   * Master, inside the worklet: DC block, a stereo-linked compressor (dB; attack and release
   * in s; makeup gain dB), then a soft limiter whose ceiling is the loudest sample possible
   * (0.85 = −1.4 dBFS). Only the volume (≤ 1) comes after it.
   */
  master: {
    outputGain: 2.4,
    /** Highpass on the output (removes the pulses' DC). */
    dcHz: 22,
    compressor: { threshold: -9, knee: 8, ratio: 2.5, attack: 0.003, release: 0.2, makeup: 0 },
    ceiling: 0.85,
    /** Ramp for volume, mute and the hidden-tab duck. */
    ramp: 0.12,
    duckHidden: 0,
  },
  /** Parameter smoothing inside the synth (s): the sim sends values once a frame. */
  smoothing: 0.03,
} as const;

export type SoundConfig = typeof SOUND;
