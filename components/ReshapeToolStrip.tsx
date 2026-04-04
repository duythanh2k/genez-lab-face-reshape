import { memo, useCallback, useRef, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, FlatList } from 'react-native';
import { type ReshapeTool, RESHAPE_TOOLS } from '@/store/reshapeStore';

// --- Colors ---

const COLORS = {
  surface: '#1A1A1A',
  accent: '#00D2FF',
  textSecondary: '#AAAAAA',
  textMuted: '#666666',
  border: '#2E2E2E',
};

const ITEM_WIDTH = 72;

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
        <View
          style={[
            styles.dot,
            {
              backgroundColor: isModified ? COLORS.accent : COLORS.textMuted,
            },
          ]}
        />
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
  const listRef = useRef<FlatList>(null);

  // Auto-scroll to selected tool
  useEffect(() => {
    const index = RESHAPE_TOOLS.findIndex((t) => t.key === selectedTool);
    if (index >= 0) {
      listRef.current?.scrollToIndex({
        index,
        animated: true,
        viewPosition: 0.5,
      });
    }
  }, [selectedTool]);

  const renderItem = useCallback(
    ({ item }: { item: (typeof RESHAPE_TOOLS)[number] }) => (
      <ToolItem
        tool={item.key}
        label={item.label}
        isSelected={selectedTool === item.key}
        isModified={values[item.key] !== 0}
        onPress={onSelectTool}
      />
    ),
    [selectedTool, values, onSelectTool],
  );

  return (
    <View style={styles.container}>
      <FlatList
        ref={listRef}
        data={RESHAPE_TOOLS}
        renderItem={renderItem}
        keyExtractor={(item) => item.key}
        horizontal
        showsHorizontalScrollIndicator={false}
        getItemLayout={(_, index) => ({
          length: ITEM_WIDTH,
          offset: ITEM_WIDTH * index,
          index,
        })}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

// --- Styles ---

const styles = StyleSheet.create({
  container: {
    height: 64,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  listContent: {
    paddingHorizontal: 8,
  },
  toolItem: {
    width: ITEM_WIDTH,
    height: 64,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  toolLabel: {
    fontSize: 11,
    fontWeight: '500',
    includeFontPadding: false,
    textAlign: 'center',
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 5,
  },
});
