import { useEffect, useState } from 'react';
import { useAppStore } from '../state/store';

const KEY = 'f40.flowCaption';
const SHOW_FOR = 8;

/** 9B: the first time Flow is turned on (per device), a note about the third, centre tailpipe. */
export function FlowCaption() {
  const flow = useAppStore((s) => s.flow);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!flow) return;
    let seen = false;
    try {
      seen = localStorage.getItem(KEY) === '1';
      localStorage.setItem(KEY, '1');
    } catch {
      /* storage blocked: show it each visit */
    }
    if (!seen) setShown(true);
  }, [flow]);
  useEffect(() => {
    if (!shown) return;
    const t = window.setTimeout(() => setShown(false), SHOW_FOR * 1000);
    return () => clearTimeout(t);
  }, [shown]);
  if (!shown || !flow) return null;
  return (
    <div className="toast" role="status">
      Third pipe: wastegate. It only flows at full boost.
      <button type="button" className="toast__close" aria-label="Dismiss" onClick={() => setShown(false)}>
        ×
      </button>
    </div>
  );
}
