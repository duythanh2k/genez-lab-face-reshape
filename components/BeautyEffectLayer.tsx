import React, { useMemo } from 'react';
import {
  BackdropBlur,
  BackdropFilter,
  ColorMatrix,
} from '@shopify/react-native-skia';
import {
  buildSkinMask,
  buildUnderEyeMask,
  buildTeethMask,
  buildEyeMask,
} from '@/lib/beautyMasks';
import type { FaceContours } from '@/lib/types';
import type { FaceValues } from '@/store/reshapeStore';

interface BeautyEffectLayerProps {
  contours: FaceContours;
  values: FaceValues;
  scale: number;
  offsetX: number;
  offsetY: number;
}

/**
 * Identity color matrix (20 elements: 4x5 row-major).
 * [ R, G, B, A, bias ] for each of R, G, B, A channels.
 */
function identityMatrix(): number[] {
  return [
    1, 0, 0, 0, 0, // R
    0, 1, 0, 0, 0, // G
    0, 0, 1, 0, 0, // B
    0, 0, 0, 1, 0, // A
  ];
}

export function BeautyEffectLayer({
  contours,
  values,
  scale,
  offsetX,
  offsetY,
}: BeautyEffectLayerProps) {
  const skinSmoothVal = values.skinSmooth;
  const skinToneVal = values.skinTone;
  const darkCirclesVal = values.darkCircles;
  const teethWhitenVal = values.teethWhiten;
  const eyeRetouchVal = values.eyeRetouch;

  // Memoize masks — only recompute when contours or transform changes
  const skinMask = useMemo(
    () => buildSkinMask(contours, scale, offsetX, offsetY),
    [contours, scale, offsetX, offsetY],
  );

  const underEyeMask = useMemo(
    () => buildUnderEyeMask(contours, scale, offsetX, offsetY),
    [contours, scale, offsetX, offsetY],
  );

  const teethMask = useMemo(
    () => buildTeethMask(contours, scale, offsetX, offsetY),
    [contours, scale, offsetX, offsetY],
  );

  const eyeMask = useMemo(
    () => buildEyeMask(contours, scale, offsetX, offsetY),
    [contours, scale, offsetX, offsetY],
  );

  // Skin tone color matrix: warm (positive) or cool (negative)
  const toneMatrix = useMemo(() => {
    if (skinToneVal === 0) return null;
    const m = identityMatrix();
    const intensity = (skinToneVal / 100) * 0.1;
    // Bias: index 4 = R bias, index 9 = G bias, index 14 = B bias
    m[4] += intensity; // red bias
    m[14] -= intensity; // blue bias (inverse for warm/cool)
    return m;
  }, [skinToneVal]);

  // Dark circles: brighten under-eye area
  const brightenMatrix = useMemo(() => {
    if (darkCirclesVal === 0) return null;
    const m = identityMatrix();
    const intensity = (darkCirclesVal / 100) * 0.15;
    m[4] += intensity; // R bias
    m[9] += intensity; // G bias
    m[14] += intensity; // B bias
    return m;
  }, [darkCirclesVal]);

  // Teeth whitening: brighten + slight desaturation
  const whitenMatrix = useMemo(() => {
    if (teethWhitenVal === 0) return null;
    const m = identityMatrix();
    const bright = (teethWhitenVal / 100) * 0.12;
    const desat = (teethWhitenVal / 100) * 0.15;
    // Desaturation: blend toward luminance (0.2126, 0.7152, 0.0722)
    // Partial desaturation by mixing identity with grayscale
    m[0] = 1 - desat + desat * 0.2126;
    m[1] = desat * 0.7152;
    m[2] = desat * 0.0722;
    m[5] = desat * 0.2126;
    m[6] = 1 - desat + desat * 0.7152;
    m[7] = desat * 0.0722;
    m[10] = desat * 0.2126;
    m[11] = desat * 0.7152;
    m[12] = 1 - desat + desat * 0.0722;
    // Brightness bias
    m[4] += bright;
    m[9] += bright;
    m[14] += bright;
    return m;
  }, [teethWhitenVal]);

  // Eye retouch: brightness + contrast boost
  const eyeMatrix = useMemo(() => {
    if (eyeRetouchVal === 0) return null;
    const m = identityMatrix();
    const bright = (eyeRetouchVal / 100) * 0.08;
    const contrast = 1 + (eyeRetouchVal / 100) * 0.15;
    const contrastBias = (1 - contrast) * 0.5;
    // Apply contrast scaling to RGB channels
    m[0] = contrast;
    m[6] = contrast;
    m[12] = contrast;
    // Bias = contrast bias + brightness
    m[4] = contrastBias + bright;
    m[9] = contrastBias + bright;
    m[14] = contrastBias + bright;
    return m;
  }, [eyeRetouchVal]);

  return (
    <>
      {skinSmoothVal !== 0 && skinMask && (
        <BackdropBlur
          blur={Math.abs(skinSmoothVal) * 0.15}
          clip={skinMask}
        />
      )}

      {skinToneVal !== 0 && skinMask && toneMatrix && (
        <BackdropFilter
          clip={skinMask}
          filter={<ColorMatrix matrix={toneMatrix} />}
        />
      )}

      {darkCirclesVal !== 0 && underEyeMask && brightenMatrix && (
        <BackdropFilter
          clip={underEyeMask}
          filter={<ColorMatrix matrix={brightenMatrix} />}
        />
      )}

      {teethWhitenVal !== 0 && teethMask && whitenMatrix && (
        <BackdropFilter
          clip={teethMask}
          filter={<ColorMatrix matrix={whitenMatrix} />}
        />
      )}

      {eyeRetouchVal !== 0 && eyeMask && eyeMatrix && (
        <BackdropFilter
          clip={eyeMask}
          filter={<ColorMatrix matrix={eyeMatrix} />}
        />
      )}
    </>
  );
}
