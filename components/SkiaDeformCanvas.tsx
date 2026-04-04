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
import type { DeformationMesh } from '@/lib/meshDeformation';
import { computeDisplacedPositions } from '@/lib/displacements';
import { buildExpandedFaceOvalPath } from '@/lib/backgroundBlend';
import type { Point } from '@/lib/types';

interface SkiaDeformCanvasProps {
  imageUri: string;
  mesh: DeformationMesh;
  canvasWidth: number;
  canvasHeight: number;
  imageWidth: number;
  imageHeight: number;
  faceOval: Point[];
  faceSlim: SharedValue<number>;
  eyeEnlarge: SharedValue<number>;
  noseSlim: SharedValue<number>;
  showOriginal: SharedValue<boolean>;
}

const FEATHER_RADIUS = 15;

/**
 * Load image via fetch → base64 → Skia.
 * fetch() on iOS triggers automatic HEIC→JPEG transcoding,
 * so this handles all formats that iOS supports.
 */
function useSkiaImage(uri: string | null): SkImage | null {
  const [image, setImage] = useState<SkImage | null>(null);

  useEffect(() => {
    if (!uri) {
      setImage(null);
      return;
    }
    setImage(null);

    (async () => {
      try {
        // fetch() on file:// URIs triggers iOS transcoding for HEIC
        const response = await fetch(uri);
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result as string;
          // Strip data:image/...;base64, prefix
          const raw = base64.split(',')[1];
          if (!raw) {
            console.log('[useSkiaImage] no base64 data');
            return;
          }
          const data = Skia.Data.fromBase64(raw);
          const img = Skia.Image.MakeImageFromEncoded(data);
          console.log(
            '[useSkiaImage] loaded:',
            uri.slice(-30),
            img ? `${img.width()}x${img.height()}` : 'FAILED',
          );
          setImage(img);
        };
        reader.readAsDataURL(blob);
      } catch (err) {
        console.log('[useSkiaImage] error:', err);
        setImage(null);
      }
    })();
  }, [uri]);

  return image;
}

export function SkiaDeformCanvas({
  imageUri,
  mesh,
  canvasWidth,
  canvasHeight,
  imageWidth,
  imageHeight,
  faceOval,
  faceSlim,
  eyeEnlarge,
  noseSlim,
  showOriginal,
}: SkiaDeformCanvasProps) {
  const image = useSkiaImage(imageUri);

  // Compute display scale and offset to fit image in canvas
  const scale = Math.min(canvasWidth / imageWidth, canvasHeight / imageHeight);
  const offsetX = (canvasWidth - imageWidth * scale) / 2;
  const offsetY = (canvasHeight - imageHeight * scale) / 2;
  const displayWidth = imageWidth * scale;
  const displayHeight = imageHeight * scale;

  // Texture coords: map mesh UV (0..1) to pixel positions in source image
  const texturePoints = useMemo(
    () => mesh.texCoords.map((t) => vec(t.x * imageWidth, t.y * imageHeight)),
    [mesh.texCoords, imageWidth, imageHeight],
  );

  // Face mask path in display coordinates
  // Expand generously — 20% of face width ensures deformed vertices
  // never exceed the mask, even at extreme slider values
  const maskExpandPx = useMemo(() => {
    if (faceOval.length < 2) return 40;
    let minX = Infinity, maxX = -Infinity;
    for (const p of faceOval) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
    }
    return Math.max(40, (maxX - minX) * 0.2);
  }, [faceOval]);

  const maskPath = useMemo(() => {
    const path = buildExpandedFaceOvalPath(faceOval, maskExpandPx);
    const matrix = Skia.Matrix();
    matrix.translate(offsetX, offsetY);
    matrix.scale(scale, scale);
    path.transform(matrix);
    return path;
  }, [faceOval, maskExpandPx, scale, offsetX, offsetY]);

  // Precompute for worklet
  const originalPositions = mesh.positions;
  const landmarkIndices = mesh.landmarkIndices;
  const faceCenter = mesh.faceCenter;
  const leftEyeCenter = mesh.leftEyeCenter;
  const rightEyeCenter = mesh.rightEyeCenter;
  const noseCenterX = mesh.noseCenterX;

  // Displaced vertices on UI thread
  const displayVertices = useDerivedValue(() => {
    if (showOriginal.value) {
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

  // Original vertices for background layer
  const originalVertices = useMemo(
    () =>
      originalPositions.map((p) =>
        vec(p.x * scale + offsetX, p.y * scale + offsetY),
      ),
    [originalPositions, scale, offsetX, offsetY],
  );

  const layerPaint = useMemo(() => Skia.Paint(), []);

  if (!image) return null;

  return (
    <Canvas style={{ width: canvasWidth, height: canvasHeight }}>
      {/* Layer 1: Original image as background */}
      <SkiaImage
        image={image}
        x={offsetX}
        y={offsetY}
        width={displayWidth}
        height={displayHeight}
        fit="fill"
      />

      {/* Layer 2: Deformed face masked to face oval */}
      <Group layer={layerPaint}>
        <Vertices
          vertices={displayVertices}
          textures={texturePoints}
          indices={mesh.indices}
          mode="triangles"
        >
          <ImageShader image={image} tx="clamp" ty="clamp" />
        </Vertices>

        {/* Mask */}
        <Group blendMode="dstIn">
          <Path path={maskPath} color="white" style="fill">
            <Blur blur={FEATHER_RADIUS} />
          </Path>
        </Group>
      </Group>
    </Canvas>
  );
}
