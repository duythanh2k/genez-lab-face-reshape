import { Skia } from '@shopify/react-native-skia';
import type { SkPath } from '@shopify/react-native-skia';
import type { FaceContours, Point } from './types';

function toDisplay(p: Point, scale: number, offsetX: number, offsetY: number): Point {
  return { x: p.x * scale + offsetX, y: p.y * scale + offsetY };
}

/** Add a closed contour subpath to an existing path */
function addContourToPath(
  path: SkPath,
  points: Point[],
  scale: number,
  offsetX: number,
  offsetY: number,
) {
  if (points.length < 3) return;
  const first = toDisplay(points[0], scale, offsetX, offsetY);
  path.moveTo(first.x, first.y);
  for (let i = 1; i < points.length; i++) {
    const p = toDisplay(points[i], scale, offsetX, offsetY);
    path.lineTo(p.x, p.y);
  }
  path.close();
}

/**
 * Build skin mask: face oval WITH HOLES for eyes, lips, eyebrows.
 * Uses EvenOdd fill rule — inner contours cut out from the outer oval.
 * Only skin areas get the effect (forehead, cheeks, nose, jaw).
 */
export function buildSkinMask(
  contours: FaceContours,
  scale: number,
  offsetX: number,
  offsetY: number,
): SkPath | null {
  if (contours.faceOval.length < 3) return null;

  const path = Skia.Path.Make();
  // EvenOdd fill: inner contours become holes in the outer oval
  // FillType enum: 0=Winding, 1=EvenOdd, 2=InverseWinding, 3=InverseEvenOdd
  path.setFillType(1 as any);

  // Outer: face oval
  addContourToPath(path, contours.faceOval, scale, offsetX, offsetY);

  // Inner holes: eyes
  addContourToPath(path, contours.leftEye, scale, offsetX, offsetY);
  addContourToPath(path, contours.rightEye, scale, offsetX, offsetY);

  // Inner holes: lips (combine upper and lower into one region)
  if (contours.upperLipTop.length >= 3 && contours.lowerLipBottom.length >= 3) {
    // Create a closed lip region from upper lip top → lower lip bottom reversed
    const lipPoints = [...contours.upperLipTop];
    for (let i = contours.lowerLipBottom.length - 1; i >= 0; i--) {
      lipPoints.push(contours.lowerLipBottom[i]);
    }
    addContourToPath(path, lipPoints, scale, offsetX, offsetY);
  }

  // Inner holes: eyebrows
  if (contours.leftEyebrowTop.length >= 3 && contours.leftEyebrowBottom.length >= 3) {
    const leftBrow = [...contours.leftEyebrowTop];
    for (let i = contours.leftEyebrowBottom.length - 1; i >= 0; i--) {
      leftBrow.push(contours.leftEyebrowBottom[i]);
    }
    addContourToPath(path, leftBrow, scale, offsetX, offsetY);
  }
  if (contours.rightEyebrowTop.length >= 3 && contours.rightEyebrowBottom.length >= 3) {
    const rightBrow = [...contours.rightEyebrowTop];
    for (let i = contours.rightEyebrowBottom.length - 1; i >= 0; i--) {
      rightBrow.push(contours.rightEyebrowBottom[i]);
    }
    addContourToPath(path, rightBrow, scale, offsetX, offsetY);
  }

  return path;
}

/**
 * Build under-eye mask from actual contour points.
 * Uses the area between the bottom of each eye contour and the
 * cheek/nose region below it.
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
    // Find the bottom half of the eye contour
    let minY = Infinity, maxY = -Infinity, centerX = 0;
    for (const p of eyePoints) {
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
      centerX += p.x;
    }
    centerX /= eyePoints.length;
    const eyeHeight = maxY - minY;
    const eyeWidth = (() => {
      let mnX = Infinity, mxX = -Infinity;
      for (const p of eyePoints) { if (p.x < mnX) mnX = p.x; if (p.x > mxX) mxX = p.x; }
      return mxX - mnX;
    })();

    // Create under-eye region: shifted down from eye bottom
    const underEyeTop = maxY;
    const underEyeBottom = maxY + eyeHeight * 0.8;
    const halfWidth = eyeWidth * 0.45;

    // Build as an ellipse-like shape using the eye contour's bottom curve
    const underEyePoints: Point[] = [
      { x: centerX - halfWidth, y: underEyeTop },
      { x: centerX - halfWidth * 0.7, y: underEyeBottom },
      { x: centerX, y: underEyeBottom + eyeHeight * 0.1 },
      { x: centerX + halfWidth * 0.7, y: underEyeBottom },
      { x: centerX + halfWidth, y: underEyeTop },
    ];

    addContourToPath(path, underEyePoints, scale, offsetX, offsetY);
  }

  return path;
}

/**
 * Build teeth mask from actual lip contour points.
 * Uses upper lip bottom → lower lip top to define the mouth opening.
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

  // Trace upper lip bottom (left to right)
  const first = toDisplay(upperBottom[0], scale, offsetX, offsetY);
  path.moveTo(first.x, first.y);
  for (let i = 1; i < upperBottom.length; i++) {
    const p = toDisplay(upperBottom[i], scale, offsetX, offsetY);
    path.lineTo(p.x, p.y);
  }

  // Trace lower lip top in reverse (right to left) to close the mouth opening
  for (let i = lowerTop.length - 1; i >= 0; i--) {
    const p = toDisplay(lowerTop[i], scale, offsetX, offsetY);
    path.lineTo(p.x, p.y);
  }

  path.close();
  return path;
}

/**
 * Build eye mask from actual eye contour points.
 * Uses the real eye shapes from ML Kit, not geometric estimates.
 */
export function buildEyeMask(
  contours: FaceContours,
  scale: number,
  offsetX: number,
  offsetY: number,
): SkPath | null {
  if (contours.leftEye.length < 3 && contours.rightEye.length < 3) return null;

  const path = Skia.Path.Make();

  // Add each eye as a closed contour from actual detected points
  if (contours.leftEye.length >= 3) {
    addContourToPath(path, contours.leftEye, scale, offsetX, offsetY);
  }
  if (contours.rightEye.length >= 3) {
    addContourToPath(path, contours.rightEye, scale, offsetX, offsetY);
  }

  return path;
}
