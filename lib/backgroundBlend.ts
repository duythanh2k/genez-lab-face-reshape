import { Skia } from '@shopify/react-native-skia';
import type { SkPath } from '@shopify/react-native-skia';
import type { Point } from './types';

/**
 * Build an expanded face oval path for the background lock mask.
 * Expands outward from the centroid with extra vertical padding
 * to accommodate chin/forehead displacement.
 *
 * @param faceOval - Original face oval contour points
 * @param expandPx - Base pixels to expand outward horizontally
 * @param verticalExtra - Extra vertical expansion (default 1.5x of horizontal)
 */
export function buildExpandedFaceOvalPath(
  faceOval: Point[],
  expandPx: number = 20,
  verticalExtra: number = 2.5,
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
  // More expansion vertically (for chin/forehead) than horizontally
  const expanded: Point[] = faceOval.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) return p;

    // Directional expansion: more vertical, less horizontal
    const horizontalExpand = expandPx;
    const verticalExpand = expandPx * verticalExtra;

    // Blend expansion based on direction angle
    const angle = Math.atan2(Math.abs(dy), Math.abs(dx));
    // angle 0 = horizontal, PI/2 = vertical
    const verticalness = angle / (Math.PI / 2); // 0..1
    const dirExpand =
      horizontalExpand + (verticalExpand - horizontalExpand) * verticalness;

    const factor = (dist + dirExpand) / dist;
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
