/** Tessellation counts, kept together so the performance pass can tune them in one place. */
export const SEGMENTS = {
  wheel: 64,
  tyreShoulder: 6,
  cylinder: 48,
  /** Small round parts: bolts, valves, springs' cross-sections. */
  small: 16,
  /** Curved edges of extruded outlines. */
  curve: 12,
  bevel: 2,
  roundedBox: 2,
  tube: 64,
  tubeRadial: 10,
  /** Per coil of a valve spring. */
  springCoil: 20,
  /** Plenum loft: stations along its length, points across each section. */
  loftStations: 64,
  loftSection: 56,
  /** Along a ribbed intake bellows (at least ~8 per rib). */
  bellows: 220,
  /** Along each exhaust primary. */
  primary: 160,
} as const;
