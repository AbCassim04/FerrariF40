import { useThree } from '@react-three/fiber';
import { BlendFunction, KernelSize, OutlineEffect } from 'postprocessing';
import { useEffect, useMemo, useRef } from 'react';
import { Box3, Color, ShaderMaterial, type Material, type Mesh, type Object3D, type WebGLRenderer } from 'three';
import { OUTLINE_LAYER, SCENE } from '../config/scene';
import { explodeTimeline } from '../explode/buildTimeline';
import { useAppStore } from '../state/store';
import { boxCorners } from './fitView';
import { partObjects } from './partObjects';
import { applyGhosts } from './ghosts';

/**
 * Frames the selected part (camera eases to fit it beside the panel; back to the earlier
 * view on close) and sets the ghosts: X-rayed body panels, and while a part is selected,
 * every other part. Mounted with the parts, so both exist.
 */
export function InspectController() {
  const selectedId = useAppStore((s) => s.selectedId);
  const xray = useAppStore((s) => s.xray);
  /** Last selection framed; only real changes move the camera (StrictMode re-runs effects). */
  const framed = useRef<string | null>(null);

  useEffect(() => applyGhosts(xray, selectedId), [xray, selectedId]);

  useEffect(() => {
    if (selectedId === framed.current) return;
    framed.current = selectedId;
    const { requestCameraFit } = useAppStore.getState();
    const content = selectedId ? partObjects.get(selectedId)?.content : undefined;
    if (!content) {
      requestCameraFit(null, 'inspect');
      return;
    }
    const box = settledBounds(content);
    if (!box.isEmpty()) requestCameraFit(boxCorners(box).map((p) => p.toArray()), 'inspect');
  }, [selectedId]);

  return null;
}

/**
 * World bounds of a part where it is heading: if the explode is still running, at the end
 * of the run (the playhead jumps there and back within the call, nothing is rendered).
 */
function settledBounds(content: Object3D) {
  const tl = explodeTimeline.current;
  const progress = tl?.progress() ?? 0;
  const moving = tl?.isActive() ?? false;
  if (moving) tl!.progress(tl!.reversed() ? 0 : 1);
  content.updateWorldMatrix(true, true);
  const box = new Box3().expandByObject(content);
  if (moving) tl!.progress(progress);
  return box;
}

const { outline } = SCENE.inspect;

/** Outline mask: red 0 where the part is (1 elsewhere, the clear colour); green 1 = "visible". */
const MASK = new ShaderMaterial({
  vertexShader: /* glsl */ `
    #include <common>
    #include <clipping_planes_pars_vertex>
    void main() {
      #include <begin_vertex>
      #include <project_vertex>
      #include <clipping_planes_vertex>
    }`,
  fragmentShader: /* glsl */ `
    #include <clipping_planes_pars_fragment>
    void main() {
      #include <clipping_planes_fragment>
      gl_FragColor = vec4(0.0, 1.0, 0.0, 1.0);
    }`,
});

/**
 * Outline round the hovered and the selected part, drawn in full even where other parts
 * cover it. postprocessing's outline effect first renders the whole scene's depth to tell
 * visible edges from hidden ones; that pass is skipped (it would double the draw calls),
 * so only the outlined part itself is drawn again, into the mask.
 */
export function PartOutline() {
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const hovered = useAppStore((s) => s.hoveredId);
  const selected = useAppStore((s) => s.selectedId);

  const effect = useMemo(() => {
    const e = new OutlineEffect(scene, camera, {
      blendFunction: BlendFunction.SCREEN,
      edgeStrength: outline.strength,
      visibleEdgeColor: new Color(outline.colour).getHex(),
      hiddenEdgeColor: new Color(outline.colour).getHex(),
      xRay: true,
      kernelSize: KernelSize.VERY_SMALL,
      blur: true,
    });
    type Render = (renderer: WebGLRenderer, ...rest: unknown[]) => void;
    const passes = e as unknown as { depthPass: { render: Render }; maskPass: { overrideMaterial: Material; render: Render } };
    passes.depthPass.render = () => {};
    // The stock mask material compares against that depth (and its shader fails to link
    // on some drivers); this one just marks the part's pixels.
    const { maskPass } = passes;
    maskPass.overrideMaterial = MASK;
    // The mask is cleared to white first; the renderer's own auto-clear (on in our
    // composer) would wipe that to black.
    const renderMask = maskPass.render.bind(maskPass);
    maskPass.render = (renderer, ...rest) => {
      const autoClear = renderer.autoClear;
      renderer.autoClear = false;
      renderMask(renderer, ...rest);
      renderer.autoClear = autoClear;
    };
    // Its own layer: the default (the first free id, 2) is our detail layer, and clearing
    // the selection would take that layer off the small meshes.
    e.selection.layer = OUTLINE_LAYER;
    return e;
  }, [scene, camera]);
  useEffect(() => () => effect.dispose(), [effect]);

  useEffect(() => {
    const meshes: Object3D[] = [];
    for (const id of new Set([hovered, selected])) {
      if (id) partObjects.get(id)?.content.traverse((o) => (o as Mesh).isMesh && meshes.push(o));
    }
    effect.selection.set(meshes);
  }, [effect, hovered, selected]);

  return <primitive object={effect} />;
}
