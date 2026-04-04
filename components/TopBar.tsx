import { useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

// --- Colors ---

const COLORS = {
  text: '#FFFFFF',
  accent: '#00D2FF',
  danger: '#FF6B6B',
  chipActive: '#00D2FF',
  chipInactive: '#2E2E2E',
  chipTextActive: '#000000',
  chipTextInactive: '#AAAAAA',
};

// --- Test images ---

export const TEST_IMAGES = [
  {
    label: 'Front',
    module: require('../assets/images/test-faces/01_front_facing.jpg'),
  },
  {
    label: 'Angled',
    module: require('../assets/images/test-faces/02_angled_face.jpg'),
  },
  {
    label: 'Lines',
    module: require('../assets/images/test-faces/03_near_lines.jpg'),
  },
  {
    label: 'Multi',
    module: require('../assets/images/test-faces/04_multiple_faces.jpg'),
  },
  {
    label: 'Low Light',
    module: require('../assets/images/test-faces/05_low_light.jpg'),
  },
];

// --- Props ---

interface TopBarProps {
  selectedImageIndex: number;
  onSelectTestImage: (index: number) => void;
  onPickGalleryImage: (uri: string, width: number, height: number) => void | Promise<void>;
  onResetAll: () => void;
}

// --- Component ---

export function TopBar({
  selectedImageIndex,
  onSelectTestImage,
  onPickGalleryImage,
  onResetAll,
}: TopBarProps) {
  const pickImage = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      onPickGalleryImage(asset.uri, asset.width ?? 1, asset.height ?? 1);
    }
  }, [onPickGalleryImage]);

  return (
    <View>
      {/* Title bar */}
      <View style={styles.titleBar}>
        <Text style={styles.title}>Face Reshape Lab</Text>
        <View style={styles.actions}>
          <TouchableOpacity onPress={onResetAll} hitSlop={8}>
            <Text style={styles.resetText}>Reset</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={pickImage} hitSlop={8}>
            <Text style={styles.galleryText}>Gallery</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Test image chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipContainer}
        style={styles.chipScroll}
      >
        {TEST_IMAGES.map((img, i) => (
          <TouchableOpacity
            key={i}
            onPress={() => onSelectTestImage(i)}
            style={[
              styles.chip,
              {
                backgroundColor:
                  selectedImageIndex === i
                    ? COLORS.chipActive
                    : COLORS.chipInactive,
              },
            ]}
          >
            <Text
              style={[
                styles.chipText,
                {
                  color:
                    selectedImageIndex === i
                      ? COLORS.chipTextActive
                      : COLORS.chipTextInactive,
                },
              ]}
            >
              {img.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

// --- Styles ---

const styles = StyleSheet.create({
  titleBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 44,
  },
  title: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: 16,
  },
  resetText: {
    color: COLORS.danger,
    fontSize: 14,
  },
  galleryText: {
    color: COLORS.accent,
    fontSize: 14,
  },
  chipScroll: {
    maxHeight: 36,
  },
  chipContainer: {
    paddingHorizontal: 16,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '500',
  },
});
