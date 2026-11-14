import { useEffect, useRef } from 'react';
import { ENGINE_SIM, TIME_SCALES, type TimeScaleName } from '../config/engine-sim';
import { engineAudio } from '../engine/audio/engineAudio';
import { cylinderNumber, firingAngle, SIDES, CYLINDERS } from '../parts/engine/layout';
import { reducedMotion, useEngineStore } from '../state/engine';

const NON_TEXT_INPUTS = new Set(['checkbox', 'radio', 'button', 'range', 'color']);
const isTextEntry = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && !NON_TEXT_INPUTS.has(t.type)));

/** Start / Stop, beside Explode and X-ray. Starting also wakes the sound (browsers only allow it from a click). */
export function EngineButton() {
  const phase = useEngineStore((s) => s.phase);
  const on = phase !== 'off' && phase !== 'stopping';
  return (
    <button
      type="button"
      className="engine-btn"
      aria-pressed={on}
      onClick={() => {
        const store = useEngineStore.getState();
        if (on) store.stop();
        else {
          void engineAudio.start();
          store.start();
        }
      }}
    >
      <span className="engine-btn__dot" aria-hidden="true" />
      {on ? 'Stop' : 'Start'}
    </button>
  );
}

/** Cylinders in firing order, for Strokes mode's picker. */
const FIRING_ORDER = SIDES.flatMap((s) => CYLINDERS.map((i) => ({ s, i, at: firingAngle(s, i) }))).sort((a, b) => a.at - b.at);

/** While the engine runs: gauges, the throttle, the display speed, the followed cylinder and the volume. */
export function EnginePanel() {
  const running = useEngineStore((s) => s.engineRunning);
  if (!running) return null;
  return (
    <div className="engine-panel" role="group" aria-label="Engine">
      <Gauges />
      <ThrottleButton />
      <SpeedSelector />
      <CylinderPicker />
      <Volume />
    </div>
  );
}

const TACH_MAX = 9000;
const BOOST_MAX = 1.2;

/** Tachometer and boost gauge, updated from the store without re-rendering React. */
function Gauges() {
  const tach = useRef<SVGPathElement>(null);
  const rpm = useRef<HTMLSpanElement>(null);
  const boostArc = useRef<SVGPathElement>(null);
  const boost = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const draw = (s: ReturnType<typeof useEngineStore.getState>) => {
      tach.current?.setAttribute('d', arc(Math.min(1, s.rpm / TACH_MAX)));
      boostArc.current?.setAttribute('d', arc(Math.min(1, Math.max(0, s.boost) / BOOST_MAX)));
      if (rpm.current) rpm.current.textContent = String(Math.round(s.rpm / 10) * 10);
      if (boost.current) boost.current.textContent = s.boost.toFixed(1);
      tach.current?.parentElement?.parentElement?.toggleAttribute('data-limiter', s.limiter);
    };
    draw(useEngineStore.getState());
    return useEngineStore.subscribe(draw);
  }, []);
  const red = ENGINE_SIM.limiterRpm / TACH_MAX;
  return (
    <div className="gauges">
      <div className="gauge" aria-label="Engine speed">
        <svg viewBox="0 0 100 60" aria-hidden="true">
          <path className="gauge__track" d={arc(1)} />
          <path className="gauge__red" d={arc(1, red)} />
          <path ref={tach} className="gauge__fill" d={arc(0)} />
        </svg>
        <span className="gauge__value" ref={rpm}>
          0
        </span>
        <span className="gauge__unit">rpm</span>
      </div>
      <div className="gauge gauge--small" aria-label="Boost">
        <svg viewBox="0 0 100 60" aria-hidden="true">
          <path className="gauge__track" d={arc(1)} />
          <path ref={boostArc} className="gauge__fill gauge__fill--boost" d={arc(0)} />
        </svg>
        <span className="gauge__value" ref={boost}>
          0.0
        </span>
        <span className="gauge__unit">bar</span>
      </div>
    </div>
  );
}

/** SVG arc of a 240° gauge from fraction `from` to `to`. */
function arc(to: number, from = 0) {
  const a0 = (-210 + 240 * from) * (Math.PI / 180);
  const a1 = (-210 + 240 * Math.max(from + 1e-4, to)) * (Math.PI / 180);
  const r = 40;
  const p = (a: number) => `${50 + r * Math.cos(a)} ${52 + r * Math.sin(a)}`;
  return `M ${p(a0)} A ${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p(a1)}`;
}

/** Hold to open the throttle (also Space or W; touch-hold on phones). */
function ThrottleButton() {
  const pedal = useEngineStore((s) => s.pedal);
  const setPedal = useEngineStore((s) => s.setPedal);
  useEffect(() => {
    const keys = new Set([' ', 'w', 'W']);
    const down = (e: KeyboardEvent) => {
      if (!keys.has(e.key) || e.metaKey || e.ctrlKey || e.altKey || isTextEntry(e.target)) return;
      e.preventDefault();
      if (!e.repeat) setPedal(true);
    };
    const up = (e: KeyboardEvent) => keys.has(e.key) && setPedal(false);
    const release = () => setPedal(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', release);
      setPedal(false);
    };
  }, [setPedal]);
  return (
    <button
      type="button"
      className="throttle-btn"
      aria-pressed={pedal}
      aria-label="Throttle (hold, or hold Space or W)"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setPedal(true);
      }}
      onPointerUp={() => setPedal(false)}
      onPointerCancel={() => setPedal(false)}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => (e.key === 'Enter' ? setPedal(true) : undefined)}
      onKeyUp={(e) => (e.key === 'Enter' ? setPedal(false) : undefined)}
    >
      Throttle
      <kbd>Space</kbd>
    </button>
  );
}

function SpeedSelector() {
  const timeScale = useEngineStore((s) => s.timeScale);
  const set = useEngineStore((s) => s.setTimeScale);
  return (
    <div className="speed" role="radiogroup" aria-label="Display speed">
      {/* Reduced motion: no Real (a strobing blur). */}
      {(Object.keys(TIME_SCALES) as TimeScaleName[]).filter((k) => !(reducedMotion && k === 'real')).map((k) => (
        <button key={k} type="button" role="radio" aria-checked={timeScale === k} onClick={() => set(k)}>
          {TIME_SCALES[k].label}
        </button>
      ))}
    </div>
  );
}

/** Strokes mode: which cylinder to follow (also: click a piston while inspecting). */
function CylinderPicker() {
  const strokes = useEngineStore((s) => s.timeScale === 'strokes');
  const c = useEngineStore((s) => s.strokeCylinder);
  const set = useEngineStore((s) => s.setStrokeCylinder);
  if (!strokes) return null;
  const k = FIRING_ORDER.findIndex((f) => f.s === c.s && f.i === c.i);
  const step = (d: number) => {
    const n = FIRING_ORDER[(k + d + FIRING_ORDER.length) % FIRING_ORDER.length];
    set({ s: n.s, i: n.i });
  };
  return (
    <div className="cyl-picker" aria-label="Followed cylinder">
      <button type="button" aria-label="Previous cylinder in the firing order" onClick={() => step(-1)}>
        ‹
      </button>
      <span>Cyl {cylinderNumber(c.s, c.i)}</span>
      <button type="button" aria-label="Next cylinder in the firing order" onClick={() => step(1)}>
        ›
      </button>
    </div>
  );
}

function Volume() {
  const volume = useEngineStore((s) => s.volume);
  const muted = useEngineStore((s) => s.muted);
  const setVolume = useEngineStore((s) => s.setVolume);
  const toggleMute = useEngineStore((s) => s.toggleMute);
  useEffect(() => engineAudio.setVolume(volume, muted), [volume, muted]);
  return (
    <div className="volume">
      <button type="button" className="volume__mute" aria-pressed={muted} aria-label={muted ? 'Unmute' : 'Mute'} onClick={toggleMute}>
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M3 8h3l4-3v10l-4-3H3z" />
          {muted ? <path className="volume__x" d="M13 7l5 6M18 7l-5 6" /> : <path className="volume__waves" d="M13 7.5c1.2 1.4 1.2 3.6 0 5M15.2 5.5c2.4 2.6 2.4 6.4 0 9" />}
        </svg>
      </button>
      <input type="range" min={0} max={1} step={0.01} value={muted ? 0 : volume} aria-label="Volume" onChange={(e) => setVolume(Number(e.target.value))} />
    </div>
  );
}

