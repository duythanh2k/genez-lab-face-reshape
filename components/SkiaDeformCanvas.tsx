import { useMemo } from 'react';
import {
  Canvas,
  Vertices,
  ImageShader,
  Image as SkiaImage,
  useImage,
  vec,
  Group,
  Paint,
  Path,
  Blur,
  Skia,
} from '@shopify/react-native-skia';
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

/** Feather radius for the face mask soft edge */
const FEATHER_RADIUS = 15;
/** Expand the mask outward so blur doesn't eat into the face */
const MASK_EXPAND_PX = 25;

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
  const image = useImage(imageUri);

  // Compute display scale and offset to fit image in canvas
  const scale = Math.min(canvasWidth / imageWidth, canvasHeight / imageHeight);
  const offsetX = (canvasWidth - imageWidth * scale) / 2;
  const offsetY = (canvasHeight - imageHeight * scale) / 2;

  // Convert mesh texture coords to pixel coords in the image
  const texturePoints = useMemo(
    () => mesh.texCoords.map((t) => vec(t.x * imageWidth, t.y * imageHeight)),
    [mesh.texCoords, imageWidth, imageHeight],
  );

  // Build face mask path (expanded + in display coords for the canvas)
  const maskPath = useMemo(() => {
    const expandedOval = faceOval.map((p) => ({
      x: p.x,
      y: p.y,
    }));
    const path = buildExpandedFaceOvalPath(expandedOval, MASK_EXPAND_PX);
    // Transform to display coordinates
    const matrix = Skia.Matrix();
    matrix.translate(offsetX, offsetY);
    matrix.scale(scale, scale);
    path.transform(matrix);
    return path;
  }, [faceOval, scale, offsetX, offsetY]);

  // Precompute data for the worklet
  const originalPositions = mesh.positions;
  const landmarkIndices = mesh.landmarkIndices;
  const faceCenter = mesh.faceCenter;
  const leftEyeCenter = mesh.leftEyeCenter;
  const rightEyeCenter = mesh.rightEyeCenter;
  const noseCenterX = mesh.noseCenterX;

  // Compute displaced vertex positions on the UI thread every frame
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

  // Original (non-deformed) vertex positions for background layer
  const originalVertices = useMemo(
    () =>
      originalPositions.map((p) =>
        vec(p.x * scale + offsetX, p.y * scale + offsetY),
      ),
    [originalPositions, scale, offsetX, offsetY],
  );

  // A static paint for the save layer
  const layerPaint = useMemo(() => Skia.Paint(), []);

  if (!image) return null;

  const imgRect = { x: 0, y: 0, width: imageWidth, height: imageHeight };

  return (
    <Canvas style={{ width: canvasWidth, height: canvasHeight }}>
      {/* Layer 1: Original image (background — never deformed) */}
      <Vertices
        vertices={originalVertices}
        textures={texturePoints}
        indices={mesh.indices}
        mode="triangles"
      >
        <ImageShader image={image} fit="fill" rect={imgRect} tx="clamp" ty="clamp" />
      </Vertices>

      {/* Layer 2: Deformed face, masked to face oval with soft feathered edge */}
      {/* SaveLayer isolates the deformed content so DstIn mask works correctly */}
      <Group layer={layerPaint}>
        {/* Draw deformed mesh */}
        <Vertices
          vertices={displayVertices}
          textures={texturePoints}
          indices={mesh.indices}
          mode="triangles"
        >
          <ImageShader image={image} fit="fill" rect={imgRect} tx="clamp" ty="clamp" />
        </Vertices>

        {/* Mask: DstIn keeps only the intersection of deformed content + mask shape */}
        {/* The blurred path creates the soft feathered edge */}
        <Group blendMode="dstIn">
          <Path path={maskPath} color="white" style="fill">
            <Blur blur={FEATHER_RADIUS} />
          </Path>
        </Group>
      </Group>
    </Canvas>
  );
}
