/** Formatters for spec-sheet values, so specs are computed from DIMS rather than typed in. */

export const fmtMm = (metres: number, digits = 1) => `${(metres * 1000).toFixed(digits)} mm`;

export const fmtM = (metres: number, digits = 3) => `${metres.toFixed(digits)} m`;

export const fmtDeg = (radians: number, digits = 0) => `${((radians * 180) / Math.PI).toFixed(digits)}°`;
