import { Skia } from '@shopify/react-native-skia';
import type { SkPath } from '@shopify/react-native-skia';
import type { FaceContours, Point } from './types';

function toDisplay(
  p: Point,
  scale: number,
  offsetX: number,
  offsetY: number,
): Point {
  return { x: p.x * scale + offsetX, y: p.y * scale + offsetY };
}

function pathFromPoints(
  points: Point[],
  scale: number,
  offsetX: number,
  offsetY: number,
  close = true,
): SkPath | null {
  if (points.length < 3) return null;
  const path = Skia.Path.Make();
  const first = toDisplay(points[0], scale, offsetX, offsetY);
  path.moveTo(first.x, first.y);
  for (let i = 1; i < points.length; i++) {
    const p = toDisplay(points[i], scale, offsetX, offsetY);
    path.lineTo(p.x, p.y);
  }
  if (close) path.close();
  return path;
}

/**
 * Build a skin mask from the face oval contour.
 * Simple v1: just the face oval path (eyes/lips get slightly blurred, acceptable for lab).
 */
export function buildSkinMask(
  contours: FaceContours,
  scale: number,
  offsetX: number,
  offsetY: number,
): SkPath | null {
  return pathFromPoints(contours.faceOval, scale, offsetX, offsetY);
}

/**
 * Build under-eye ellipses for dark circle correction.
 * Creates small ellipses below each eye center.
 */
export function buildUnderEyeMask(
  contours: FaceContours,
  scale: number,
  offsetX: number,
  offsetY: number,
): SkPath | null {
  if (contours.leftEye.length < 3 || contours.rightEye.length < 3) return null;

  const path = Skia.Path.Make();

  for (const eyePoints of [contours.leftEye, contours.rightEye]) {
    // Compute eye bounding box
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const p of eyePoints) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    const eyeWidth = maxX - minX;
    const eyeHeight = maxY - minY;
    const centerX = (minX + maxX) / 2;
    const bottomY = maxY;

    // Ellipse below the eye
    const ellipseCenterY = bottomY + eyeHeight * 0.3;
    const radiusX = eyeWidth * 0.35;
    const radiusY = eyeHeight * 0.5;

    const dp = toDisplay(
      { x: centerX, y: ellipseCenterY },
      scale,
      offsetX,
      offsetY,
    );
    const rx = radiusX * scale;
    const ry = radiusY * scale;

    path.addOval({
      x: dp.x - rx,
      y: dp.y - ry,
      width: rx * 2,
      height: ry * 2,
    });
  }

  return path;
}

/**
 * Build teeth/mouth opening mask from upper lip bottom + lower lip top.
 */
export function buildTeethMask(
  contours: FaceContours,
  scale: number,
  offsetX: number,
  offsetY: number,
): SkPath | null {
  const upperBottom = contours.upperLipBottom;
  const lowerTop = contours.lowerLipTop;
  if (upperBottom.length < 3 || lowerTop.length < 3) return null;

  const path = Skia.Path.Make();
  const first = toDisplay(upperBottom[0], scale, offsetX, offsetY);
  path.moveTo(first.x, first.y);

  // Trace upper lip bottom (left to right)
  for (let i = 1; i < upperBottom.length; i++) {
    const p = toDisplay(upperBottom[i], scale, offsetX, offsetY);
    path.lineTo(p.x, p.y);
  }

  // Trace lower lip top in reverse (right to left)
  for (let i = lowerTop.length - 1; i >= 0; i--) {
    const p = toDisplay(lowerTop[i], scale, offsetX, offsetY);
    path.lineTo(p.x, p.y);
  }

  path.close();
  return path;
}

/**
 * Build eye mask from left + right eye contours.
 */
export function buildEyeMask(
  contours: FaceContours,
  scale: number,
  offsetX: number,
  offsetY: number,
): SkPath | null {
  if (contours.leftEye.length < 3 && contours.rightEye.length < 3) return null;

  const path = Skia.Path.Make();

  for (const eyePoints of [contours.leftEye, contours.rightEye]) {
    if (eyePoints.length < 3) continue;
    const eyePath = pathFromPoints(eyePoints, scale, offsetX, offsetY);
    if (eyePath) path.addPath(eyePath);
  }

  return path;
}
