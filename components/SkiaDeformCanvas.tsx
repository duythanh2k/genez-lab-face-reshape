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
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { computeDisplacedPositions } from '@/lib/displacements';
import type { Point } from '@/lib/types';
import type { MultiFaceMesh } from '@/lib/meshDeformation';
import type { FaceValues } from '@/store/reshapeStore';

interface SkiaDeformCanvasProps {
  imageUri: string;
  /** Single mesh containing ALL faces */
  mesh: MultiFaceMesh;
  /** Per-face saved values (for non-selected faces) */
  allFaceValues: FaceValues[];
  /** Which face the slider is controlling */
  selectedFaceIndex: number;
  canvasWidth: number;
  canvasHeight: number;
  imageWidth: number;
  imageHeight: number;
  /** SharedValues for the selected face's sliders (60fps) */
  sliderValues: Record<string, SharedValue<number>>;
  showOriginal: SharedValue<boolean>;
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

export function SkiaDeformCanvas({
  imageUri,
  mesh,
  allFaceValues,
  selectedFaceIndex,
  canvasWidth,
  canvasHeight,
  imageWidth,
  imageHeight,
  sliderValues: sv,
  showOriginal,
}: SkiaDeformCanvasProps) {
  const image = useSkiaImage(imageUri);

  const scale = Math.min(canvasWidth / imageWidth, canvasHeight / imageHeight);
  const offsetX = (canvasWidth - imageWidth * scale) / 2;
  const offsetY = (canvasHeight - imageHeight * scale) / 2;
  const displayWidth = imageWidth * scale;
  const displayHeight = imageHeight * scale;

  // Texture coords (stable — mesh doesn't change)
  const texturePoints = useMemo(
    () => mesh.texCoords.map((t) => vec(t.x * imageWidth, t.y * imageHeight)),
    [mesh.texCoords, imageWidth, imageHeight],
  );

  // Precompute mesh data for the worklet
  const positions = mesh.positions;
  const facesData = mesh.facesData;

  // Compute displaced positions for ALL faces in a single pass
  // Selected face uses SharedValues (60fps), others use saved store values
  const displayVertices = useDerivedValue(() => {
    if (showOriginal.value) {
      return positions.map((p: Point) =>
        vec(p.x * scale + offsetX, p.y * scale + offsetY),
      );
    }

    // Start with original positions (deep copy)
    const displaced: Point[] = new Array(positions.length);
    for (let i = 0; i < positions.length; i++) {
      displaced[i] = { x: positions[i].x, y: positions[i].y };
    }

    // Apply displacements for EACH face
    for (let fi = 0; fi < facesData.length; fi++) {
      const fd = facesData[fi];
      const isSelected = fi === selectedFaceIndex;

      // Get values: SharedValues for selected, saved for others
      const faceSlim = isSelected ? sv.faceSlim.value : (allFaceValues[fi]?.faceSlim ?? 0);
      const jawline = isSelected ? sv.jawline.value : (allFaceValues[fi]?.jawline ?? 0);
      const chin = isSelected ? sv.chin.value : (allFaceValues[fi]?.chin ?? 0);
      const forehead = isSelected ? sv.forehead.value : (allFaceValues[fi]?.forehead ?? 0);
      const eyeEnlarge = isSelected ? sv.eyeEnlarge.value : (allFaceValues[fi]?.eyeEnlarge ?? 0);
      const eyeDistance = isSelected ? sv.eyeDistance.value : (allFaceValues[fi]?.eyeDistance ?? 0);
      const noseSlim = isSelected ? sv.noseSlim.value : (allFaceValues[fi]?.noseSlim ?? 0);
      const noseLength = isSelected ? sv.noseLength.value : (allFaceValues[fi]?.noseLength ?? 0);
      const lipFullness = isSelected ? sv.lipFullness.value : (allFaceValues[fi]?.lipFullness ?? 0);
      const smile = isSelected ? sv.smile.value : (allFaceValues[fi]?.smile ?? 0);

      // Skip if all zero
      if (faceSlim === 0 && jawline === 0 && chin === 0 && forehead === 0 &&
          eyeEnlarge === 0 && eyeDistance === 0 && noseSlim === 0 &&
          noseLength === 0 && lipFullness === 0 && smile === 0) {
        continue;
      }

      // Apply this face's displacements to the shared positions array
      // computeDisplacedPositions modifies in place via the displacement functions
      const faceDisplaced = computeDisplacedPositions(
        displaced, // Use current state (accumulates from previous faces)
        fd.landmarkIndices,
        fd.faceCenter,
        fd.leftEyeCenter,
        fd.rightEyeCenter,
        fd.noseCenterX,
        fd.lipCenter,
        fd.chinPoint,
        fd.foreheadPoint,
        faceSlim, jawline, chin, forehead,
        eyeEnlarge, eyeDistance, noseSlim, noseLength,
        lipFullness, smile,
      );

      // Copy results back
      for (let i = 0; i < faceDisplaced.length; i++) {
        displaced[i] = faceDisplaced[i];
      }
    }

    return displaced.map((p: Point) =>
      vec(p.x * scale + offsetX, p.y * scale + offsetY),
    );
  }, [sv.faceSlim, sv.jawline, sv.chin, sv.forehead, sv.eyeEnlarge, sv.eyeDistance, sv.noseSlim, sv.noseLength, sv.lipFullness, sv.smile, showOriginal]);

  if (!image) return null;

  return (
    <Canvas style={{ width: canvasWidth, height: canvasHeight }}>
      {/* Single Vertices covering the entire image — all faces' deformations applied */}
      <Vertices
        vertices={displayVertices}
        textures={texturePoints}
        indices={mesh.indices}
        mode="triangles"
      >
        <ImageShader image={image} tx="clamp" ty="clamp" />
      </Vertices>
    </Canvas>
  );
}
