import { useEffect, useMemo, useState } from 'react';
import {
  Canvas,
  Image as SkiaImage,
  Group,
  Paint,
  Path,
  Blur,
  Skia,
  RuntimeShader,
  Fill,
  ImageShader,
  Shader,
} from '@shopify/react-native-skia';
import type { SkImage } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import type { DeformationMesh } from '@/lib/meshDeformation';
import { computeDisplacedPositions } from '@/lib/displacements';
import { buildExpandedFaceOvalPath } from '@/lib/backgroundBlend';
import { getWarpEffect, computeWarpUniforms, MAX_WARP_POINTS } from '@/lib/warpShader';
import type { Point } from '@/lib/types';

interface SkiaWarpCanvasProps {
  imageUri: string;
  mesh: DeformationMesh;
  canvasWidth: number;
  canvasHeight: number;
  imageWidth: number;
  imageHeight: number;
  faceOval: Point[];
  sliderValues: Record<string, SharedValue<number>>;
  showOriginal: SharedValue<boolean>;
}

const FEATHER_RADIUS = 15;

/** Load image via fetch → base64 → Skia (handles HEIC on iOS) */
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

export function SkiaWarpCanvas({
  imageUri,
  mesh,
  canvasWidth,
  canvasHeight,
  imageWidth,
  imageHeight,
  faceOval,
  sliderValues: sv,
  showOriginal,
}: SkiaWarpCanvasProps) {
  const image = useSkiaImage(imageUri);
  const warpEffect = useMemo(() => getWarpEffect(), []);

  const scale = Math.min(canvasWidth / imageWidth, canvasHeight / imageHeight);
  const offsetX = (canvasWidth - imageWidth * scale) / 2;
  const offsetY = (canvasHeight - imageHeight * scale) / 2;
  const displayWidth = imageWidth * scale;
  const displayHeight = imageHeight * scale;

  // Face mask for background lock
  const maskExpandPx = useMemo(() => {
    if (faceOval.length < 2) return 60;
    let minX = Infinity, maxX = -Infinity;
    for (const p of faceOval) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
    }
    return Math.max(60, (maxX - minX) * 0.3);
  }, [faceOval]);

  const maskPath = useMemo(() => {
    const path = buildExpandedFaceOvalPath(faceOval, maskExpandPx);
    const matrix = Skia.Matrix();
    matrix.translate(offsetX, offsetY);
    matrix.scale(scale, scale);
    path.transform(matrix);
    return path;
  }, [faceOval, maskExpandPx, scale, offsetX, offsetY]);

  // Precompute mesh data
  const originalPositions = mesh.positions;
  const landmarkIndices = mesh.landmarkIndices;
  const faceCenter = mesh.faceCenter;
  const leftEyeCenter = mesh.leftEyeCenter;
  const rightEyeCenter = mesh.rightEyeCenter;
  const noseCenterX = mesh.noseCenterX;
  const lipCenter = mesh.lipCenter;
  const chinPoint = mesh.chinPoint;
  const foreheadPoint = mesh.foreheadPoint;

  // Compute max face dimension for influence radius
  const influenceRadius = useMemo(() => {
    let maxDist = 0;
    for (const idx of landmarkIndices.faceOval) {
      const dx = originalPositions[idx].x - faceCenter.x;
      const dy = originalPositions[idx].y - faceCenter.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > maxDist) maxDist = d;
    }
    return maxDist * 1.5;
  }, [originalPositions, landmarkIndices.faceOval, faceCenter]);

  // Compute warp uniforms on UI thread
  const warpUniforms = useDerivedValue(() => {
    if (showOriginal.value) {
      // No warp — return empty uniforms
      const empty: Record<string, number | number[]> = {
        resolution: [displayWidth, displayHeight],
        numPoints: 0,
        radius: influenceRadius * scale,
      };
      for (let i = 0; i < MAX_WARP_POINTS; i++) {
        empty[`p${i}`] = [0, 0, 0, 0];
      }
      return empty;
    }

    // Compute displaced positions using the same functions as Approach 1
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
      sv.faceSlim.value,
      sv.jawline.value,
      sv.chin.value,
      sv.forehead.value,
      sv.eyeEnlarge.value,
      sv.eyeDistance.value,
      sv.noseSlim.value,
      sv.noseLength.value,
      sv.lipFullness.value,
      sv.smile.value,
    );

    // Convert to display coordinates and compute warp uniforms
    const origDisplay: Point[] = originalPositions.map((p: Point) => ({
      x: p.x * scale + offsetX,
      y: p.y * scale + offsetY,
    }));
    const dispDisplay: Point[] = displaced.map((p: Point) => ({
      x: p.x * scale + offsetX,
      y: p.y * scale + offsetY,
    }));

    return computeWarpUniforms(origDisplay, dispDisplay, influenceRadius * scale);
  }, [sv.faceSlim, sv.jawline, sv.chin, sv.forehead, sv.eyeEnlarge, sv.eyeDistance, sv.noseSlim, sv.noseLength, sv.lipFullness, sv.smile, showOriginal]);

  const layerPaint = useMemo(() => Skia.Paint(), []);

  if (!image) return null;

  return (
    <Canvas style={{ width: canvasWidth, height: canvasHeight }}>
      {/* Layer 1: Original image background */}
      <SkiaImage
        image={image}
        x={offsetX}
        y={offsetY}
        width={displayWidth}
        height={displayHeight}
        fit="fill"
      />

      {/* Layer 2: Warped face masked to face oval */}
      <Group layer={layerPaint}>
        {/* Apply warp shader to the image */}
        <Group
          layer={
            <Paint>
              <RuntimeShader source={warpEffect} uniforms={warpUniforms} />
            </Paint>
          }
        >
          <SkiaImage
            image={image}
            x={offsetX}
            y={offsetY}
            width={displayWidth}
            height={displayHeight}
            fit="fill"
          />
        </Group>

        {/* Mask: feathered face oval */}
        <Group blendMode="dstIn">
          <Path path={maskPath} color="white" style="fill">
            <Blur blur={FEATHER_RADIUS} />
          </Path>
        </Group>
      </Group>
    </Canvas>
  );
}
