import type { RNMLKitFace } from '@infinitered/react-native-mlkit-face-detection';
import type { FaceContours, Point } from './types';

/**
 * Generate a synthetic face oval from a bounding box.
 * Used as fallback when ML Kit doesn't return contour data.
 * Creates an ellipse with 36 points matching the expected oval count.
 */
function syntheticFaceOval(
  x: number,
  y: number,
  width: number,
  height: number,
): Point[] {
  const cx = x + width / 2;
  const cy = y + height / 2;
  const rx = width / 2;
  const ry = height / 2;
  const points: Point[] = [];
  const numPoints = 36;
  for (let i = 0; i < numPoints; i++) {
    const angle = (2 * Math.PI * i) / numPoints;
    points.push({
      x: cx + rx * Math.cos(angle),
      y: cy + ry * Math.sin(angle),
    });
  }
  return points;
}

/**
 * Generate synthetic eye points from bounding box.
 * Estimates eye positions at ~30% from top, ~30% and ~70% from left.
 */
function syntheticEyes(
  x: number,
  y: number,
  width: number,
  height: number,
): { leftEye: Point[]; rightEye: Point[] } {
  const eyeY = y + height * 0.35;
  const leftEyeX = x + width * 0.3;
  const rightEyeX = x + width * 0.7;
  const eyeRx = width * 0.08;
  const eyeRy = height * 0.04;
  const numPoints = 16;

  const makeEye = (cx: number, cy: number): Point[] => {
    const pts: Point[] = [];
    for (let i = 0; i < numPoints; i++) {
      const angle = (2 * Math.PI * i) / numPoints;
      pts.push({
        x: cx + eyeRx * Math.cos(angle),
        y: cy + eyeRy * Math.sin(angle),
      });
    }
    return pts;
  };

  return {
    leftEye: makeEye(leftEyeX, eyeY),
    rightEye: makeEye(rightEyeX, eyeY),
  };
}

/**
 * Generate synthetic nose points from bounding box.
 */
function syntheticNose(
  x: number,
  y: number,
  width: number,
  height: number,
): { noseBridge: Point[]; noseBottom: Point[] } {
  const cx = x + width / 2;
  return {
    noseBridge: [
      { x: cx, y: y + height * 0.4 },
      { x: cx, y: y + height * 0.55 },
    ],
    noseBottom: [
      { x: cx - width * 0.06, y: y + height * 0.58 },
      { x: cx, y: y + height * 0.6 },
      { x: cx + width * 0.06, y: y + height * 0.58 },
    ],
  };
}

/**
 * Extract structured face contours from an ML Kit face result.
 * Picks the largest face by bounding box area if multiple are detected.
 * Falls back to synthetic contours from bounding box when ML Kit
 * doesn't return contour data (contourMode may not be supported).
 */
export function extractFaceContours(
  faces: RNMLKitFace[],
): FaceContours | null {
  if (!faces || faces.length === 0) return null;

  // Pick the largest face by bounding box area
  const face = faces.reduce((largest, current) => {
    const largestArea = largest.frame.size.x * largest.frame.size.y;
    const currentArea = current.frame.size.x * current.frame.size.y;
    return currentArea > largestArea ? current : largest;
  });

  const bbox = {
    x: face.frame.origin.x,
    y: face.frame.origin.y,
    width: face.frame.size.x,
    height: face.frame.size.y,
  };

  // Build a lookup map for contour types
  const contourMap = new Map<string, Point[]>();
  if (face.contours) {
    for (const contour of face.contours) {
      if (contour.type && contour.points && contour.points.length > 0) {
        contourMap.set(
          contour.type,
          contour.points.map((p) => ({ x: p.x, y: p.y })),
        );
      }
    }
  }

  // ML Kit returns PascalCase contour types: "Face", "LeftEye", "NoseBridge", etc.
  // Try both PascalCase and camelCase for compatibility
  const getContour = (pascal: string, camel: string) =>
    contourMap.get(pascal) ?? contourMap.get(camel);

  const faceOval =
    getContour('Face', 'faceOval') ??
    syntheticFaceOval(bbox.x, bbox.y, bbox.width, bbox.height);

  const leftEye = getContour('LeftEye', 'leftEye');
  const rightEye = getContour('RightEye', 'rightEye');
  const eyes =
    leftEye && rightEye
      ? { leftEye, rightEye }
      : syntheticEyes(bbox.x, bbox.y, bbox.width, bbox.height);

  const noseBridge = getContour('NoseBridge', 'noseBridge');
  const noseBottom = getContour('NoseBottom', 'noseBottom');
  const nose =
    noseBridge && noseBottom
      ? { noseBridge, noseBottom }
      : syntheticNose(bbox.x, bbox.y, bbox.width, bbox.height);

  console.log(
    `[FaceDetection] Using ${contourMap.size > 0 ? 'real' : 'synthetic'} contours. Map size: ${contourMap.size}`,
  );

  return {
    faceOval,
    leftEye: eyes.leftEye,
    rightEye: eyes.rightEye,
    noseBridge: nose.noseBridge,
    noseBottom: nose.noseBottom,
    boundingBox: bbox,
  };
}
