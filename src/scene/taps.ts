import type { Vector3 } from 'three';

/**
 * Taps and clicks on the canvas. A single tap (select a part, or close the panel on empty
 * space) acts after a short wait, so that a second tap can make it a double tap instead,
 * which re-centres the orbit on the point tapped (the camera rig handles it). Mouse and
 * touch alike: double-click on a desktop, double-tap on a phone.
 */

/** Second tap within this long (ms) and this close (px) of the first: a double tap. */
export const DOUBLE_TAP = { ms: 300, px: 28 };
/** Pointer travel (px) between down and up that still counts as a tap, by pointer type (a thumb wobbles more than a mouse). */
export const tapSlop = (e: Event) => ((e as PointerEvent).pointerType === 'touch' || (e as PointerEvent).pointerType === 'pen' ? 10 : 4);

interface Pending {
  x: number;
  y: number;
  t: number;
  action: () => void;
  timer: number;
}

let pending: Pending | null = null;
/** Clicks right after a double tap are its own trailing events: ignored. */
let swallowUntil = 0;

/** Set by the camera rig: what a double tap does (the point is null over empty space). */
export const tapHandlers: { doubleTap: ((point: Vector3 | null) => void) | null } = { doubleTap: null };

/** A tap at the event's position: `action` runs unless a second tap turns it into a double tap. */
export function tap(e: MouseEvent, action: () => void, point?: Vector3) {
  // When the event happened, not when it was handled: a busy frame can hold a tap back.
  const now = e.timeStamp || performance.now();
  if (now < swallowUntil) return;
  const p = pending;
  if (p && now - p.t < DOUBLE_TAP.ms && Math.hypot(e.clientX - p.x, e.clientY - p.y) < DOUBLE_TAP.px) {
    clearTimeout(p.timer);
    pending = null;
    swallowUntil = now + 60;
    tapHandlers.doubleTap?.(point ?? null);
    return;
  }
  // A new tap elsewhere: the earlier one acts now.
  if (p) {
    clearTimeout(p.timer);
    pending = null;
    p.action();
  }
  const next: Pending = { x: e.clientX, y: e.clientY, t: now, action, timer: 0 };
  next.timer = window.setTimeout(() => {
    if (pending === next) pending = null;
    action();
  }, DOUBLE_TAP.ms);
  pending = next;
}
