import { memo, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { type ReshapeTool, RESHAPE_TOOLS } from '@/store/reshapeStore';

// --- Colors ---

const COLORS = {
  surface: '#1A1A1A',
  accent: '#00D2FF',
  textSecondary: '#AAAAAA',
  border: '#2E2E2E',
};

// --- Props ---

interface ReshapeToolStripProps {
  selectedTool: ReshapeTool;
  values: Record<ReshapeTool, number>;
  onSelectTool: (tool: ReshapeTool) => void;
}

// --- ToolItem ---

interface ToolItemProps {
  tool: ReshapeTool;
  label: string;
  isSelected: boolean;
  isModified: boolean;
  onPress: (tool: ReshapeTool) => void;
}

const ToolItem = memo(function ToolItem({
  tool,
  label,
  isSelected,
  isModified,
  onPress,
}: ToolItemProps) {
  const color = isSelected ? COLORS.accent : COLORS.textSecondary;

  const handlePress = useCallback(() => {
    onPress(tool);
  }, [onPress, tool]);

  return (
    <Pressable
      onPress={handlePress}
      style={styles.toolItem}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: isSelected }}
    >
      <Text
        style={[styles.toolLabel, { color }]}
        numberOfLines={1}
        allowFontScaling={false}
      >
        {label}
      </Text>
      {(isSelected || isModified) && (
        <View style={styles.dot} />
      )}
    </Pressable>
  );
});

// --- ToolStrip ---

export function ReshapeToolStrip({
  selectedTool,
  values,
  onSelectTool,
}: ReshapeToolStripProps) {
  return (
    <View style={styles.container}>
      {RESHAPE_TOOLS.map((tool) => (
        <ToolItem
          key={tool.key}
          tool={tool.key}
          label={tool.label}
          isSelected={selectedTool === tool.key}
          isModified={values[tool.key] !== 0}
          onPress={onSelectTool}
        />
      ))}
    </View>
  );
}

// --- Styles ---

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    height: 64,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  toolItem: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    height: 64,
  },
  toolLabel: {
    fontSize: 12,
    fontWeight: '500',
    includeFontPadding: false,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.accent,
    marginTop: 6,
  },
});
