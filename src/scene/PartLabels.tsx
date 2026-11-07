import { Html } from '@react-three/drei';
import { createPortal } from '@react-three/fiber';
import { Fragment, useLayoutEffect, useState } from 'react';
import { Box3, Vector3, type Group } from 'three';
import { partObjects } from './partObjects';

interface LabelTarget {
  id: string;
  content: Group;
  /** Centre of the part's geometry, in its content frame. */
  centre: Vector3;
}

/**
 * Dev overlay: each part's id floating over its geometry. Labels are portalled into the
 * part's own content group, so they follow it through the explode animation.
 */
export function PartLabels() {
  const [targets, setTargets] = useState<LabelTarget[]>([]);

  useLayoutEffect(() => {
    const list: LabelTarget[] = [];
    const box = new Box3();
    for (const [id, { content }] of partObjects) {
      content.updateWorldMatrix(true, false);
      box.setFromObject(content);
      if (box.isEmpty()) continue; // virtual assemblies have no geometry
      list.push({ id, content, centre: content.worldToLocal(box.getCenter(new Vector3())) });
    }
    setTargets(list);
  }, []);

  return (
    <>
      {targets.map(({ id, content, centre }) => (
        <Fragment key={id}>
          {createPortal(
            <Html position={centre} center className="part-label" zIndexRange={[20, 0]}>
              {id}
            </Html>,
            content,
          )}
        </Fragment>
      ))}
    </>
  );
}
