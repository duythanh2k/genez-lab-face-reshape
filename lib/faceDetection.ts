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
 * Generate synthetic lip contours from bounding box.
 * Lips at ~65% of face height, ~30% face width, upper lip with Cupid's bow.
 */
function syntheticLipContours(
  x: number,
  y: number,
  width: number,
  height: number,
): {
  upperLipTop: Point[];
  upperLipBottom: Point[];
  lowerLipTop: Point[];
  lowerLipBottom: Point[];
} {
  const cx = x + width / 2;
  const cy = y + height * 0.65;
  const lipW = width * 0.3;
  const lipH = height * 0.08;
  const halfW = lipW / 2;

  // Upper lip top: 11 points with Cupid's bow (small dip in the middle)
  const upperLipTop: Point[] = [];
  for (let i = 0; i < 11; i++) {
    const t = i / 10; // 0..1
    const px = cx - halfW + lipW * t;
    // Cupid's bow: small dip at center (t=0.5), peaks at t=0.35 and t=0.65
    let py: number;
    if (t < 0.35) {
      py = cy - lipH * 0.4 + (lipH * 0.1) * (t / 0.35);
    } else if (t < 0.5) {
      py = cy - lipH * 0.3 + (lipH * 0.15) * ((t - 0.35) / 0.15);
    } else if (t < 0.65) {
      py = cy - lipH * 0.15 - (lipH * 0.15) * ((t - 0.5) / 0.15);
    } else {
      py = cy - lipH * 0.3 - (lipH * 0.1) * ((t - 0.65) / 0.35);
    }
    upperLipTop.push({ x: px, y: py });
  }

  // Upper lip bottom: 9 points forming a smooth curve
  const upperLipBottom: Point[] = [];
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    const px = cx - halfW + lipW * t;
    const py = cy - lipH * 0.05 + Math.sin(t * Math.PI) * (lipH * 0.1);
    upperLipBottom.push({ x: px, y: py });
  }

  // Lower lip top: 9 points mirroring upper lip bottom
  const lowerLipTop: Point[] = [];
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    const px = cx - halfW + lipW * t;
    const py = cy + lipH * 0.05 - Math.sin(t * Math.PI) * (lipH * 0.1);
    lowerLipTop.push({ x: px, y: py });
  }

  // Lower lip bottom: 9 points, rounded curve
  const lowerLipBottom: Point[] = [];
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    const px = cx - halfW + lipW * t;
    const py = cy + lipH * 0.4 - Math.sin(t * Math.PI) * (lipH * 0.25);
    lowerLipBottom.push({ x: px, y: py });
  }

  return { upperLipTop, upperLipBottom, lowerLipTop, lowerLipBottom };
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

  // Lip contours — fall back to synthetic if all empty
  let upperLipTop = getContour('UpperLipTop', 'upperLipTop') ?? [];
  let upperLipBottom = getContour('UpperLipBottom', 'upperLipBottom') ?? [];
  let lowerLipTop = getContour('LowerLipTop', 'lowerLipTop') ?? [];
  let lowerLipBottom = getContour('LowerLipBottom', 'lowerLipBottom') ?? [];
  if (
    upperLipTop.length === 0 &&
    upperLipBottom.length === 0 &&
    lowerLipTop.length === 0 &&
    lowerLipBottom.length === 0
  ) {
    const lips = syntheticLipContours(bbox.x, bbox.y, bbox.width, bbox.height);
    upperLipTop = lips.upperLipTop;
    upperLipBottom = lips.upperLipBottom;
    lowerLipTop = lips.lowerLipTop;
    lowerLipBottom = lips.lowerLipBottom;
  }

  // Eyebrow contours
  const leftEyebrowTop = getContour('LeftEyebrowTop', 'leftEyebrowTop') ?? [];
  const leftEyebrowBottom = getContour('LeftEyebrowBottom', 'leftEyebrowBottom') ?? [];
  const rightEyebrowTop = getContour('RightEyebrowTop', 'rightEyebrowTop') ?? [];
  const rightEyebrowBottom = getContour('RightEyebrowBottom', 'rightEyebrowBottom') ?? [];

  console.log(
    `[FaceDetection] Using ${contourMap.size > 0 ? 'real' : 'synthetic'} contours. Map size: ${contourMap.size}`,
  );

  return {
    faceOval,
    leftEye: eyes.leftEye,
    rightEye: eyes.rightEye,
    leftEyebrowTop,
    leftEyebrowBottom,
    rightEyebrowTop,
    rightEyebrowBottom,
    noseBridge: nose.noseBridge,
    noseBottom: nose.noseBottom,
    upperLipTop,
    upperLipBottom,
    lowerLipTop,
    lowerLipBottom,
    boundingBox: bbox,
  };
}

/**
 * Extract contours from a single RNMLKitFace.
 * Shared logic used by both extractFaceContours and extractAllFaceContours.
 */
function extractSingleFaceContours(face: RNMLKitFace): FaceContours {
  const bbox = {
    x: face.frame.origin.x,
    y: face.frame.origin.y,
    width: face.frame.size.x,
    height: face.frame.size.y,
  };

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

  let upperLipTop = getContour('UpperLipTop', 'upperLipTop') ?? [];
  let upperLipBottom = getContour('UpperLipBottom', 'upperLipBottom') ?? [];
  let lowerLipTop = getContour('LowerLipTop', 'lowerLipTop') ?? [];
  let lowerLipBottom = getContour('LowerLipBottom', 'lowerLipBottom') ?? [];

  // Fall back to synthetic lip contours if ML Kit didn't return any
  if (
    upperLipTop.length === 0 &&
    upperLipBottom.length === 0 &&
    lowerLipTop.length === 0 &&
    lowerLipBottom.length === 0
  ) {
    const lips = syntheticLipContours(bbox.x, bbox.y, bbox.width, bbox.height);
    upperLipTop = lips.upperLipTop;
    upperLipBottom = lips.upperLipBottom;
    lowerLipTop = lips.lowerLipTop;
    lowerLipBottom = lips.lowerLipBottom;
  }

  const leftEyebrowTop = getContour('LeftEyebrowTop', 'leftEyebrowTop') ?? [];
  const leftEyebrowBottom = getContour('LeftEyebrowBottom', 'leftEyebrowBottom') ?? [];
  const rightEyebrowTop = getContour('RightEyebrowTop', 'rightEyebrowTop') ?? [];
  const rightEyebrowBottom = getContour('RightEyebrowBottom', 'rightEyebrowBottom') ?? [];

  return {
    faceOval,
    leftEye: eyes.leftEye,
    rightEye: eyes.rightEye,
    leftEyebrowTop,
    leftEyebrowBottom,
    rightEyebrowTop,
    rightEyebrowBottom,
    noseBridge: nose.noseBridge,
    noseBottom: nose.noseBottom,
    upperLipTop,
    upperLipBottom,
    lowerLipTop,
    lowerLipBottom,
    boundingBox: bbox,
  };
}

/**
 * Extract structured face contours from ALL detected faces.
 * Returns array sorted by bounding box area descending (largest first).
 * Falls back to synthetic contours per face individually.
 */
export function extractAllFaceContours(
  faces: RNMLKitFace[],
): FaceContours[] {
  if (!faces || faces.length === 0) return [];

  const allContours = faces.map((face) => extractSingleFaceContours(face));

  // Sort by bounding box area descending (largest first)
  allContours.sort((a, b) => {
    const areaA = a.boundingBox.width * a.boundingBox.height;
    const areaB = b.boundingBox.width * b.boundingBox.height;
    return areaB - areaA;
  });

  console.log(
    `[FaceDetection] extractAllFaceContours: ${allContours.length} faces processed`,
  );

  return allContours;
}
