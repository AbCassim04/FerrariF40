import { SCENE } from '../config/scene';
import { useCameraFeel, type CameraProfileName } from '../state/cameraFeel';
import { useEngineStore } from '../state/engine';

/** 9A settings in the "more" panel and beside the gear: camera feel, auto shift, dyno run, dyno graph. */

const PROFILES = Object.keys(SCENE.controls.profiles) as CameraProfileName[];

/** Camera feel: three profiles to compare; switching is instant and remembered. */
export function CameraFeelChoice() {
  const profile = useCameraFeel((s) => s.profile);
  const set = useCameraFeel((s) => s.setProfile);
  return (
    <div className="seg" role="radiogroup" aria-label="Camera feel">
      {PROFILES.map((k) => (
        <button key={k} type="button" role="radio" aria-checked={profile === k} onClick={() => set(k)}>
          {SCENE.controls.profiles[k].label}
        </button>
      ))}
    </div>
  );
}

export const AUTO_NOTE = 'The real F40 is manual-only; Auto shift just changes gear for you.';

/** Manual / Auto beside the gear: labelled honestly (the real car is manual-only). */
export function AutoShiftToggle() {
  const on = useEngineStore((s) => s.autoShift);
  const set = useEngineStore((s) => s.setAutoShift);
  return (
    <button type="button" className="auto-btn" aria-pressed={on} aria-label={`Auto shift ${on ? 'on' : 'off'}. ${AUTO_NOTE}`} title={`Auto shift. ${AUTO_NOTE}`} onClick={() => set(!on)}>
      <span className="auto-btn__dot" aria-hidden="true" />
      {on ? 'Auto' : 'Manual'}
    </button>
  );
}

function Switch({ on, set, label }: { on: boolean; set: (v: boolean) => void; label: [string, string] }) {
  return (
    <button type="button" className="switch" role="switch" aria-checked={on} onClick={() => set(!on)}>
      <span className="switch__knob" aria-hidden="true" />
      <span className="switch__text">{on ? label[0] : label[1]}</span>
    </button>
  );
}

export function AutoShiftSwitch() {
  const on = useEngineStore((s) => s.autoShift);
  const set = useEngineStore((s) => s.setAutoShift);
  return <Switch on={on} set={set} label={['Auto', 'Manual']} />;
}

export function DynoGraphSwitch() {
  const on = useEngineStore((s) => s.dynoGraph);
  const set = useEngineStore((s) => s.setDynoGraph);
  return <Switch on={on} set={set} label={['Shown', 'Hidden']} />;
}

/** A hands-off full-throttle pull from rest to top speed, then braking; any input cancels it. */
export function DynoRunButton() {
  const running = useEngineStore((s) => s.dynoRunning);
  const dyno = useEngineStore((s) => s.dyno);
  return (
    <button type="button" className="pill-btn" aria-pressed={running} onClick={() => dyno(!running)}>
      {running ? 'Stop run' : 'Run'}
    </button>
  );
}
