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
  noseBridge: Point[];
  noseBottom: Point[];
  boundingBox: BoundingBox;
}
