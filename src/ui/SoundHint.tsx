import { useEffect, useState } from 'react';
import { engineAudio } from '../engine/audio/engineAudio';

/** How long the hint stays up (s). */
const SHOW_FOR = 7;

/**
 * Once per device, on iPhones that can't play past the ringer's silent switch (no
 * navigator.audioSession): after Start, a short note at the top that the switch may be why
 * there is no sound.
 */
export function SoundHint() {
  const [shown, setShown] = useState(false);
  useEffect(() => engineAudio.onHint(() => setShown(true)), []);
  useEffect(() => {
    if (!shown) return;
    const t = window.setTimeout(() => setShown(false), SHOW_FOR * 1000);
    return () => clearTimeout(t);
  }, [shown]);
  if (!shown) return null;
  return (
    <div className="toast" role="status">
      No sound? Check the silent switch.
      <button type="button" className="toast__close" aria-label="Dismiss" onClick={() => setShown(false)}>
        ×
      </button>
    </div>
  );
}
