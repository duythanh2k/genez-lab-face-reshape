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
import type { SkImage, SkPoint } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { computeDisplacedPositions } from '@/lib/displacements';
import { buildExpandedFaceOvalPath } from '@/lib/backgroundBlend';
import type { Point } from '@/lib/types';
import type { FaceData, FaceValues } from '@/store/reshapeStore';

interface SkiaDeformCanvasProps {
  imageUri: string;
  faces: FaceData[];
  selectedFaceIndex: number;
  canvasWidth: number;
  canvasHeight: number;
  imageWidth: number;
  imageHeight: number;
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
          setImage(Skia.Image.MakeImageFromEncoded(data));
        };
        reader.readAsDataURL(blob);
      } catch { setImage(null); }
    })();
  }, [uri]);
  return image;
}

/** Check if any value in FaceValues is non-zero */
function hasEdits(v: FaceValues): boolean {
  return Object.values(v).some((val) => val !== 0);
}

/** Compute displaced positions for a face (JS thread, static) */
function computeStaticVertices(
  face: FaceData,
  scale: number,
  offsetX: number,
  offsetY: number,
): SkPoint[] {
  const { mesh, values } = face;
  if (!hasEdits(values)) return [];

  const displaced = computeDisplacedPositions(
    mesh.positions,
    mesh.landmarkIndices,
    mesh.faceCenter,
    mesh.leftEyeCenter,
    mesh.rightEyeCenter,
    mesh.noseCenterX,
    mesh.lipCenter,
    mesh.chinPoint,
    mesh.foreheadPoint,
    values.faceSlim, values.jawline, values.chin, values.forehead,
    values.eyeEnlarge, values.eyeDistance, values.noseSlim, values.noseLength,
    values.lipFullness, values.smile,
  );

  return displaced.map((p) => vec(p.x * scale + offsetX, p.y * scale + offsetY));
}

export function SkiaDeformCanvas({
  imageUri,
  faces,
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

  // Selected face data
  const selectedFace = faces[selectedFaceIndex];

  // Texture coords for selected face
  const selectedTexturePoints = useMemo(() => {
    if (!selectedFace) return [];
    return selectedFace.mesh.texCoords.map((t) => vec(t.x * imageWidth, t.y * imageHeight));
  }, [selectedFace?.mesh.texCoords, imageWidth, imageHeight]);

  // Mask for selected face
  const selectedMaskPath = useMemo(() => {
    if (!selectedFace) return null;
    const oval = selectedFace.contours.faceOval;
    if (oval.length < 3) return null;
    let minX = Infinity, maxX = -Infinity;
    for (const p of oval) { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; }
    const expandPx = Math.max(60, (maxX - minX) * 0.3);
    const path = buildExpandedFaceOvalPath(oval, expandPx);
    const matrix = Skia.Matrix();
    matrix.translate(offsetX, offsetY);
    matrix.scale(scale, scale);
    path.transform(matrix);
    return path;
  }, [selectedFace?.contours.faceOval, scale, offsetX, offsetY]);

  // Selected face: displaced vertices via useDerivedValue (60fps from SharedValues)
  const selectedMesh = selectedFace?.mesh;
  const selPositions = selectedMesh?.positions ?? [];
  const selLandmarks = selectedMesh?.landmarkIndices;
  const selFaceCenter = selectedMesh?.faceCenter ?? { x: 0, y: 0 };
  const selLeftEye = selectedMesh?.leftEyeCenter ?? { x: 0, y: 0 };
  const selRightEye = selectedMesh?.rightEyeCenter ?? { x: 0, y: 0 };
  const selNoseCX = selectedMesh?.noseCenterX ?? 0;
  const selLipCenter = selectedMesh?.lipCenter ?? { x: 0, y: 0 };
  const selChin = selectedMesh?.chinPoint ?? { x: 0, y: 0 };
  const selForehead = selectedMesh?.foreheadPoint ?? { x: 0, y: 0 };

  const selectedVertices = useDerivedValue(() => {
    if (showOriginal.value || !selLandmarks || selPositions.length === 0) {
      return [];
    }

    // If all slider values are zero, return original positions
    // (renders identically to base image — no mesh artifacts)
    if (sv.faceSlim.value === 0 && sv.jawline.value === 0 && sv.chin.value === 0 &&
        sv.forehead.value === 0 && sv.eyeEnlarge.value === 0 && sv.eyeDistance.value === 0 &&
        sv.noseSlim.value === 0 && sv.noseLength.value === 0 && sv.lipFullness.value === 0 &&
        sv.smile.value === 0) {
      return selPositions.map((p: Point) => vec(p.x * scale + offsetX, p.y * scale + offsetY));
    }

    const displaced = computeDisplacedPositions(
      selPositions,
      selLandmarks,
      selFaceCenter,
      selLeftEye,
      selRightEye,
      selNoseCX,
      selLipCenter,
      selChin,
      selForehead,
      sv.faceSlim.value, sv.jawline.value, sv.chin.value, sv.forehead.value,
      sv.eyeEnlarge.value, sv.eyeDistance.value, sv.noseSlim.value, sv.noseLength.value,
      sv.lipFullness.value, sv.smile.value,
    );

    return displaced.map((p: Point) => vec(p.x * scale + offsetX, p.y * scale + offsetY));
  }, [sv.faceSlim, sv.jawline, sv.chin, sv.forehead, sv.eyeEnlarge, sv.eyeDistance, sv.noseSlim, sv.noseLength, sv.lipFullness, sv.smile, showOriginal]);

  // Non-selected faces: compute static vertices from saved values (JS thread)
  const otherFaceLayers = useMemo(() => {
    return faces
      .map((face, i) => {
        if (i === selectedFaceIndex) return null; // Selected face rendered separately
        if (!hasEdits(face.values)) return null; // No edits, skip

        const vertices = computeStaticVertices(face, scale, offsetX, offsetY);
        if (vertices.length === 0) return null;

        const textures = face.mesh.texCoords.map((t) => vec(t.x * imageWidth, t.y * imageHeight));

        // Mask path
        const oval = face.contours.faceOval;
        if (oval.length < 3) return null;
        let minX = Infinity, maxX = -Infinity;
        for (const p of oval) { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; }
        const expandPx = Math.max(60, (maxX - minX) * 0.3);
        const maskPath = buildExpandedFaceOvalPath(oval, expandPx);
        const matrix = Skia.Matrix();
        matrix.translate(offsetX, offsetY);
        matrix.scale(scale, scale);
        maskPath.transform(matrix);

        return { vertices, textures, indices: face.mesh.indices, maskPath, key: i };
      })
      .filter(Boolean) as Array<{
        vertices: SkPoint[];
        textures: SkPoint[];
        indices: number[];
        maskPath: ReturnType<typeof Skia.Path.Make>;
        key: number;
      }>;
  }, [faces, selectedFaceIndex, scale, offsetX, offsetY, imageWidth, imageHeight]);

  const layerPaint = useMemo(() => Skia.Paint(), []);

  if (!image) return null;

  // Always render selected face, but return original positions when no edits
  // to avoid mesh artifacts. The Vertices renders identically to the base image.

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

      {/* Non-selected faces: static deformation layers (from saved values) */}
      {otherFaceLayers.map((layer) => (
        <Group key={layer.key} layer={layerPaint}>
          <Vertices
            vertices={layer.vertices}
            textures={layer.textures}
            indices={layer.indices}
            mode="triangles"
          >
            <ImageShader image={image} tx="clamp" ty="clamp" />
          </Vertices>
          <Group blendMode="dstIn">
            <Path path={layer.maskPath} color="white" style="fill">
              <Blur blur={FEATHER_RADIUS} />
            </Path>
          </Group>
        </Group>
      ))}

      {/* Selected face: live deformation from SharedValues (60fps) */}
      {selectedFace && selectedMaskPath && (
        <Group layer={layerPaint}>
          <Vertices
            vertices={selectedVertices}
            textures={selectedTexturePoints}
            indices={selectedFace.mesh.indices}
            mode="triangles"
          >
            <ImageShader image={image} tx="clamp" ty="clamp" />
          </Vertices>
          <Group blendMode="dstIn">
            <Path path={selectedMaskPath} color="white" style="fill">
              <Blur blur={FEATHER_RADIUS} />
            </Path>
          </Group>
        </Group>
      )}
    </Canvas>
  );
}
