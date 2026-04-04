import { Skia } from '@shopify/react-native-skia';
import type { SkRuntimeEffect } from '@shopify/react-native-skia';
import type { Point } from './types';
import type { LandmarkIndices } from './meshDeformation';

/**
 * Max control point pairs the shader supports.
 * Each pair = 1 float4 uniform (srcX, srcY, dstX, dstY).
 * 32 pairs = 128 floats, well within mobile GPU uniform limits.
 */
export const MAX_WARP_POINTS = 32;

/**
 * SkSL warp shader using inverse distance weighting.
 * For each output pixel, computes a warped sample coordinate
 * based on nearby control point displacements.
 */
const WARP_SHADER_SOURCE = `
uniform shader image;
uniform float2 resolution;
uniform int numPoints;
uniform float radius;

// Control point pairs: xy = displaced position, zw = original position
// For inverse warp: at output pixel near displaced pos, sample from original pos
uniform float4 p0;  uniform float4 p1;  uniform float4 p2;  uniform float4 p3;
uniform float4 p4;  uniform float4 p5;  uniform float4 p6;  uniform float4 p7;
uniform float4 p8;  uniform float4 p9;  uniform float4 p10; uniform float4 p11;
uniform float4 p12; uniform float4 p13; uniform float4 p14; uniform float4 p15;
uniform float4 p16; uniform float4 p17; uniform float4 p18; uniform float4 p19;
uniform float4 p20; uniform float4 p21; uniform float4 p22; uniform float4 p23;
uniform float4 p24; uniform float4 p25; uniform float4 p26; uniform float4 p27;
uniform float4 p28; uniform float4 p29; uniform float4 p30; uniform float4 p31;

float4 getP(int i) {
  if (i == 0) return p0;   if (i == 1) return p1;
  if (i == 2) return p2;   if (i == 3) return p3;
  if (i == 4) return p4;   if (i == 5) return p5;
  if (i == 6) return p6;   if (i == 7) return p7;
  if (i == 8) return p8;   if (i == 9) return p9;
  if (i == 10) return p10; if (i == 11) return p11;
  if (i == 12) return p12; if (i == 13) return p13;
  if (i == 14) return p14; if (i == 15) return p15;
  if (i == 16) return p16; if (i == 17) return p17;
  if (i == 18) return p18; if (i == 19) return p19;
  if (i == 20) return p20; if (i == 21) return p21;
  if (i == 22) return p22; if (i == 23) return p23;
  if (i == 24) return p24; if (i == 25) return p25;
  if (i == 26) return p26; if (i == 27) return p27;
  if (i == 28) return p28; if (i == 29) return p29;
  if (i == 30) return p30;
  return p31;
}

half4 main(float2 xy) {
  float2 offset = float2(0.0);
  float totalWeight = 0.0;

  for (int i = 0; i < 32; i++) {
    if (i >= numPoints) break;
    float4 pair = getP(i);
    float2 displaced = pair.xy;   // where the point moved to
    float2 original = pair.zw;    // where it was originally

    float d = distance(xy, displaced);
    if (d >= radius) continue;

    // Cosine falloff — matches displacements.ts smoothFalloff
    float t = d / radius;
    float w = 0.5 * (1.0 + cos(3.14159265 * t));
    w = w * w;  // sharpen the falloff for more localized effect

    // The displacement to apply: go back from displaced to original
    offset += (original - displaced) * w;
    totalWeight += w;
  }

  float2 sampleCoord = xy;
  if (totalWeight > 0.001) {
    sampleCoord = xy + offset / totalWeight;
  }

  // Clamp to image bounds
  sampleCoord = clamp(sampleCoord, float2(0.0), resolution - float2(1.0));

  return image.eval(sampleCoord);
}
`;

let _compiledEffect: SkRuntimeEffect | null = null;

/** Get or compile the warp shader runtime effect (cached) */
export function getWarpEffect(): SkRuntimeEffect {
  if (!_compiledEffect) {
    _compiledEffect = Skia.RuntimeEffect.Make(WARP_SHADER_SOURCE);
    if (!_compiledEffect) {
      throw new Error('Failed to compile warp shader');
    }
  }
  return _compiledEffect;
}

/**
 * Compute control point pairs for the warp shader from displacement results.
 * Takes the original and displaced positions, finds the ones that actually moved,
 * and returns them as float4 arrays for the shader uniforms.
 */
export function computeWarpUniforms(
  originalPositions: Point[],
  displacedPositions: Point[],
  influenceRadius: number,
): Record<string, number | number[]> {
  const uniforms: Record<string, number | number[]> = {
    resolution: [0, 0], // set by caller
    numPoints: 0,
    radius: influenceRadius,
  };

  // Initialize all pair uniforms to zero
  for (let i = 0; i < MAX_WARP_POINTS; i++) {
    uniforms[`p${i}`] = [0, 0, 0, 0];
  }

  // Find points that moved and add them as control pairs
  let count = 0;
  for (let i = 0; i < originalPositions.length && count < MAX_WARP_POINTS; i++) {
    const orig = originalPositions[i];
    const disp = displacedPositions[i];
    const dx = disp.x - orig.x;
    const dy = disp.y - orig.y;

    // Only include points that actually moved (threshold: 0.5px)
    if (dx * dx + dy * dy < 0.25) continue;

    // pair: xy = displaced position, zw = original position
    uniforms[`p${count}`] = [disp.x, disp.y, orig.x, orig.y];
    count++;
  }

  uniforms.numPoints = count;
  return uniforms;
}
