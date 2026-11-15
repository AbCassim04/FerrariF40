import { ContactShadows, Grid } from '@react-three/drei';
import { SCENE } from '../config/scene';
import { useTier } from '../state/quality';
import { useContactShadowTick } from './ShadowScheduler';

const { grid, contactShadows } = SCENE;

/** Metre grid (10 cm cells) with soft contact shadows on top of it. */
export function Ground() {
  // Each tick re-renders this, which makes ContactShadows render one more frame (see ShadowScheduler).
  useContactShadowTick((s) => s.tick);
  const tier = useTier();
  return (
    <>
      {/* Just below y=0 so the shadow plane draws over it without z-fighting. */}
      <Grid
        position={[0, -0.002, 0]}
        infiniteGrid
        cellSize={grid.cellSize}
        cellThickness={0.6}
        cellColor="#1d2026"
        sectionSize={grid.sectionSize}
        sectionThickness={1}
        sectionColor="#2f343e"
        fadeDistance={grid.fadeDistance}
        fadeStrength={1.5}
      />
      <ContactShadows
        position={[0, 0, 0]}
        scale={contactShadows.scale}
        far={contactShadows.far}
        blur={contactShadows.blur}
        opacity={contactShadows.opacity}
        resolution={Math.min(contactShadows.resolution, tier.contactShadows)}
        frames={1}
      />
    </>
  );
}
