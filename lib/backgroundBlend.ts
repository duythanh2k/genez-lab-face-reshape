import { Skia } from '@shopify/react-native-skia';
import type { SkPath } from '@shopify/react-native-skia';
import type { Point } from './types';

/**
 * Build a Skia Path from face oval contour points.
 * Used as a soft mask for background lock blending.
 */
export function buildFaceOvalPath(faceOval: Point[]): SkPath {
  const path = Skia.Path.Make();
  if (faceOval.length < 3) return path;

  path.moveTo(faceOval[0].x, faceOval[0].y);
  for (let i = 1; i < faceOval.length; i++) {
    path.lineTo(faceOval[i].x, faceOval[i].y);
  }
  path.close();
  return path;
}

/**
 * Build an expanded face oval path for the mask.
 * Expands outward from the centroid so the feather blur
 * doesn't eat into the face region.
 *
 * @param faceOval - Original face oval contour points
 * @param expandPx - Pixels to expand outward (default 20)
 */
export function buildExpandedFaceOvalPath(
  faceOval: Point[],
  expandPx: number = 20,
): SkPath {
  if (faceOval.length < 3) return Skia.Path.Make();

  // Compute centroid
  let cx = 0;
  let cy = 0;
  for (const p of faceOval) {
    cx += p.x;
    cy += p.y;
  }
  cx /= faceOval.length;
  cy /= faceOval.length;

  // Expand each point outward from centroid
  const expanded: Point[] = faceOval.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) return p;
    const factor = (dist + expandPx) / dist;
    return {
      x: cx + dx * factor,
      y: cy + dy * factor,
    };
  });

  const path = Skia.Path.Make();
  path.moveTo(expanded[0].x, expanded[0].y);
  for (let i = 1; i < expanded.length; i++) {
    path.lineTo(expanded[i].x, expanded[i].y);
  }
  path.close();
  return path;
}
