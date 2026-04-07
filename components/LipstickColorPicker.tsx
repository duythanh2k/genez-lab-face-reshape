import { ScrollView, Pressable, StyleSheet } from 'react-native';
import { LIPSTICK_COLORS } from '@/store/reshapeStore';

interface LipstickColorPickerProps {
  selectedIndex: number;
  onSelect: (index: number) => void;
}

/**
 * Horizontal scroll row of 12 circular color swatches.
 * Only rendered when the lipstick tool is selected.
 */
export function LipstickColorPicker({
  selectedIndex,
  onSelect,
}: LipstickColorPickerProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      style={styles.container}
    >
      {LIPSTICK_COLORS.map((c, i) => (
        <Pressable
          key={i}
          onPress={() => onSelect(i)}
          style={[
            styles.swatch,
            { backgroundColor: c.hex },
            selectedIndex === i && styles.swatchSelected,
          ]}
          accessibilityRole="button"
          accessibilityLabel={c.name}
          accessibilityState={{ selected: selectedIndex === i }}
          hitSlop={6}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 56,
    backgroundColor: '#1A1A1A',
  },
  row: {
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 12,
    height: 56,
  },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2E2E2E',
  },
  swatchSelected: {
    borderWidth: 2,
    borderColor: '#00D2FF',
  },
});
