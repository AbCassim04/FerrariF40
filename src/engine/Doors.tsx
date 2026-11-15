import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { BoxGeometry, Mesh, MeshBasicMaterial, Quaternion, Vector3 } from 'three';
import { EXPLODE } from '../config/dims';
import { DOORS } from '../config/details';
import { claimedClicks, partObjects } from '../scene/partObjects';
import { useAppStore } from '../state/store';
import { thunk } from './audio/thunk';

/**
 * 9C doors ("Doors" in "more", or click a door handle): both open on their front hinges (the
 * explode's axis and angle, est) in `DOORS.seconds`, eased, with a soft thunk as they close (and
 * a lighter click as they unlatch). Only assembled: while the explode plays, and exploded, the
 * doors keep their explode pose (the open-state eases back to closed, the explode turns them).
 * The turn is on the door's content group, inside its explode pivot (which sits on the hinge).
 */

const Y = new Vector3(0, 1, 0);
const ease = (t: number) => t * t * (3 - 2 * t);
export const doorState = { open: 0 };

export function Doors() {
  const want = useAppStore((s) => s.doors);
  const exploded = useAppStore((s) => s.exploded);
  const handles = useMemo(
    () =>
      (['l', 'r'] as const).map((s) => {
        const [x, y, z] = DOORS.handle.at;
        const m = new Mesh(new BoxGeometry(...DOORS.handle.size), new MeshBasicMaterial({ visible: false }));
        m.position.set(s === 'l' ? x : -x, y, z);
        m.name = `door-handle-${s}`;
        m.userData.effect = true;
        m.userData.doorHandle = s;
        return { s, m };
      }),
    [],
  );
  const base = useMemo(() => new Map<string, { p: Vector3; q: Quaternion }>(), []);
  useEffect(() => () => handles.forEach(({ m }) => (m.removeFromParent(), m.geometry.dispose())), [handles]);

  // Thunk as they latch; a light click as they open.
  useEffect(() => {
    if (exploded) return;
    void thunk(want ? 'open' : 'close', want ? 0 : DOORS.seconds * 0.92);
  }, [want, exploded]);

  useFrame((_, dt) => {
    const target = want && !exploded ? 1 : 0;
    const step = Math.min(dt, 0.1) / DOORS.seconds;
    doorState.open = Math.min(1, Math.max(0, doorState.open + Math.sign(target - doorState.open) * step));
    const angle = EXPLODE.doorOpen * ease(doorState.open);
    for (const { s, m } of handles) {
      const o = partObjects.get(`door-${s}`);
      if (!o) continue;
      const c = o.content;
      if (m.parent !== c) c.add(m);
      if (!base.has(c.uuid)) base.set(c.uuid, { p: c.position.clone(), q: c.quaternion.clone() });
      const b = base.get(c.uuid)!;
      // Rear edge outward: the left door turns −y, the right +y (as the explode does).
      const q = new Quaternion().setFromAxisAngle(Y, (s === 'l' ? -1 : 1) * angle);
      c.quaternion.copy(q).multiply(b.q);
      c.position.copy(b.p).applyQuaternion(q);
    }
  });
  return (
    <>
      {handles.map(({ s, m }) => (
        <primitive
          key={s}
          object={m}
          onClick={(e: ThreeEvent<MouseEvent>) => {
            if (useAppStore.getState().exploded) return;
            e.stopPropagation();
            claimedClicks.add(e.nativeEvent);
            useAppStore.getState().toggleDoors();
          }}
        />
      ))}
    </>
  );
}
