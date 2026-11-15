import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ENGINE_SIM, TIME_SCALES, type TimeScaleName } from '../config/engine-sim';
import { engineAudio } from '../engine/audio/engineAudio';
import { cylinderNumber, firingAngle, SIDES, CYLINDERS } from '../parts/engine/layout';
import { reducedMotion, useEngineStore } from '../state/engine';
import { useRealAllowed } from '../state/quality';
import { useUiStore } from '../state/ui';

const NON_TEXT_INPUTS = new Set(['checkbox', 'radio', 'button', 'range', 'color']);
const isTextEntry = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && !NON_TEXT_INPUTS.has(t.type)));

/** The engine is on (starting or running), not off or coasting down. */
export const useEngineOn = () => useEngineStore((s) => s.phase !== 'off' && s.phase !== 'stopping');

/** Start / Stop. Starting also wakes the sound (browsers only allow it from a click). `iconOnly`: a square button (phone bars). */
export function EngineButton({ iconOnly = false }: { iconOnly?: boolean }) {
  const on = useEngineOn();
  return (
    <button
      type="button"
      className={`engine-btn${iconOnly ? ' engine-btn--icon' : ''}`}
      aria-pressed={on}
      aria-label={on ? 'Stop the engine' : 'Start the engine'}
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
      {!iconOnly && (on ? 'Stop' : 'Start')}
    </button>
  );
}

/** Throttle and keyboard: Space or W held opens the throttle while the engine runs (whatever is on screen). */
export function EngineKeys() {
  const setPedal = useEngineStore((s) => s.setPedal);
  const running = useEngineStore((s) => s.engineRunning);
  useEffect(() => {
    if (!running) return;
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
  }, [running, setPedal]);
  return null;
}

/** Cylinders in firing order, for Strokes mode's picker. */
const FIRING_ORDER = SIDES.flatMap((s) => CYLINDERS.map((i) => ({ s, i, at: firingAngle(s, i) }))).sort((a, b) => a.at - b.at);

const TACH_MAX = 9000;

/**
 * Engine speed and boost: a small tach arc with the rpm in it, boost beside. `bar`: inline
 * in the desktop bar; `hud`: the phones' chip at the top centre. Drawn from the store
 * without re-rendering React.
 */
export function Readout({ variant }: { variant: 'bar' | 'hud' }) {
  const root = useRef<HTMLDivElement>(null);
  const tach = useRef<SVGPathElement>(null);
  const rpm = useRef<HTMLSpanElement>(null);
  const boost = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const draw = (s: ReturnType<typeof useEngineStore.getState>) => {
      tach.current?.setAttribute('d', arc(Math.min(1, s.rpm / TACH_MAX)));
      if (rpm.current) rpm.current.textContent = String(Math.round(s.rpm / 10) * 10);
      if (boost.current) boost.current.textContent = Math.max(0, s.boost).toFixed(1);
      root.current?.toggleAttribute('data-limiter', s.limiter);
    };
    draw(useEngineStore.getState());
    return useEngineStore.subscribe(draw);
  }, []);
  return (
    <div ref={root} className={`readout readout--${variant}`} role="group" aria-label="Engine speed and boost" data-occludes={variant === 'hud' ? '' : undefined}>
      <div className="readout__tach">
        <svg viewBox="0 0 100 70" aria-hidden="true">
          <path className="readout__track" d={arc(1)} />
          <path className="readout__red" d={arc(1, ENGINE_SIM.limiterRpm / TACH_MAX)} />
          <path ref={tach} className="readout__fill" d={arc(0)} />
        </svg>
        <span className="readout__rpm" ref={rpm}>
          0
        </span>
        <span className="readout__unit readout__unit--tach">rpm</span>
      </div>
      <span className="readout__cell">
        <span className="readout__value" ref={boost}>
          0.0
        </span>
        <span className="readout__unit">bar</span>
      </span>
    </div>
  );
}

/** SVG arc of a 240° gauge from fraction `from` to `to`. */
function arc(to: number, from = 0) {
  const a0 = (-210 + 240 * from) * (Math.PI / 180);
  const a1 = (-210 + 240 * Math.max(from + 1e-4, to)) * (Math.PI / 180);
  const r = 40;
  const p = (a: number) => `${50 + r * Math.cos(a)} ${50 + r * Math.sin(a)}`;
  return `M ${p(a0)} A ${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p(a1)}`;
}

/** Distance (px) a finger may stray outside a hold-button before it lets go. */
const HOLD_SLOP = 14;

/**
 * A button held down to act (throttle, later the brake): pressed while a pointer is down
 * on it. Pointer capture keeps the press when the finger moves, and it releases as soon as
 * the finger slides off the button (and presses again if it slides back on). No text
 * selection, callout, scrolling or zooming from it (styles.css: `.hold`).
 */
export function HoldButton({ className, label, pressed, onHold, children }: { className: string; label: string; pressed: boolean; onHold: (on: boolean) => void; children: ReactNode }) {
  const active = useRef<number | null>(null);
  const inside = (el: HTMLElement, x: number, y: number) => {
    const r = el.getBoundingClientRect();
    return x >= r.left - HOLD_SLOP && x <= r.right + HOLD_SLOP && y >= r.top - HOLD_SLOP && y <= r.bottom + HOLD_SLOP;
  };
  const end = () => {
    active.current = null;
    onHold(false);
  };
  return (
    <button
      type="button"
      className={`hold ${className}`}
      aria-pressed={pressed}
      aria-label={label}
      onPointerDown={(e) => {
        if (e.button > 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        active.current = e.pointerId;
        onHold(true);
      }}
      onPointerMove={(e) => {
        if (active.current !== e.pointerId) return;
        const on = inside(e.currentTarget, e.clientX, e.clientY);
        if (on !== pressed) onHold(on);
      }}
      onPointerUp={(e) => active.current === e.pointerId && end()}
      onPointerCancel={(e) => active.current === e.pointerId && end()}
      onLostPointerCapture={(e) => active.current === e.pointerId && end()}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => (e.key === 'Enter' ? onHold(true) : undefined)}
      onKeyUp={(e) => (e.key === 'Enter' ? onHold(false) : undefined)}
      onBlur={() => pressed && onHold(false)}
    >
      {children}
    </button>
  );
}

/** Hold to open the throttle. `pill`: in a bar; `thumb`: the big round button under the right thumb (landscape phones). */
export function ThrottleButton({ variant }: { variant: 'pill' | 'thumb' }) {
  const pedal = useEngineStore((s) => s.pedal);
  const setPedal = useEngineStore((s) => s.setPedal);
  return (
    <HoldButton className={`throttle-btn throttle-btn--${variant}`} label="Throttle (hold; or hold Space or W)" pressed={pedal} onHold={setPedal}>
      <svg className="throttle-btn__icon" viewBox="0 0 20 20" aria-hidden="true">
        <path d="M4 15 10 4l6 11" />
        <path d="M7 15h6" />
      </svg>
      <span className="throttle-btn__label">Throttle</span>
      <kbd>Space</kbd>
    </HoldButton>
  );
}

/** Opens the "more" panel (display speed, cylinder, volume…). */
export function MoreButton() {
  const open = useUiStore((s) => s.moreOpen);
  const toggle = useUiStore((s) => s.toggleMore);
  return (
    <button type="button" className="icon-btn more-btn" aria-label="More engine controls" aria-expanded={open} aria-controls="more-panel" onClick={toggle}>
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="4.5" cy="10" r="1.6" />
        <circle cx="10" cy="10" r="1.6" />
        <circle cx="15.5" cy="10" r="1.6" />
      </svg>
    </button>
  );
}

function SpeedSelector() {
  const timeScale = useEngineStore((s) => s.timeScale);
  const set = useEngineStore((s) => s.setTimeScale);
  // Real (blurred copies of every moving part) only at the top quality tier, never with reduced motion.
  const realAllowed = useRealAllowed() && !reducedMotion;
  const names = (Object.keys(TIME_SCALES) as TimeScaleName[]).filter((k) => k !== 'real' || realAllowed);
  return (
    <div className="seg" role="radiogroup" aria-label="Display speed">
      {names.map((k) => (
        <button key={k} type="button" role="radio" aria-checked={timeScale === k} onClick={() => set(k)}>
          {TIME_SCALES[k].label}
        </button>
      ))}
    </div>
  );
}

/** Strokes mode: which cylinder to follow (also: click a piston). */
function CylinderPicker() {
  const c = useEngineStore((s) => s.strokeCylinder);
  const set = useEngineStore((s) => s.setStrokeCylinder);
  const k = FIRING_ORDER.findIndex((f) => f.s === c.s && f.i === c.i);
  const step = (d: number) => {
    const n = FIRING_ORDER[(k + d + FIRING_ORDER.length) % FIRING_ORDER.length];
    set({ s: n.s, i: n.i });
  };
  return (
    <div className="cyl-picker" aria-label="Followed cylinder">
      <button type="button" className="icon-btn" aria-label="Previous cylinder in the firing order" onClick={() => step(-1)}>
        ‹
      </button>
      <span>Cylinder {cylinderNumber(c.s, c.i)}</span>
      <button type="button" className="icon-btn" aria-label="Next cylinder in the firing order" onClick={() => step(1)}>
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
  return (
    <div className="volume">
      <button type="button" className="icon-btn volume__mute" aria-pressed={muted} aria-label={muted ? 'Unmute' : 'Mute'} onClick={toggleMute}>
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M3 8h3l4-3v10l-4-3H3z" />
          {muted ? <path className="volume__x" d="M13 7l5 6M18 7l-5 6" /> : <path className="volume__waves" d="M13 7.5c1.2 1.4 1.2 3.6 0 5M15.2 5.5c2.4 2.6 2.4 6.4 0 9" />}
        </svg>
      </button>
      <input type="range" min={0} max={1} step={0.01} value={muted ? 0 : volume} aria-label="Volume" onChange={(e) => setVolume(Number(e.target.value))} />
    </div>
  );
}

/** Keeps the sound's level in step with the volume control, mounted or not. */
export function VolumeSync() {
  const volume = useEngineStore((s) => s.volume);
  const muted = useEngineStore((s) => s.muted);
  useEffect(() => engineAudio.setVolume(volume, muted), [volume, muted]);
  return null;
}

/**
 * The "more" panel: a bottom sheet on phones (slides up, a tap outside or the grabber puts it
 * away), a small card above the bar on desktop. `extra`: controls that don't fit the bar in
 * this layout (Explode and X-ray on a phone while driving).
 */
export function MorePanel({ extra, sheet }: { extra?: ReactNode; sheet: boolean }) {
  const open = useUiStore((s) => s.moreOpen);
  const setMore = useUiStore((s) => s.setMore);
  const compact = useUiStore((s) => s.compact);
  const setCompact = useUiStore((s) => s.setCompact);
  const running = useEngineStore((s) => s.engineRunning);
  const strokes = useEngineStore((s) => s.timeScale === 'strokes');
  // Mounted, then opened on the next frame (so it slides in); closed, then unmounted once it has slid away.
  const [shown, setShown] = useState(false);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (open) {
      setShown(true);
      let inner = 0;
      const outer = requestAnimationFrame(() => (inner = requestAnimationFrame(() => setVisible(true))));
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      };
    }
    setVisible(false);
    const t = window.setTimeout(() => setShown(false), 260);
    return () => clearTimeout(t);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMore(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setMore]);
  useEffect(() => {
    if (!running) setMore(false);
  }, [running, setMore]);
  if (!shown) return null;
  return (
    <>
      {sheet && <div className="sheet-backdrop" data-open={visible || undefined} onClick={() => setMore(false)} />}
      <section id="more-panel" className={sheet ? 'more more--sheet' : 'more more--card'} data-open={visible || undefined} data-occludes="" aria-label="Engine settings">
        {sheet && <button type="button" className="sheet__grabber" aria-label="Close" onClick={() => setMore(false)} />}
        {extra && <div className="more__row more__row--actions">{extra}</div>}
        {running && (
          <>
            <div className="more__row">
              <span className="more__label">Display speed</span>
              <SpeedSelector />
            </div>
            {strokes && (
              <div className="more__row">
                <span className="more__label">Strokes</span>
                <CylinderPicker />
              </div>
            )}
            <div className="more__row">
              <span className="more__label">Sound</span>
              <Volume />
            </div>
            <div className="more__row">
              <span className="more__label">Driving controls</span>
              <button type="button" className="switch" role="switch" aria-checked={!compact} onClick={() => setCompact(!compact)}>
                <span className="switch__knob" aria-hidden="true" />
                <span className="switch__text">{compact ? 'Hidden' : 'Shown'}</span>
              </button>
            </div>
          </>
        )}
      </section>
    </>
  );
}
