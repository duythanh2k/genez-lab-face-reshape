import { useMemo } from 'react';
import {
  Canvas,
  Vertices,
  ImageShader,
  useImage,
  vec,
} from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import type { DeformationMesh } from '@/lib/meshDeformation';
import { computeDisplacedPositions } from '@/lib/displacements';
import type { Point } from '@/lib/types';

interface SkiaDeformCanvasProps {
  imageUri: string;
  mesh: DeformationMesh;
  canvasWidth: number;
  canvasHeight: number;
  imageWidth: number;
  imageHeight: number;
  faceSlim: SharedValue<number>;
  eyeEnlarge: SharedValue<number>;
  noseSlim: SharedValue<number>;
  showOriginal: SharedValue<boolean>;
}

export function SkiaDeformCanvas({
  imageUri,
  mesh,
  canvasWidth,
  canvasHeight,
  imageWidth,
  imageHeight,
  faceSlim,
  eyeEnlarge,
  noseSlim,
  showOriginal,
}: SkiaDeformCanvasProps) {
  const image = useImage(imageUri);

  // Compute display scale and offset to fit image in canvas
  const scale = Math.min(canvasWidth / imageWidth, canvasHeight / imageHeight);
  const offsetX = (canvasWidth - imageWidth * scale) / 2;
  const offsetY = (canvasHeight - imageHeight * scale) / 2;

  // Convert mesh texture coords to pixel coords in the image
  // These map each vertex to a position in the source image texture
  const texturePoints = useMemo(
    () => mesh.texCoords.map((t) => vec(t.x * imageWidth, t.y * imageHeight)),
    [mesh.texCoords, imageWidth, imageHeight],
  );

  // Precompute data for the worklet (avoid closures over complex objects)
  const originalPositions = mesh.positions;
  const landmarkIndices = mesh.landmarkIndices;
  const faceCenter = mesh.faceCenter;
  const leftEyeCenter = mesh.leftEyeCenter;
  const rightEyeCenter = mesh.rightEyeCenter;
  const noseCenterX = mesh.noseCenterX;

  // Compute displaced vertex positions on the UI thread every frame
  const displayVertices = useDerivedValue(() => {
    if (showOriginal.value) {
      // Show original — no deformation
      return originalPositions.map((p: Point) =>
        vec(p.x * scale + offsetX, p.y * scale + offsetY),
      );
    }

    const displaced = computeDisplacedPositions(
      originalPositions,
      landmarkIndices,
      faceCenter,
      leftEyeCenter,
      rightEyeCenter,
      noseCenterX,
      faceSlim.value,
      eyeEnlarge.value,
      noseSlim.value,
    );

    return displaced.map((p: Point) =>
      vec(p.x * scale + offsetX, p.y * scale + offsetY),
    );
  }, [faceSlim, eyeEnlarge, noseSlim, showOriginal]);

  if (!image) return null;

  return (
    <Canvas style={{ width: canvasWidth, height: canvasHeight }}>
      <Vertices
        vertices={displayVertices}
        textures={texturePoints}
        indices={mesh.indices}
        mode="triangles"
      >
        <ImageShader
          image={image}
          fit="fill"
          rect={{ x: 0, y: 0, width: imageWidth, height: imageHeight }}
          tx="clamp"
          ty="clamp"
        />
      </Vertices>
    </Canvas>
  );
}
