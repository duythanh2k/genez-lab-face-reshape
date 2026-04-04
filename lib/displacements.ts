/**
 * Worklet-safe displacement functions for face reshaping.
 * All functions apply smooth distance-based falloff to ALL nearby vertices.
 * They run on the UI thread inside Reanimated worklets every frame.
 */

import type { Point } from './types';
import type { LandmarkIndices } from './meshDeformation';

// --- Helpers ---

function smoothFalloff(distance: number, radius: number): number {
  'worklet';
  if (distance >= radius) return 0;
  const t = distance / radius;
  return 0.5 * (1 + Math.cos(Math.PI * t));
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  'worklet';
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

function maxDistFromCenter(positions: Point[], indices: number[], cx: number, cy: number): number {
  'worklet';
  let maxD = 0;
  for (const idx of indices) {
    const d = dist(positions[idx].x, positions[idx].y, cx, cy);
    if (d > maxD) maxD = d;
  }
  return maxD;
}

// --- 1. Face Slim ---

export function applyFaceSlim(
  positions: Point[],
  faceOvalIndices: number[],
  faceCenterX: number,
  faceCenterY: number,
  intensity: number,
): void {
  'worklet';
  if (intensity === 0) return;

  const maxDisplacement = 0.15 * (intensity / 100);
  let minY = Infinity, maxY = -Infinity;
  const maxFaceDist = maxDistFromCenter(positions, faceOvalIndices, faceCenterX, faceCenterY);
  for (const idx of faceOvalIndices) {
    if (positions[idx].y < minY) minY = positions[idx].y;
    if (positions[idx].y > maxY) maxY = positions[idx].y;
  }
  const faceHeight = maxY - minY;
  if (faceHeight <= 0) return;

  const influenceRadius = maxFaceDist * 1.5;

  for (let i = 0; i < positions.length; i++) {
    const p = positions[i];
    const dx = p.x - faceCenterX;
    const dy = p.y - faceCenterY;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 1 || d >= influenceRadius) continue;

    const distFalloff = smoothFalloff(d, influenceRadius);
    const normalizedDist = d / maxFaceDist;
    const radialWeight = normalizedDist <= 1.0
      ? normalizedDist
      : smoothFalloff(d - maxFaceDist, influenceRadius - maxFaceDist);
    const verticalNorm = Math.max(0, (p.y - minY) / faceHeight);
    const verticalWeight = verticalNorm * verticalNorm;

    const weight = radialWeight * verticalWeight * distFalloff;
    if (weight < 0.001) continue;

    const displacement = d * maxDisplacement * weight;
    positions[i] = { x: p.x - (dx / d) * displacement, y: p.y };
  }
}

// --- 2. Jawline Define ---

export function applyJawline(
  positions: Point[],
  faceOvalIndices: number[],
  faceCenterX: number,
  faceCenterY: number,
  intensity: number,
): void {
  'worklet';
  if (intensity === 0) return;

  const factor = 0.12 * (intensity / 100);
  let minY = Infinity, maxY = -Infinity;
  const maxFaceDist = maxDistFromCenter(positions, faceOvalIndices, faceCenterX, faceCenterY);
  for (const idx of faceOvalIndices) {
    if (positions[idx].y < minY) minY = positions[idx].y;
    if (positions[idx].y > maxY) maxY = positions[idx].y;
  }
  const faceHeight = maxY - minY;
  if (faceHeight <= 0) return;

  const influenceRadius = maxFaceDist * 1.3;
  // Jawline = lower 40% of face, horizontal sharpening
  const jawStart = minY + faceHeight * 0.6;

  for (let i = 0; i < positions.length; i++) {
    const p = positions[i];
    if (p.y < jawStart) continue;
    const dx = p.x - faceCenterX;
    const dy = p.y - faceCenterY;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 1 || d >= influenceRadius) continue;

    const distFalloff = smoothFalloff(d, influenceRadius);
    // Stronger at jaw level, fades toward chin
    const jawWeight = Math.sin(((p.y - jawStart) / (maxY - jawStart)) * Math.PI);
    const weight = jawWeight * distFalloff;
    if (weight < 0.001) continue;

    const displacement = d * factor * weight;
    positions[i] = { x: p.x - (dx / d) * displacement, y: p.y };
  }
}

// --- 3. Chin Adjust ---

export function applyChin(
  positions: Point[],
  chinX: number,
  chinY: number,
  faceCenterY: number,
  intensity: number,
): void {
  'worklet';
  if (intensity === 0) return;

  // Positive = longer chin (push down), negative = shorter chin (push up)
  const maxShift = (chinY - faceCenterY) * 0.2 * (intensity / 100);
  const influenceRadius = Math.abs(chinY - faceCenterY) * 0.6;

  for (let i = 0; i < positions.length; i++) {
    const p = positions[i];
    const d = dist(p.x, p.y, chinX, chinY);
    if (d >= influenceRadius) continue;

    const falloff = smoothFalloff(d, influenceRadius);
    positions[i] = { x: p.x, y: p.y + maxShift * falloff };
  }
}

// --- 4. Forehead ---

export function applyForehead(
  positions: Point[],
  faceCenterX: number,
  foreheadY: number,
  faceCenterY: number,
  faceWidth: number,
  intensity: number,
): void {
  'worklet';
  if (intensity === 0) return;

  // Positive = taller forehead (push up), negative = shorter
  const foreheadHeight = Math.abs(faceCenterY - foreheadY);
  const maxShift = foreheadHeight * 0.25 * (intensity / 100);

  // Use face center X (not forehead point X) so the effect is symmetric
  // Influence covers the full forehead width + some vertical range
  const influenceRadiusX = faceWidth * 0.6;
  const influenceRadiusY = foreheadHeight * 1.0;

  for (let i = 0; i < positions.length; i++) {
    const p = positions[i];
    // Only affect upper half of face
    if (p.y > faceCenterY) continue;

    const dx = p.x - faceCenterX;
    const dy = p.y - foreheadY;

    // Elliptical distance for wider horizontal coverage
    const normalizedDist = Math.sqrt(
      (dx / influenceRadiusX) ** 2 + (dy / influenceRadiusY) ** 2,
    );
    if (normalizedDist >= 1) continue;

    const falloff = smoothFalloff(normalizedDist, 1);
    positions[i] = { x: p.x, y: p.y - maxShift * falloff };
  }
}

// --- 5. Eye Enlarge ---

export function applyEyeEnlarge(
  positions: Point[],
  eyeIndices: number[],
  eyeCenterX: number,
  eyeCenterY: number,
  intensity: number,
): void {
  'worklet';
  if (intensity === 0) return;

  const scaleFactor = 1 + (intensity / 100) * 0.3;
  const maxEyeDist = maxDistFromCenter(positions, eyeIndices, eyeCenterX, eyeCenterY);
  const influenceRadius = maxEyeDist * 2.5;
  if (influenceRadius < 1) return;

  for (let i = 0; i < positions.length; i++) {
    const p = positions[i];
    const dx = p.x - eyeCenterX;
    const dy = p.y - eyeCenterY;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d >= influenceRadius) continue;

    const falloff = smoothFalloff(d, influenceRadius);
    const scaledX = eyeCenterX + dx * scaleFactor;
    const scaledY = eyeCenterY + dy * scaleFactor;
    positions[i] = {
      x: p.x + (scaledX - p.x) * falloff,
      y: p.y + (scaledY - p.y) * falloff,
    };
  }
}

// --- 6. Eye Distance ---

export function applyEyeDistance(
  positions: Point[],
  leftEyeIndices: number[],
  rightEyeIndices: number[],
  leftEyeCenterX: number,
  leftEyeCenterY: number,
  rightEyeCenterX: number,
  rightEyeCenterY: number,
  faceCenterX: number,
  intensity: number,
): void {
  'worklet';
  if (intensity === 0) return;

  // Positive = eyes further apart, negative = closer
  const eyeSpan = Math.abs(rightEyeCenterX - leftEyeCenterX);
  const maxShift = eyeSpan * 0.15 * (intensity / 100);

  const leftMaxDist = maxDistFromCenter(positions, leftEyeIndices, leftEyeCenterX, leftEyeCenterY);
  const rightMaxDist = maxDistFromCenter(positions, rightEyeIndices, rightEyeCenterX, rightEyeCenterY);
  const leftRadius = leftMaxDist * 2.5;
  const rightRadius = rightMaxDist * 2.5;

  for (let i = 0; i < positions.length; i++) {
    const p = positions[i];
    // Left eye region: shift left (negative X)
    const dLeft = dist(p.x, p.y, leftEyeCenterX, leftEyeCenterY);
    if (dLeft < leftRadius) {
      const falloff = smoothFalloff(dLeft, leftRadius);
      positions[i] = { x: positions[i].x - maxShift * falloff, y: positions[i].y };
    }
    // Right eye region: shift right (positive X)
    const dRight = dist(p.x, p.y, rightEyeCenterX, rightEyeCenterY);
    if (dRight < rightRadius) {
      const falloff = smoothFalloff(dRight, rightRadius);
      positions[i] = { x: positions[i].x + maxShift * falloff, y: positions[i].y };
    }
  }
}

// --- 7. Nose Slim ---

export function applyNoseSlim(
  positions: Point[],
  noseIndices: number[],
  noseCenterX: number,
  intensity: number,
): void {
  'worklet';
  if (intensity === 0) return;

  const factor = (intensity / 100) * 0.25;
  let noseCenterY = 0;
  let maxNoseDist = 0;
  for (const idx of noseIndices) {
    const dx = Math.abs(positions[idx].x - noseCenterX);
    if (dx > maxNoseDist) maxNoseDist = dx;
    noseCenterY += positions[idx].y;
  }
  if (noseIndices.length > 0) noseCenterY /= noseIndices.length;

  const influenceRadius = Math.max(maxNoseDist * 3, 30);

  for (let i = 0; i < positions.length; i++) {
    const p = positions[i];
    const d = dist(p.x, p.y, noseCenterX, noseCenterY);
    if (d >= influenceRadius) continue;

    const falloff = smoothFalloff(d, influenceRadius);
    positions[i] = { x: p.x - (p.x - noseCenterX) * factor * falloff, y: p.y };
  }
}

// --- 8. Nose Length ---

export function applyNoseLength(
  positions: Point[],
  noseIndices: number[],
  noseCenterX: number,
  noseBottomY: number,
  intensity: number,
): void {
  'worklet';
  if (intensity === 0) return;

  // Positive = longer nose (push bottom down), negative = shorter
  let noseCenterY = 0;
  for (const idx of noseIndices) noseCenterY += positions[idx].y;
  if (noseIndices.length > 0) noseCenterY /= noseIndices.length;

  const noseHeight = Math.abs(noseBottomY - noseCenterY);
  const maxShift = noseHeight * 0.3 * (intensity / 100);
  const influenceRadius = noseHeight * 2;

  for (let i = 0; i < positions.length; i++) {
    const p = positions[i];
    const d = dist(p.x, p.y, noseCenterX, noseBottomY);
    if (d >= influenceRadius) continue;

    const falloff = smoothFalloff(d, influenceRadius);
    // Only shift vertically, stronger near nose bottom
    positions[i] = { x: p.x, y: p.y + maxShift * falloff };
  }
}

// --- 9. Lip Fullness ---

export function applyLipFullness(
  positions: Point[],
  lipCenterX: number,
  lipCenterY: number,
  intensity: number,
  faceWidth: number,
): void {
  'worklet';
  if (intensity === 0) return;

  // Scale lips outward from lip center (both vertical and slight horizontal)
  const scaleFactor = 1 + (intensity / 100) * 0.25;
  const influenceRadius = faceWidth * 0.25;

  for (let i = 0; i < positions.length; i++) {
    const p = positions[i];
    const dx = p.x - lipCenterX;
    const dy = p.y - lipCenterY;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d >= influenceRadius) continue;

    const falloff = smoothFalloff(d, influenceRadius);
    // Stronger vertical than horizontal for natural lip plumping
    const scaledX = lipCenterX + dx * (1 + (scaleFactor - 1) * 0.3);
    const scaledY = lipCenterY + dy * scaleFactor;
    positions[i] = {
      x: p.x + (scaledX - p.x) * falloff,
      y: p.y + (scaledY - p.y) * falloff,
    };
  }
}

// --- 10. Smile ---

export function applySmile(
  positions: Point[],
  lipCenterX: number,
  lipCenterY: number,
  intensity: number,
  faceWidth: number,
): void {
  'worklet';
  if (intensity === 0) return;

  // Lift mouth corners upward, creating a smile curve
  const maxLift = faceWidth * 0.06 * (intensity / 100);
  const influenceRadius = faceWidth * 0.3;

  for (let i = 0; i < positions.length; i++) {
    const p = positions[i];
    const dx = p.x - lipCenterX;
    const dy = p.y - lipCenterY;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d >= influenceRadius) continue;

    const distFalloff = smoothFalloff(d, influenceRadius);
    // Horizontal offset: corners lift more than center
    const horizontalWeight = Math.abs(dx) / (faceWidth * 0.2);
    const cornerLift = Math.min(horizontalWeight, 1.0);
    // Lift corners up (negative Y)
    const lift = -maxLift * cornerLift * distFalloff;
    positions[i] = { x: p.x, y: p.y + lift };
  }
}

// --- Main entry point ---

export function computeDisplacedPositions(
  originalPositions: Point[],
  landmarkIndices: LandmarkIndices,
  faceCenter: Point,
  leftEyeCenter: Point,
  rightEyeCenter: Point,
  noseCenterX: number,
  lipCenter: Point,
  chinPoint: Point,
  foreheadPoint: Point,
  faceSlim: number,
  jawline: number,
  chin: number,
  forehead: number,
  eyeEnlarge: number,
  eyeDistance: number,
  noseSlim: number,
  noseLength: number,
  lipFullness: number,
  smile: number,
): Point[] {
  'worklet';
  const positions: Point[] = new Array(originalPositions.length);
  for (let i = 0; i < originalPositions.length; i++) {
    positions[i] = { x: originalPositions[i].x, y: originalPositions[i].y };
  }

  // Compute face width for relative sizing
  let minX = Infinity, maxX = -Infinity;
  for (const idx of landmarkIndices.faceOval) {
    if (positions[idx].x < minX) minX = positions[idx].x;
    if (positions[idx].x > maxX) maxX = positions[idx].x;
  }
  const faceWidth = maxX - minX;

  // Nose bottom Y for nose length
  let noseBottomY = 0;
  const noseBottomIndices = landmarkIndices.noseBottom;
  for (const idx of noseBottomIndices) noseBottomY += positions[idx].y;
  if (noseBottomIndices.length > 0) noseBottomY /= noseBottomIndices.length;

  // Apply all displacements
  applyFaceSlim(positions, landmarkIndices.faceOval, faceCenter.x, faceCenter.y, faceSlim);
  applyJawline(positions, landmarkIndices.faceOval, faceCenter.x, faceCenter.y, jawline);
  applyChin(positions, chinPoint.x, chinPoint.y, faceCenter.y, chin);
  applyForehead(positions, faceCenter.x, foreheadPoint.y, faceCenter.y, faceWidth, forehead);

  applyEyeEnlarge(positions, landmarkIndices.leftEye, leftEyeCenter.x, leftEyeCenter.y, eyeEnlarge);
  applyEyeEnlarge(positions, landmarkIndices.rightEye, rightEyeCenter.x, rightEyeCenter.y, eyeEnlarge);
  applyEyeDistance(positions, landmarkIndices.leftEye, landmarkIndices.rightEye,
    leftEyeCenter.x, leftEyeCenter.y, rightEyeCenter.x, rightEyeCenter.y, faceCenter.x, eyeDistance);

  const allNoseIndices = [...landmarkIndices.noseBridge, ...landmarkIndices.noseBottom];
  applyNoseSlim(positions, allNoseIndices, noseCenterX, noseSlim);
  applyNoseLength(positions, allNoseIndices, noseCenterX, noseBottomY, noseLength);

  applyLipFullness(positions, lipCenter.x, lipCenter.y, lipFullness, faceWidth);
  applySmile(positions, lipCenter.x, lipCenter.y, smile, faceWidth);

  return positions;
}
