import { create } from 'zustand';
import { SCENE } from '../config/scene';
import { isPhone } from './ui';

const { tiers, phoneStart } = SCENE.quality;
export type Tier = (typeof tiers)[number];

/** Dev: `?tier=N` pins the tier (review shots run in a slow browser that would drop it at once). */
const pinnedTier = import.meta.env.DEV ? new URLSearchParams(location.search).get('tier') : null;
const startTier = pinnedTier !== null ? Math.min(tiers.length - 1, Math.max(0, Number(pinnedTier) || 0)) : isPhone ? phoneStart : 0;

interface QualityState {
  /** Index into SCENE.quality.tiers: 0 = high. */
  tier: number;
  /** Pinned (dev): the frame watch never drops it. */
  pinned: boolean;
  /** Why the last drop happened (median frame time, ms), for the dev readout. */
  reason: string | null;
  /** One tier down (never back up). */
  drop: (reason: string) => void;
}

export const useQuality = create<QualityState>()((set) => ({
  tier: startTier,
  pinned: pinnedTier !== null,
  reason: null,
  drop: (reason) => set((s) => (s.tier < tiers.length - 1 ? { tier: s.tier + 1, reason } : s)),
}));

export const tierOf = (index: number): Tier => tiers[index];
export const useTier = () => tierOf(useQuality((s) => s.tier));
/** Real speed (blurred copies of every moving mesh) is offered at the top tier only. */
export const useRealAllowed = () => useQuality((s) => s.tier === 0);
