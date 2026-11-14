import type { SimState } from '../sim';

/**
 * The engine's sound (phase 8C). Until it exists, a silent stand-in with the same interface.
 */
export const engineAudio = {
  /** Called on the Start click (the browser only lets audio start from a user gesture). */
  async start() {},
  /** Every frame while the engine turns: hands the sim's state to the synth. */
  update(sim: SimState, dt: number) {
    void sim;
    void dt;
  },
  setHidden(hidden: boolean) {
    void hidden;
  },
  setVolume(volume: number, muted: boolean) {
    void volume;
    void muted;
  },
};
