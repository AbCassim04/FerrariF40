/**
 * URL of a file in public/, given relative to the site root ('models/body.opt.glb').
 * The site is served from a subpath in production (vite.config.ts `base`), so asset
 * URLs must never start with '/'.
 */
export const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`;
