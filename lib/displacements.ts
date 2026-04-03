/**
 * Worklet-safe displacement functions for face reshaping.
 * All functions are pure arithmetic — no JS APIs, no closures.
 * They run on the UI thread inside Reanimated worklets every frame.
 */

import type { Point } from './types';

/**
 * Apply face slim: push jawline contour points inward toward face center.
 * The top of the face oval (forehead) moves less than the jaw.
 *
 * @param positions - All mesh vertex positions (will be mutated in the copy)
 * @param faceOvalIndices - Indices of face oval vertices
 * @param faceCenterX - X coordinate of face center
 * @param faceCenterY - Y coordinate of face center
 * @param intensity - Slider value -100..100 (positive = slimmer)
 */
export function applyFaceSlim(
  positions: Point[],
  faceOvalIndices: number[],
  faceCenterX: number,
  faceCenterY: number,
  intensity: number,
): void {
  'worklet';
  if (intensity === 0) return;

  // Max displacement as fraction of face width (~15% at full intensity)
  const maxDisplacement = 0.15 * (intensity / 100);

  // Find face oval vertical extents for weight calculation
  let minY = Infinity;
  let maxY = -Infinity;
  for (const idx of faceOvalIndices) {
    const y = positions[idx].y;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const faceHeight = maxY - minY;
  if (faceHeight <= 0) return;

  for (const idx of faceOvalIndices) {
    const p = positions[idx];
    const dx = p.x - faceCenterX;
    const dy = p.y - faceCenterY;

    // Weight: stronger on jaw (bottom), weaker on forehead (top)
    // Normalized 0 (top) to 1 (bottom)
    const verticalWeight = Math.max(0, (p.y - minY) / faceHeight);
    // Quadratic falloff: jaw moves most, forehead barely moves
    const weight = verticalWeight * verticalWeight;

    // Distance from center for displacement magnitude
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) continue;

    // Push inward (toward center) — only horizontal component
    const displacement = dist * maxDisplacement * weight;
    const dirX = dx / dist;

    positions[idx] = {
      x: p.x - dirX * displacement,
      y: p.y,
    };
  }
}

/**
 * Apply eye enlarge: scale eye contour points outward from eye center.
 *
 * @param positions - All mesh vertex positions
 * @param eyeIndices - Indices of eye contour vertices
 * @param eyeCenterX - X coordinate of eye center
 * @param eyeCenterY - Y coordinate of eye center
 * @param intensity - Slider value -100..100 (positive = larger)
 */
export function applyEyeEnlarge(
  positions: Point[],
  eyeIndices: number[],
  eyeCenterX: number,
  eyeCenterY: number,
  intensity: number,
): void {
  'worklet';
  if (intensity === 0) return;

  // Scale factor: 1.0 at 0%, up to 1.3 at 100% (30% enlargement max)
  const scaleFactor = 1 + (intensity / 100) * 0.3;

  for (const idx of eyeIndices) {
    const p = positions[idx];
    const dx = p.x - eyeCenterX;
    const dy = p.y - eyeCenterY;

    positions[idx] = {
      x: eyeCenterX + dx * scaleFactor,
      y: eyeCenterY + dy * scaleFactor,
    };
  }
}

/**
 * Apply nose slim: push nose bridge/bottom points inward toward center line.
 * Only horizontal displacement — nose stays at same height.
 *
 * @param positions - All mesh vertex positions
 * @param noseIndices - Indices of nose contour vertices (bridge + bottom)
 * @param noseCenterX - X coordinate of nose center line
 * @param intensity - Slider value -100..100 (positive = slimmer)
 */
export function applyNoseSlim(
  positions: Point[],
  noseIndices: number[],
  noseCenterX: number,
  intensity: number,
): void {
  'worklet';
  if (intensity === 0) return;

  // Max displacement: 25% of nose width at full intensity
  const factor = (intensity / 100) * 0.25;

  for (const idx of noseIndices) {
    const p = positions[idx];
    const dx = p.x - noseCenterX;

    // Push toward center line
    positions[idx] = {
      x: p.x - dx * factor,
      y: p.y,
    };
  }
}

/**
 * Apply all displacements and return a new positions array.
 * This is the main entry point called from useDerivedValue worklet.
 */
export function computeDisplacedPositions(
  originalPositions: Point[],
  landmarkIndices: {
    faceOval: number[];
    leftEye: number[];
    rightEye: number[];
    noseBridge: number[];
    noseBottom: number[];
  },
  faceCenter: Point,
  leftEyeCenter: Point,
  rightEyeCenter: Point,
  noseCenterX: number,
  faceSlim: number,
  eyeEnlarge: number,
  noseSlim: number,
): Point[] {
  'worklet';
  // Deep copy positions
  const positions: Point[] = new Array(originalPositions.length);
  for (let i = 0; i < originalPositions.length; i++) {
    positions[i] = { x: originalPositions[i].x, y: originalPositions[i].y };
  }

  // Apply each displacement in order
  applyFaceSlim(
    positions,
    landmarkIndices.faceOval,
    faceCenter.x,
    faceCenter.y,
    faceSlim,
  );

  applyEyeEnlarge(
    positions,
    landmarkIndices.leftEye,
    leftEyeCenter.x,
    leftEyeCenter.y,
    eyeEnlarge,
  );

  applyEyeEnlarge(
    positions,
    landmarkIndices.rightEye,
    rightEyeCenter.x,
    rightEyeCenter.y,
    eyeEnlarge,
  );

  const allNoseIndices = [
    ...landmarkIndices.noseBridge,
    ...landmarkIndices.noseBottom,
  ];
  applyNoseSlim(positions, allNoseIndices, noseCenterX, noseSlim);

  return positions;
}
