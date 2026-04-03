import Delaunator from 'delaunator';
import type { FaceContours, Point } from './types';

export interface DeformationMesh {
  /** Original vertex positions as SkPoint-compatible array */
  positions: Point[];
  /** Triangle indices from Delaunay triangulation */
  indices: number[];
  /** Texture UV coordinates (0..1, maps to original image) */
  texCoords: Point[];
  /** Indices into positions[] for each landmark group */
  landmarkIndices: {
    faceOval: number[];
    leftEye: number[];
    rightEye: number[];
    noseBridge: number[];
    noseBottom: number[];
  };
  /** Precomputed face center for displacement calculations */
  faceCenter: Point;
  /** Precomputed eye centers */
  leftEyeCenter: Point;
  rightEyeCenter: Point;
  /** Precomputed nose center X */
  noseCenterX: number;
}

/** Compute the centroid of a set of points */
function centroid(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  let sx = 0;
  let sy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / points.length, y: sy / points.length };
}

/**
 * Build a Delaunay triangulation mesh from face contours + background grid.
 * Runs once on JS thread at image load.
 */
export function buildMesh(
  contours: FaceContours,
  imageWidth: number,
  imageHeight: number,
): DeformationMesh {
  const positions: Point[] = [];
  const landmarkIndices = {
    faceOval: [] as number[],
    leftEye: [] as number[],
    rightEye: [] as number[],
    noseBridge: [] as number[],
    noseBottom: [] as number[],
  };

  // 1. Add all contour points and track their indices
  const addContour = (points: Point[], group: number[]) => {
    for (const p of points) {
      group.push(positions.length);
      positions.push({ x: p.x, y: p.y });
    }
  };

  addContour(contours.faceOval, landmarkIndices.faceOval);
  addContour(contours.leftEye, landmarkIndices.leftEye);
  addContour(contours.rightEye, landmarkIndices.rightEye);
  addContour(contours.noseBridge, landmarkIndices.noseBridge);
  addContour(contours.noseBottom, landmarkIndices.noseBottom);

  // 2. Add background grid points (spaced ~40px apart, capping mesh size)
  const gridSpacing = Math.max(40, Math.min(imageWidth, imageHeight) / 25);
  for (let y = gridSpacing / 2; y < imageHeight; y += gridSpacing) {
    for (let x = gridSpacing / 2; x < imageWidth; x += gridSpacing) {
      // Skip points that are too close to existing contour points
      // to avoid degenerate triangles
      let tooClose = false;
      for (const p of positions) {
        const dx = p.x - x;
        const dy = p.y - y;
        if (dx * dx + dy * dy < (gridSpacing * 0.3) ** 2) {
          tooClose = true;
          break;
        }
      }
      if (!tooClose) {
        positions.push({ x, y });
      }
    }
  }

  // 3. Add image corner and edge midpoints for full coverage
  const corners: Point[] = [
    { x: 0, y: 0 },
    { x: imageWidth, y: 0 },
    { x: imageWidth, y: imageHeight },
    { x: 0, y: imageHeight },
    { x: imageWidth / 2, y: 0 },
    { x: imageWidth, y: imageHeight / 2 },
    { x: imageWidth / 2, y: imageHeight },
    { x: 0, y: imageHeight / 2 },
  ];
  for (const c of corners) {
    positions.push(c);
  }

  // 4. Run Delaunay triangulation
  const delaunator = Delaunator.from(
    positions,
    (p) => p.x,
    (p) => p.y,
  );
  const indices = Array.from(delaunator.triangles);

  // 5. Compute texture UV coordinates (normalized to image dimensions)
  const texCoords: Point[] = positions.map((p) => ({
    x: p.x / imageWidth,
    y: p.y / imageHeight,
  }));

  // 6. Precompute centers
  const faceCenter = centroid(contours.faceOval);
  const leftEyeCenter = centroid(contours.leftEye);
  const rightEyeCenter = centroid(contours.rightEye);

  const allNosePoints = [...contours.noseBridge, ...contours.noseBottom];
  const noseCenterX =
    allNosePoints.length > 0
      ? allNosePoints.reduce((s, p) => s + p.x, 0) / allNosePoints.length
      : faceCenter.x;

  return {
    positions,
    indices,
    texCoords,
    landmarkIndices,
    faceCenter,
    leftEyeCenter,
    rightEyeCenter,
    noseCenterX,
  };
}
