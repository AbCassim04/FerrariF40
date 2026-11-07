/** Tessellation counts, kept together so the performance pass can tune them in one place. */
export const SEGMENTS = {
  wheel: 64,
  tyreShoulder: 6,
  cylinder: 48,
} as const;
