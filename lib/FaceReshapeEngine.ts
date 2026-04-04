/**
 * FaceReshapeEngine — Clean, portable face reshape engine.
 *
 * Zero imports from UI, store, or SDK packages.
 * Ready to drop into genez/engine/beauty/FaceReshapeEngine.ts
 *
 * Usage:
 *   const engine = new FaceReshapeEngine(contours, imageWidth, imageHeight);
 *   const displaced = engine.computeDeformed({ faceSlim: 50, eyeEnlarge: 30 });
 *   // displaced is a Point[] of vertex positions
 *   // engine.mesh has indices, texCoords for Skia Vertices rendering
 *   // engine.faceMaskOval has the expanded face oval for background lock
 */

import type { FaceContours, Point } from './types';
import { buildMesh, type DeformationMesh, type LandmarkIndices } from './meshDeformation';
import {
  applyFaceSlim,
  applyJawline,
  applyChin,
  applyForehead,
  applyEyeEnlarge,
  applyEyeDistance,
  applyNoseSlim,
  applyNoseLength,
  applyLipFullness,
  applySmile,
} from './displacements';

// --- Public types ---

export interface ReshapeValues {
  faceSlim: number;
  jawline: number;
  chin: number;
  forehead: number;
  eyeEnlarge: number;
  eyeDistance: number;
  noseSlim: number;
  noseLength: number;
  lipFullness: number;
  smile: number;
}

export const DEFAULT_RESHAPE_VALUES: ReshapeValues = {
  faceSlim: 0,
  jawline: 0,
  chin: 0,
  forehead: 0,
  eyeEnlarge: 0,
  eyeDistance: 0,
  noseSlim: 0,
  noseLength: 0,
  lipFullness: 0,
  smile: 0,
};

export interface ReshapeMeshData {
  /** Triangle indices for Skia Vertices */
  indices: number[];
  /** Texture UV coordinates (pixel coords in source image) */
  texCoords: Point[];
  /** Number of vertices */
  vertexCount: number;
}

// --- Engine ---

export class FaceReshapeEngine {
  /** The Delaunay mesh (positions, indices, texCoords, landmarks) */
  readonly mesh: DeformationMesh;
  /** Original vertex positions (immutable reference) */
  readonly originalPositions: readonly Point[];
  /** Mesh rendering data for Skia Vertices */
  readonly meshData: ReshapeMeshData;
  /** Expanded face oval points for background lock mask */
  readonly faceMaskOval: Point[];

  private readonly landmarkIndices: LandmarkIndices;
  private readonly faceCenter: Point;
  private readonly leftEyeCenter: Point;
  private readonly rightEyeCenter: Point;
  private readonly noseCenterX: number;
  private readonly lipCenter: Point;
  private readonly chinPoint: Point;
  private readonly foreheadPoint: Point;
  private readonly faceWidth: number;

  constructor(
    contours: FaceContours,
    imageWidth: number,
    imageHeight: number,
  ) {
    this.mesh = buildMesh(contours, imageWidth, imageHeight);
    this.originalPositions = this.mesh.positions;
    this.landmarkIndices = this.mesh.landmarkIndices;
    this.faceCenter = this.mesh.faceCenter;
    this.leftEyeCenter = this.mesh.leftEyeCenter;
    this.rightEyeCenter = this.mesh.rightEyeCenter;
    this.noseCenterX = this.mesh.noseCenterX;
    this.lipCenter = this.mesh.lipCenter;
    this.chinPoint = this.mesh.chinPoint;
    this.foreheadPoint = this.mesh.foreheadPoint;

    // Precompute face width
    let minX = Infinity, maxX = -Infinity;
    for (const idx of this.landmarkIndices.faceOval) {
      const x = this.originalPositions[idx].x;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
    this.faceWidth = maxX - minX;

    // Mesh data for Skia rendering
    this.meshData = {
      indices: this.mesh.indices,
      texCoords: this.mesh.texCoords.map((t) => ({
        x: t.x * imageWidth,
        y: t.y * imageHeight,
      })),
      vertexCount: this.mesh.positions.length,
    };

    // Expanded face oval for background lock mask (30% expansion, 2.5x vertical)
    const expandPx = Math.max(60, this.faceWidth * 0.3);
    this.faceMaskOval = this.computeExpandedOval(contours.faceOval, expandPx);
  }

  /**
   * Compute displaced vertex positions for the given slider values.
   * This is worklet-safe — can be called from useDerivedValue.
   *
   * @returns Point[] of displaced positions (same length as originalPositions)
   */
  computeDeformed(values: ReshapeValues): Point[] {
    'worklet';
    const positions: Point[] = new Array(this.originalPositions.length);
    for (let i = 0; i < this.originalPositions.length; i++) {
      positions[i] = {
        x: this.originalPositions[i].x,
        y: this.originalPositions[i].y,
      };
    }

    // Nose bottom Y
    let noseBottomY = 0;
    const noseBottomIndices = this.landmarkIndices.noseBottom;
    for (const idx of noseBottomIndices) noseBottomY += positions[idx].y;
    if (noseBottomIndices.length > 0) noseBottomY /= noseBottomIndices.length;

    // Apply all displacements
    applyFaceSlim(
      positions, this.landmarkIndices.faceOval,
      this.faceCenter.x, this.faceCenter.y, values.faceSlim,
    );
    applyJawline(
      positions, this.landmarkIndices.faceOval,
      this.faceCenter.x, this.faceCenter.y, values.jawline,
    );
    applyChin(
      positions, this.chinPoint.x, this.chinPoint.y,
      this.faceCenter.y, values.chin,
    );
    applyForehead(
      positions, this.faceCenter.x, this.foreheadPoint.y,
      this.faceCenter.y, this.faceWidth, values.forehead,
    );
    applyEyeEnlarge(
      positions, this.landmarkIndices.leftEye,
      this.leftEyeCenter.x, this.leftEyeCenter.y, values.eyeEnlarge,
    );
    applyEyeEnlarge(
      positions, this.landmarkIndices.rightEye,
      this.rightEyeCenter.x, this.rightEyeCenter.y, values.eyeEnlarge,
    );
    applyEyeDistance(
      positions, this.landmarkIndices.leftEye, this.landmarkIndices.rightEye,
      this.leftEyeCenter.x, this.leftEyeCenter.y,
      this.rightEyeCenter.x, this.rightEyeCenter.y,
      this.faceCenter.x, values.eyeDistance,
    );

    const allNoseIndices = [
      ...this.landmarkIndices.noseBridge,
      ...this.landmarkIndices.noseBottom,
    ];
    applyNoseSlim(positions, allNoseIndices, this.noseCenterX, values.noseSlim);
    applyNoseLength(
      positions, allNoseIndices, this.noseCenterX,
      noseBottomY, values.noseLength,
    );

    applyLipFullness(
      positions, this.lipCenter.x, this.lipCenter.y,
      values.lipFullness, this.faceWidth,
    );
    applySmile(
      positions, this.lipCenter.x, this.lipCenter.y,
      values.smile, this.faceWidth,
    );

    return positions;
  }

  /**
   * Check if any reshape value is non-zero.
   */
  static hasChanges(values: ReshapeValues): boolean {
    return Object.values(values).some((v) => v !== 0);
  }

  // --- Private helpers ---

  private computeExpandedOval(faceOval: Point[], expandPx: number): Point[] {
    let cx = 0, cy = 0;
    for (const p of faceOval) { cx += p.x; cy += p.y; }
    cx /= faceOval.length;
    cy /= faceOval.length;

    return faceOval.map((p) => {
      const dx = p.x - cx;
      const dy = p.y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) return p;

      const angle = Math.atan2(Math.abs(dy), Math.abs(dx));
      const verticalness = angle / (Math.PI / 2);
      const dirExpand = expandPx + expandPx * 1.5 * verticalness;
      const factor = (dist + dirExpand) / dist;

      return { x: cx + dx * factor, y: cy + dy * factor };
    });
  }
}
