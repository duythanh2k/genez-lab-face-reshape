import { useEffect, useMemo, useState } from 'react';
import {
  Canvas,
  Vertices,
  Image as SkiaImage,
  vec,
  Group,
  Path,
  Blur,
  Skia,
  ImageShader,
} from '@shopify/react-native-skia';
import type { SkImage } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { computeDisplacedPositions } from '@/lib/displacements';
import { buildExpandedFaceOvalPath } from '@/lib/backgroundBlend';
import type { Point } from '@/lib/types';
import type { FaceData } from '@/store/reshapeStore';

interface SkiaDeformCanvasProps {
  imageUri: string;
  /** All detected faces with their meshes and values */
  faces: FaceData[];
  /** Index of the face currently being edited via sliders */
  selectedFaceIndex: number;
  canvasWidth: number;
  canvasHeight: number;
  imageWidth: number;
  imageHeight: number;
  /** SharedValues for the SELECTED face's sliders (60fps updates) */
  sliderValues: Record<string, SharedValue<number>>;
  showOriginal: SharedValue<boolean>;
}

const FEATHER_RADIUS = 15;

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
          const img = Skia.Image.MakeImageFromEncoded(data);
          setImage(img);
        };
        reader.readAsDataURL(blob);
      } catch { setImage(null); }
    })();
  }, [uri]);

  return image;
}

/**
 * Renders a single face's deformation layer.
 * The mesh covers the entire image, displacement only moves the face area.
 * Masked to the face oval with a feathered edge.
 */
function FaceDeformLayer({
  face,
  faceIndex,
  selectedFaceIndex,
  image,
  scale,
  offsetX,
  offsetY,
  imageWidth,
  imageHeight,
  sliderValues,
  showOriginal,
}: {
  face: FaceData;
  faceIndex: number;
  selectedFaceIndex: number;
  image: SkImage;
  scale: number;
  offsetX: number;
  offsetY: number;
  imageWidth: number;
  imageHeight: number;
  sliderValues: Record<string, SharedValue<number>>;
  showOriginal: SharedValue<boolean>;
}) {
  const { mesh, contours, values: savedValues } = face;
  const isSelected = faceIndex === selectedFaceIndex;

  // Texture coords
  const texturePoints = useMemo(
    () => mesh.texCoords.map((t) => vec(t.x * imageWidth, t.y * imageHeight)),
    [mesh.texCoords, imageWidth, imageHeight],
  );

  // Mask path
  const maskExpandPx = useMemo(() => {
    if (contours.faceOval.length < 2) return 60;
    let minX = Infinity, maxX = -Infinity;
    for (const p of contours.faceOval) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
    }
    return Math.max(60, (maxX - minX) * 0.3);
  }, [contours.faceOval]);

  const maskPath = useMemo(() => {
    const path = buildExpandedFaceOvalPath(contours.faceOval, maskExpandPx);
    const matrix = Skia.Matrix();
    matrix.translate(offsetX, offsetY);
    matrix.scale(scale, scale);
    path.transform(matrix);
    return path;
  }, [contours.faceOval, maskExpandPx, scale, offsetX, offsetY]);

  // Precompute mesh data for worklet
  const originalPositions = mesh.positions;
  const landmarkIndices = mesh.landmarkIndices;
  const faceCenter = mesh.faceCenter;
  const leftEyeCenter = mesh.leftEyeCenter;
  const rightEyeCenter = mesh.rightEyeCenter;
  const noseCenterX = mesh.noseCenterX;
  const lipCenter = mesh.lipCenter;
  const chinPoint = mesh.chinPoint;
  const foreheadPoint = mesh.foreheadPoint;

  // For the SELECTED face: use SharedValues (60fps slider updates)
  // For OTHER faces: use saved store values (static until user switches)
  const sv = sliderValues;
  const saved = savedValues;

  const displayVertices = useDerivedValue(() => {
    if (showOriginal.value) {
      return originalPositions.map((p: Point) =>
        vec(p.x * scale + offsetX, p.y * scale + offsetY),
      );
    }

    // Use SharedValues for selected face (live slider), saved values for others
    const faceSlim = isSelected ? sv.faceSlim.value : saved.faceSlim;
    const jawline = isSelected ? sv.jawline.value : saved.jawline;
    const chin = isSelected ? sv.chin.value : saved.chin;
    const forehead = isSelected ? sv.forehead.value : saved.forehead;
    const eyeEnlarge = isSelected ? sv.eyeEnlarge.value : saved.eyeEnlarge;
    const eyeDistance = isSelected ? sv.eyeDistance.value : saved.eyeDistance;
    const noseSlim = isSelected ? sv.noseSlim.value : saved.noseSlim;
    const noseLength = isSelected ? sv.noseLength.value : saved.noseLength;
    const lipFullness = isSelected ? sv.lipFullness.value : saved.lipFullness;
    const smile = isSelected ? sv.smile.value : saved.smile;

    // Check if any value is non-zero
    if (faceSlim === 0 && jawline === 0 && chin === 0 && forehead === 0 &&
        eyeEnlarge === 0 && eyeDistance === 0 && noseSlim === 0 &&
        noseLength === 0 && lipFullness === 0 && smile === 0) {
      return []; // No deformation needed
    }

    const displaced = computeDisplacedPositions(
      originalPositions,
      landmarkIndices,
      faceCenter,
      leftEyeCenter,
      rightEyeCenter,
      noseCenterX,
      lipCenter,
      chinPoint,
      foreheadPoint,
      faceSlim, jawline, chin, forehead,
      eyeEnlarge, eyeDistance, noseSlim, noseLength,
      lipFullness, smile,
    );

    return displaced.map((p: Point) =>
      vec(p.x * scale + offsetX, p.y * scale + offsetY),
    );
  }, [sv.faceSlim, sv.jawline, sv.chin, sv.forehead, sv.eyeEnlarge, sv.eyeDistance, sv.noseSlim, sv.noseLength, sv.lipFullness, sv.smile, showOriginal]);

  const layerPaint = useMemo(() => Skia.Paint(), []);

  // Don't render if no deformation (empty vertices array from useDerivedValue)
  return (
    <Group layer={layerPaint}>
      <Vertices
        vertices={displayVertices}
        textures={texturePoints}
        indices={mesh.indices}
        mode="triangles"
      >
        <ImageShader image={image} tx="clamp" ty="clamp" />
      </Vertices>
      <Group blendMode="dstIn">
        <Path path={maskPath} color="white" style="fill">
          <Blur blur={FEATHER_RADIUS} />
        </Path>
      </Group>
    </Group>
  );
}

export function SkiaDeformCanvas({
  imageUri,
  faces,
  selectedFaceIndex,
  canvasWidth,
  canvasHeight,
  imageWidth,
  imageHeight,
  sliderValues,
  showOriginal,
}: SkiaDeformCanvasProps) {
  const image = useSkiaImage(imageUri);

  const scale = Math.min(canvasWidth / imageWidth, canvasHeight / imageHeight);
  const offsetX = (canvasWidth - imageWidth * scale) / 2;
  const offsetY = (canvasHeight - imageHeight * scale) / 2;
  const displayWidth = imageWidth * scale;
  const displayHeight = imageHeight * scale;

  if (!image) return null;

  return (
    <Canvas style={{ width: canvasWidth, height: canvasHeight }}>
      {/* Background: original image */}
      <SkiaImage
        image={image}
        x={offsetX}
        y={offsetY}
        width={displayWidth}
        height={displayHeight}
        fit="fill"
      />

      {/* Render ALL faces' deformations simultaneously */}
      {faces.map((face, i) => (
        <FaceDeformLayer
          key={i}
          face={face}
          faceIndex={i}
          selectedFaceIndex={selectedFaceIndex}
          image={image}
          scale={scale}
          offsetX={offsetX}
          offsetY={offsetY}
          imageWidth={imageWidth}
          imageHeight={imageHeight}
          sliderValues={sliderValues}
          showOriginal={showOriginal}
        />
      ))}
    </Canvas>
  );
}
