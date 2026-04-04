export interface Point {
  x: number;
  y: number;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FaceContours {
  faceOval: Point[];
  leftEye: Point[];
  rightEye: Point[];
  leftEyebrowTop: Point[];
  leftEyebrowBottom: Point[];
  rightEyebrowTop: Point[];
  rightEyebrowBottom: Point[];
  noseBridge: Point[];
  noseBottom: Point[];
  upperLipTop: Point[];
  upperLipBottom: Point[];
  lowerLipTop: Point[];
  lowerLipBottom: Point[];
  boundingBox: BoundingBox;
}
