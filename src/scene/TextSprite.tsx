import { useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { CanvasTexture, SRGBColorSpace } from 'three';
import type { Vec3 } from '../config/dims';
import { SCENE } from '../config/scene';

const CANVAS_FONT_PX = 44;
const CANVAS_PAD_PX = 8;
const FONT_FAMILY = "ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace";

/**
 * Constant-screen-size text label drawn to a canvas: no DOM node and no font download.
 * Anchored at its left edge, vertically centred on `position`.
 */
export function TextSprite({
  text,
  colour,
  position,
  pixelHeight = 16,
  layer,
}: {
  text: string;
  colour: string;
  position: Vec3;
  pixelHeight?: number;
  layer?: number;
}) {
  const { texture, aspect } = useMemo(() => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const font = `${CANVAS_FONT_PX}px ${FONT_FAMILY}`;
    ctx.font = font;
    canvas.width = Math.ceil(ctx.measureText(text).width) + CANVAS_PAD_PX * 2;
    canvas.height = Math.ceil(CANVAS_FONT_PX * 1.4);
    ctx.font = font; // resizing the canvas resets its context state
    ctx.fillStyle = colour;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, CANVAS_PAD_PX, canvas.height / 2);
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    return { texture: tex, aspect: canvas.width / canvas.height };
  }, [text, colour]);

  useEffect(() => () => texture.dispose(), [texture]);

  // With sizeAttenuation off, sprite scale is in view-space units at distance 1.
  const viewportHeight = useThree((s) => s.size.height);
  const h = (pixelHeight / viewportHeight) * 2 * Math.tan(((SCENE.camera.fov / 2) * Math.PI) / 180);

  return (
    <sprite position={[...position]} scale={[h * aspect, h, 1]} center={[0, 0.5]} layers={layer} renderOrder={10}>
      <spriteMaterial map={texture} sizeAttenuation={false} depthTest={false} transparent toneMapped={false} />
    </sprite>
  );
}
