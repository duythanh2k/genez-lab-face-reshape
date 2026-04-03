import { useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View, Pressable, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  type SharedValue,
} from 'react-native-reanimated';

// --- Constants (match Genez AdjustmentSlider) ---

const HORIZONTAL_PADDING = 16;
const TRACK_HEIGHT = 3;
const THUMB_WIDTH = 6;
const THUMB_HEIGHT = 18;
const THUMB_RADIUS = 3;
const ZERO_MARKER_WIDTH = 1;
const ZERO_MARKER_HEIGHT = 8;
const RESET_BUTTON_SIZE = 20;
const LABEL_THROTTLE_MS = 100;

// --- Colors (dark theme) ---

const COLORS = {
  surface: '#1A1A1A',
  accent: '#00D2FF',
  textSecondary: '#AAAAAA',
  textMuted: '#666666',
  divider: '#333333',
};

// --- Props ---

interface ReshapeSliderProps {
  toolName: string;
  value: number;
  /** SharedValue for 60fps UI-thread updates to Skia */
  sharedValue: SharedValue<number>;
  onValueChange: (value: number) => void;
  onReset: () => void;
}

// --- Component ---

export function ReshapeSlider({
  toolName,
  value,
  sharedValue,
  onValueChange,
  onReset,
}: ReshapeSliderProps) {
  const { width: screenWidth } = useWindowDimensions();
  const trackWidth = screenWidth - HORIZONTAL_PADDING * 2;
  const isModified = value !== 0;

  const min = -100;
  const max = 100;

  // Stable callback ref
  const onValueChangeRef = useRef(onValueChange);
  onValueChangeRef.current = onValueChange;

  const handleValueChange = useCallback((v: number) => {
    onValueChangeRef.current(Math.round(v));
  }, []);

  // Conversion
  const valueToPosition = useCallback(
    (v: number): number => ((v - min) / (max - min)) * trackWidth,
    [trackWidth],
  );

  // Shared values for UI-thread gesture
  const thumbX = useSharedValue(valueToPosition(value));
  const startX = useSharedValue(0);
  const lastUpdateTime = useSharedValue(0);

  // Reset button opacity
  const resetOpacity = useSharedValue(isModified ? 1 : 0);
  useEffect(() => {
    resetOpacity.value = withTiming(isModified ? 1 : 0, { duration: 150 });
  }, [isModified, resetOpacity]);

  // Sync thumbX when value changes from outside (reset)
  useEffect(() => {
    thumbX.value = valueToPosition(value);
  }, [value, valueToPosition, thumbX]);

  const trackWidthShared = useSharedValue(trackWidth);
  useEffect(() => {
    trackWidthShared.value = trackWidth;
  }, [trackWidth, trackWidthShared]);

  // Zero position for bipolar fill
  const zeroX = useMemo(() => valueToPosition(0), [valueToPosition]);

  // --- Gestures ---

  const panGesture = Gesture.Pan()
    .onStart(() => {
      'worklet';
      startX.value = thumbX.value;
    })
    .onUpdate((event) => {
      'worklet';
      const tw = trackWidthShared.value;
      const newX = Math.min(Math.max(startX.value + event.translationX, 0), tw);
      thumbX.value = newX;

      const v = Math.round(min + (newX / tw) * (max - min));

      // Pro mode: update shared value directly on UI thread
      sharedValue.value = v;

      // Throttled runOnJS for display label
      const now = Date.now();
      if (now - lastUpdateTime.value >= LABEL_THROTTLE_MS) {
        lastUpdateTime.value = now;
        runOnJS(handleValueChange)(v);
      }
    })
    .onEnd(() => {
      'worklet';
      const tw = trackWidthShared.value;
      const v = Math.round(min + (thumbX.value / tw) * (max - min));
      sharedValue.value = v;
      runOnJS(handleValueChange)(v);
    });

  const tapGesture = Gesture.Tap().onEnd((event) => {
    'worklet';
    const tw = trackWidthShared.value;
    const newX = Math.min(Math.max(event.x - HORIZONTAL_PADDING, 0), tw);
    thumbX.value = newX;
    const v = Math.round(min + (newX / tw) * (max - min));
    sharedValue.value = v;
    runOnJS(handleValueChange)(v);
  });

  const composedGesture = Gesture.Race(tapGesture, panGesture);

  // --- Animated styles ---

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: thumbX.value - THUMB_WIDTH / 2 }],
  }));

  const fillStyle = useAnimatedStyle(() => {
    const current = thumbX.value;
    if (current >= zeroX) {
      return { left: zeroX, width: current - zeroX };
    }
    return { left: current, width: zeroX - current };
  });

  const resetButtonStyle = useAnimatedStyle(() => ({
    opacity: resetOpacity.value,
  }));

  // --- Render ---

  return (
    <View style={styles.container}>
      {/* Header: tool name | value | reset */}
      <View style={styles.headerRow}>
        <Text style={styles.toolName} numberOfLines={1}>
          {toolName}
        </Text>
        <Text style={styles.valueText} numberOfLines={1}>
          {value === 0 ? '0' : value > 0 ? `+${value}` : `${value}`}
        </Text>
        <Animated.View style={resetButtonStyle}>
          <Pressable
            onPress={onReset}
            style={styles.resetButton}
            disabled={!isModified}
            hitSlop={8}
          >
            <Text style={styles.resetIcon} allowFontScaling={false}>
              {'\u21BA'}
            </Text>
          </Pressable>
        </Animated.View>
      </View>

      {/* Track with gesture */}
      <GestureDetector gesture={composedGesture}>
        <Animated.View style={styles.hitArea}>
          <View style={styles.trackContainer}>
            {/* Track background */}
            <View style={styles.track}>
              {/* Active fill */}
              <Animated.View style={[styles.fill, fillStyle]} />
            </View>

            {/* Zero marker */}
            <View
              style={[
                styles.zeroMarker,
                { left: HORIZONTAL_PADDING + zeroX - ZERO_MARKER_WIDTH / 2 },
              ]}
            />

            {/* Thumb */}
            <Animated.View style={[styles.thumb, thumbStyle]} />
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

// --- Styles ---

const styles = StyleSheet.create({
  container: {
    height: 56,
    paddingTop: 2,
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: HORIZONTAL_PADDING,
    height: 24,
  },
  toolName: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
    includeFontPadding: false,
  },
  valueText: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    color: COLORS.accent,
    includeFontPadding: false,
    minWidth: 40,
  },
  resetButton: {
    flex: 1,
    alignItems: 'flex-end',
  },
  resetIcon: {
    fontSize: 14,
    lineHeight: RESET_BUTTON_SIZE,
    width: RESET_BUTTON_SIZE,
    height: RESET_BUTTON_SIZE,
    textAlign: 'center',
    color: COLORS.textMuted,
  },
  hitArea: {
    height: THUMB_HEIGHT + 8,
    width: '100%',
    justifyContent: 'center',
  },
  trackContainer: {
    height: THUMB_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: HORIZONTAL_PADDING,
  },
  track: {
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    backgroundColor: COLORS.divider,
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    top: 0,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    backgroundColor: COLORS.accent,
  },
  zeroMarker: {
    position: 'absolute',
    width: ZERO_MARKER_WIDTH,
    height: ZERO_MARKER_HEIGHT,
    top: (THUMB_HEIGHT - ZERO_MARKER_HEIGHT) / 2,
    backgroundColor: COLORS.textMuted,
  },
  thumb: {
    position: 'absolute',
    left: HORIZONTAL_PADDING,
    width: THUMB_WIDTH,
    height: THUMB_HEIGHT,
    borderRadius: THUMB_RADIUS,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
});
