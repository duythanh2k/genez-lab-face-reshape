import { useEffect, useMemo, useState } from 'react';
import {
  Canvas,
  Vertices,
  Image as SkiaImage,
  vec,
  Skia,
  ImageShader,
} from '@shopify/react-native-skia';
import type { SkImage } from '@shopify/react-native-skia';
import { computeDisplacedPositions } from '@/lib/displacements';
import { BeautyEffectLayer } from '@/components/BeautyEffectLayer';
import { LipstickLayer } from '@/components/LipstickLayer';
import type { Point, FaceContours } from '@/lib/types';
import type { MultiFaceMesh } from '@/lib/meshDeformation';
import type { FaceValues } from '@/store/reshapeStore';

const BEAUTY_KEYS = [
  'skinSmooth',
  'skinTone',
  'darkCircles',
  'teethWhiten',
  'eyeRetouch',
] as const;

interface SkiaDeformCanvasProps {
  imageUri: string;
  mesh: MultiFaceMesh;
  /** Per-face values — ALL faces' current slider values */
  allFaceValues: FaceValues[];
  /** Detected face contours for beauty mask rendering */
  detectedFaces: FaceContours[];
  canvasWidth: number;
  canvasHeight: number;
  imageWidth: number;
  imageHeight: number;
}

function useSkiaImage(uri: string | null): SkImage | null {
  const [image, setImage] = useState<SkImage | null>(null);
  useEffect(() => {
    if (!uri) { setImage(null); return; }
    setImage(null);
    (async () => {
      try {
        const response = await fetch(uri);
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result as string;
          const raw = base64.split(',')[1];
          if (!raw) return;
          const data = Skia.Data.fromBase64(raw);
          setImage(Skia.Image.MakeImageFromEncoded(data));
        };
        reader.readAsDataURL(blob);
      } catch { setImage(null); }
    })();
  }, [uri]);
  return image;
}

function hasEdits(v: FaceValues): boolean {
  return Object.values(v).some((val) => val !== 0);
}

export function SkiaDeformCanvas({
  imageUri,
  mesh,
  allFaceValues,
  detectedFaces,
  canvasWidth,
  canvasHeight,
  imageWidth,
  imageHeight,
}: SkiaDeformCanvasProps) {
  const image = useSkiaImage(imageUri);

  const scale = Math.min(canvasWidth / imageWidth, canvasHeight / imageHeight);
  const offsetX = (canvasWidth - imageWidth * scale) / 2;
  const offsetY = (canvasHeight - imageHeight * scale) / 2;
  const displayWidth = imageWidth * scale;
  const displayHeight = imageHeight * scale;

  const texturePoints = useMemo(
    () => mesh.texCoords.map((t) => vec(t.x * imageWidth, t.y * imageHeight)),
    [mesh.texCoords, imageWidth, imageHeight],
  );

  // Compute ALL faces' displacements in one pass on JS thread
  // Simple, correct, no worklet issues
  const displayVertices = useMemo(() => {
    const positions = mesh.positions;
    const facesData = mesh.facesData;

    // Check if any face has edits
    const anyEdits = allFaceValues.some(hasEdits);
    if (!anyEdits) {
      // No edits — return original positions
      return positions.map((p) => vec(p.x * scale + offsetX, p.y * scale + offsetY));
    }

    // Start from original positions
    let current: Point[] = positions.map((p) => ({ x: p.x, y: p.y }));

    // Apply each face's displacements
    for (let fi = 0; fi < facesData.length && fi < allFaceValues.length; fi++) {
      const v = allFaceValues[fi];
      if (!hasEdits(v)) continue;

      const fd = facesData[fi];
      current = computeDisplacedPositions(
        current,
        fd.landmarkIndices,
        fd.faceCenter,
        fd.leftEyeCenter,
        fd.rightEyeCenter,
        fd.noseCenterX,
        fd.lipCenter,
        fd.chinPoint,
        fd.foreheadPoint,
        v.faceSlim, v.jawline, v.chin, v.forehead,
        v.eyeEnlarge, v.eyeDistance, v.noseSlim, v.noseLength,
        v.lipFullness, v.smile,
      );
    }

    return current.map((p) => vec(p.x * scale + offsetX, p.y * scale + offsetY));
  }, [mesh, allFaceValues, scale, offsetX, offsetY]);

  if (!image) return null;

  return (
    <Canvas style={{ width: canvasWidth, height: canvasHeight }}>
      <Vertices
        vertices={displayVertices}
        textures={texturePoints}
        indices={mesh.indices}
        mode="triangles"
      >
        <ImageShader image={image} tx="clamp" ty="clamp" />
      </Vertices>
      {detectedFaces.map((face, i) => {
        const v = allFaceValues[i];
        if (!v) return null;
        const hasBeauty = BEAUTY_KEYS.some((k) => v[k] !== 0);
        if (!hasBeauty) return null;
        return (
          <BeautyEffectLayer
            key={`beauty-${i}`}
            contours={face}
            values={v}
            scale={scale}
            offsetX={offsetX}
            offsetY={offsetY}
          />
        );
      })}
      {detectedFaces.map((face, i) => {
        const v = allFaceValues[i];
        if (!v?.lipstick || v.lipstick.intensity === 0) return null;
        return (
          <LipstickLayer
            key={`lipstick-${i}`}
            contours={face}
            colorIndex={v.lipstick.colorIndex}
            intensity={v.lipstick.intensity}
            scale={scale}
            offsetX={offsetX}
            offsetY={offsetY}
          />
        );
      })}
    </Canvas>
  );
}
