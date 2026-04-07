import { useMemo } from 'react';
import { Group, Fill } from '@shopify/react-native-skia';
import { buildLipMask } from '@/lib/beautyMasks';
import { LIPSTICK_COLORS } from '@/store/reshapeStore';
import type { FaceContours } from '@/lib/types';

interface LipstickLayerProps {
  contours: FaceContours;
  colorIndex: number;
  intensity: number; // 0-100
  scale: number;
  offsetX: number;
  offsetY: number;
}

/**
 * Renders a single face's lipstick layer.
 * Masked colored overlay with multiply blend — natural lip texture
 * shows through the color for realistic lipstick.
 */
export function LipstickLayer({
  contours,
  colorIndex,
  intensity,
  scale,
  offsetX,
  offsetY,
}: LipstickLayerProps) {
  const lipMask = useMemo(
    () => buildLipMask(contours, scale, offsetX, offsetY),
    [contours, scale, offsetX, offsetY],
  );

  if (intensity === 0 || !lipMask) return null;

  const color = LIPSTICK_COLORS[colorIndex]?.hex ?? LIPSTICK_COLORS[0].hex;

  return (
    <Group clip={lipMask} blendMode="multiply" opacity={intensity / 100}>
      <Fill color={color} />
    </Group>
  );
}
