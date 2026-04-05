import Delaunator from 'delaunator';
import type { FaceContours, Point } from './types';

export interface LandmarkIndices {
  faceOval: number[];
  leftEye: number[];
  rightEye: number[];
  leftEyebrowTop: number[];
  leftEyebrowBottom: number[];
  rightEyebrowTop: number[];
  rightEyebrowBottom: number[];
  noseBridge: number[];
  noseBottom: number[];
  upperLipTop: number[];
  upperLipBottom: number[];
  lowerLipTop: number[];
  lowerLipBottom: number[];
}

export interface DeformationMesh {
  positions: Point[];
  indices: number[];
  texCoords: Point[];
  landmarkIndices: LandmarkIndices;
  faceCenter: Point;
  leftEyeCenter: Point;
  rightEyeCenter: Point;
  noseCenterX: number;
  /** Precomputed lip center */
  lipCenter: Point;
  /** Precomputed chin point (bottom of face oval) */
  chinPoint: Point;
  /** Precomputed forehead point (top of face oval) */
  foreheadPoint: Point;
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
  const landmarkIndices: LandmarkIndices = {
    faceOval: [],
    leftEye: [],
    rightEye: [],
    leftEyebrowTop: [],
    leftEyebrowBottom: [],
    rightEyebrowTop: [],
    rightEyebrowBottom: [],
    noseBridge: [],
    noseBottom: [],
    upperLipTop: [],
    upperLipBottom: [],
    lowerLipTop: [],
    lowerLipBottom: [],
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
  addContour(contours.leftEyebrowTop, landmarkIndices.leftEyebrowTop);
  addContour(contours.leftEyebrowBottom, landmarkIndices.leftEyebrowBottom);
  addContour(contours.rightEyebrowTop, landmarkIndices.rightEyebrowTop);
  addContour(contours.rightEyebrowBottom, landmarkIndices.rightEyebrowBottom);
  addContour(contours.noseBridge, landmarkIndices.noseBridge);
  addContour(contours.noseBottom, landmarkIndices.noseBottom);
  addContour(contours.upperLipTop, landmarkIndices.upperLipTop);
  addContour(contours.upperLipBottom, landmarkIndices.upperLipBottom);
  addContour(contours.lowerLipTop, landmarkIndices.lowerLipTop);
  addContour(contours.lowerLipBottom, landmarkIndices.lowerLipBottom);

  // 2. Add grid points AROUND the face area only (not entire image).
  // The face mask clips everything outside the face oval, so grid points
  // far from the face are unnecessary and cause bad triangulation.
  const bb = contours.boundingBox;
  const padding = Math.max(bb.width, bb.height) * 0.5;
  const gridMinX = Math.max(0, bb.x - padding);
  const gridMinY = Math.max(0, bb.y - padding);
  const gridMaxX = Math.min(imageWidth, bb.x + bb.width + padding);
  const gridMaxY = Math.min(imageHeight, bb.y + bb.height + padding);
  const gridSpacing = Math.max(20, Math.min(bb.width, bb.height) / 10);

  for (let y = gridMinY; y <= gridMaxY; y += gridSpacing) {
    for (let x = gridMinX; x <= gridMaxX; x += gridSpacing) {
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

  // 3. Add corners of the grid area for full mesh coverage
  const corners: Point[] = [
    { x: gridMinX, y: gridMinY },
    { x: gridMaxX, y: gridMinY },
    { x: gridMaxX, y: gridMaxY },
    { x: gridMinX, y: gridMaxY },
    { x: (gridMinX + gridMaxX) / 2, y: gridMinY },
    { x: gridMaxX, y: (gridMinY + gridMaxY) / 2 },
    { x: (gridMinX + gridMaxX) / 2, y: gridMaxY },
    { x: gridMinX, y: (gridMinY + gridMaxY) / 2 },
  ];
  for (const c of corners) {
    let tooClose = false;
    for (const p of positions) {
      const dx = p.x - c.x;
      const dy = p.y - c.y;
      if (dx * dx + dy * dy < (gridSpacing * 0.3) ** 2) {
        tooClose = true;
        break;
      }
    }
    if (!tooClose) {
      positions.push(c);
    }
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

  // Lip center
  const allLipPoints = [
    ...contours.upperLipTop,
    ...contours.upperLipBottom,
    ...contours.lowerLipTop,
    ...contours.lowerLipBottom,
  ];
  const lipCenter = allLipPoints.length > 0 ? centroid(allLipPoints) : { x: faceCenter.x, y: faceCenter.y + (faceCenter.y - (contours.faceOval[0]?.y ?? faceCenter.y)) * 0.3 };

  // Chin = bottommost face oval point
  let chinPoint = contours.faceOval[0] ?? faceCenter;
  for (const p of contours.faceOval) {
    if (p.y > chinPoint.y) chinPoint = p;
  }

  // Forehead = topmost face oval point
  let foreheadPoint = contours.faceOval[0] ?? faceCenter;
  for (const p of contours.faceOval) {
    if (p.y < foreheadPoint.y) foreheadPoint = p;
  }

  return {
    positions,
    indices,
    texCoords,
    landmarkIndices,
    faceCenter,
    leftEyeCenter,
    rightEyeCenter,
    noseCenterX,
    lipCenter,
    chinPoint,
    foreheadPoint,
  };
}
