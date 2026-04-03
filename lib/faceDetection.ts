import type { RNMLKitFace } from '@infinitered/react-native-mlkit-face-detection';
import type { FaceContours, Point } from './types';

/**
 * Extract structured face contours from an ML Kit face result.
 * Picks the largest face by bounding box area if multiple are detected.
 * Returns null if no faces found or contour data is missing.
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

  // Build a lookup map for contour types
  const contourMap = new Map<string, Point[]>();
  for (const contour of face.contours) {
    if (contour.type && contour.points) {
      contourMap.set(
        contour.type,
        contour.points.map((p) => ({ x: p.x, y: p.y })),
      );
    }
  }

  // Extract required contours
  const faceOval = contourMap.get('faceOval');
  const leftEye = contourMap.get('leftEye');
  const rightEye = contourMap.get('rightEye');
  const noseBridge = contourMap.get('noseBridge');
  const noseBottom = contourMap.get('noseBottom');

  // Face oval is required — without it, no reshape is possible
  if (!faceOval || faceOval.length === 0) return null;

  return {
    faceOval,
    leftEye: leftEye ?? [],
    rightEye: rightEye ?? [],
    noseBridge: noseBridge ?? [],
    noseBottom: noseBottom ?? [],
    boundingBox: {
      x: face.frame.origin.x,
      y: face.frame.origin.y,
      width: face.frame.size.x,
      height: face.frame.size.y,
    },
  };
}
