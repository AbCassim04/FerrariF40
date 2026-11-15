/**
 * The part of the canvas a framed subject can use: the canvas minus the UI laid over it
 * (bars, sheets, the inspect panel, the gauges). Measured from the page itself at framing
 * time, so it holds for every layout and orientation without constants.
 *
 * UI that should keep the subject clear of it carries `data-occludes`. Each occluder cuts
 * the free rectangle from whichever side keeps the most of it (a bottom bar cuts from the
 * bottom, a side panel from the right). A cut that would leave less than `MIN` of either
 * dimension is skipped, so the area can never collapse (an earlier fixed 100 px reserve
 * plus the panel fractions could leave next to nothing on a landscape phone).
 */

/**
 * Free area as fractions of the canvas (`w`, `h`) and its centre in normalised device
 * coordinates (`cx`, `cy`: −1…1, +y up).
 */
export interface Area {
  w: number;
  h: number;
  cx: number;
  cy: number;
}

export const FULL: Area = { w: 1, h: 1, cx: 0, cy: 0 };

/** Smallest share of the canvas's width or height a cut may leave. */
const MIN = 0.38;
/** Breathing room kept between the subject's area and the UI (px). */
const GAP = 8;

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const area = (r: Rect) => Math.max(0, r.right - r.left) * Math.max(0, r.bottom - r.top);

export function measureFreeArea(canvas: Element | null | undefined): Area {
  if (!canvas || typeof document === 'undefined') return FULL;
  const c = canvas.getBoundingClientRect();
  if (c.width < 1 || c.height < 1) return FULL;
  let free: Rect = { left: c.left, top: c.top, right: c.right, bottom: c.bottom };
  const occluders = [...document.querySelectorAll<HTMLElement>('[data-occludes]')]
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.width > 0 && r.height > 0)
    // Largest first: the big panels decide the shape, small items then trim it.
    .sort((a, b) => b.width * b.height - a.width * a.height);
  for (const o of occluders) {
    // Outside the current free area: nothing to cut.
    if (o.right <= free.left || o.left >= free.right || o.bottom <= free.top || o.top >= free.bottom) continue;
    const options: Rect[] = [
      { ...free, top: Math.max(free.top, o.bottom + GAP) },
      { ...free, bottom: Math.min(free.bottom, o.top - GAP) },
      { ...free, left: Math.max(free.left, o.right + GAP) },
      { ...free, right: Math.min(free.right, o.left - GAP) },
    ].filter((r) => r.right - r.left >= c.width * MIN && r.bottom - r.top >= c.height * MIN);
    if (!options.length) continue;
    free = options.reduce((best, r) => (area(r) > area(best) ? r : best));
  }
  const w = (free.right - free.left) / c.width;
  const h = (free.bottom - free.top) / c.height;
  const cx = ((free.left + free.right) / 2 - c.left) / c.width * 2 - 1;
  const cy = 1 - ((free.top + free.bottom) / 2 - c.top) / c.height * 2;
  return { w, h, cx, cy };
}
