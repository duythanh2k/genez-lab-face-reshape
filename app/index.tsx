import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFacesInPhoto } from '@infinitered/react-native-mlkit-face-detection';
import { Asset } from 'expo-asset';
import * as ImagePicker from 'expo-image-picker';
import { useSharedValue } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { extractFaceContours } from '@/lib/faceDetection';
import { buildMesh, type DeformationMesh } from '@/lib/meshDeformation';
import { SkiaDeformCanvas } from '@/components/SkiaDeformCanvas';
import type { FaceContours } from '@/lib/types';

// Bundled test images
const TEST_IMAGES = [
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

type ReshapeTool = 'faceSlim' | 'eyeEnlarge' | 'noseSlim';

const TOOLS: { key: ReshapeTool; label: string }[] = [
  { key: 'faceSlim', label: 'Face Slim' },
  { key: 'eyeEnlarge', label: 'Eye Enlarge' },
  { key: 'noseSlim', label: 'Nose Slim' },
];

export default function ReshapeScreen() {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [imageUri, setImageUri] = useState<string | undefined>(undefined);
  const [imageSize, setImageSize] = useState({ width: 1, height: 1 });
  const [selectedTool, setSelectedTool] = useState<ReshapeTool>('faceSlim');
  const [sliderValues, setSliderValues] = useState({
    faceSlim: 0,
    eyeEnlarge: 0,
    noseSlim: 0,
  });

  // Shared values for 60fps Skia updates
  const faceSlimSV = useSharedValue(0);
  const eyeEnlargeSV = useSharedValue(0);
  const noseSlimSV = useSharedValue(0);
  const showOriginal = useSharedValue(false);

  // Resolve bundled asset to local file URI
  useEffect(() => {
    if (selectedImageIndex < 0) return;
    (async () => {
      const asset = Asset.fromModule(TEST_IMAGES[selectedImageIndex].module);
      await asset.downloadAsync();
      if (asset.localUri) {
        setImageUri(asset.localUri);
        setImageSize({
          width: asset.width ?? 1,
          height: asset.height ?? 1,
        });
      }
    })();
  }, [selectedImageIndex]);

  // Run face detection
  const { faces, status } = useFacesInPhoto(imageUri);

  // Extract contours
  const contours: FaceContours | null = useMemo(() => {
    if (!faces || faces.length === 0) return null;
    return extractFaceContours(faces);
  }, [faces]);

  // Build deformation mesh when contours change
  const mesh: DeformationMesh | null = useMemo(() => {
    if (!contours) return null;
    return buildMesh(contours, imageSize.width, imageSize.height);
  }, [contours, imageSize.width, imageSize.height]);

  // Canvas dimensions
  const topBarHeight = 44;
  const chipBarHeight = 36;
  const statusHeight = 24;
  const sliderHeight = 72;
  const toolStripHeight = 56;
  const bottomPadding = 34; // safe area
  const canvasHeight =
    screenHeight -
    topBarHeight -
    chipBarHeight -
    statusHeight -
    sliderHeight -
    toolStripHeight -
    bottomPadding -
    50; // extra margin

  // Pick from gallery
  const pickImage = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setSelectedImageIndex(-1);
      setImageUri(asset.uri);
      setImageSize({
        width: asset.width ?? 1,
        height: asset.height ?? 1,
      });
      // Reset sliders
      setSliderValues({ faceSlim: 0, eyeEnlarge: 0, noseSlim: 0 });
      faceSlimSV.value = 0;
      eyeEnlargeSV.value = 0;
      noseSlimSV.value = 0;
    }
  }, [faceSlimSV, eyeEnlargeSV, noseSlimSV]);

  // Reset all sliders
  const resetAll = useCallback(() => {
    setSliderValues({ faceSlim: 0, eyeEnlarge: 0, noseSlim: 0 });
    faceSlimSV.value = 0;
    eyeEnlargeSV.value = 0;
    noseSlimSV.value = 0;
  }, [faceSlimSV, eyeEnlargeSV, noseSlimSV]);

  // Get the SharedValue for the selected tool
  const getActiveSV = () => {
    switch (selectedTool) {
      case 'faceSlim':
        return faceSlimSV;
      case 'eyeEnlarge':
        return eyeEnlargeSV;
      case 'noseSlim':
        return noseSlimSV;
    }
  };

  // Simple pan gesture for slider
  const sliderWidth = screenWidth - 32;
  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      'worklet';
      // Map x position to -100..100
      const normalized = Math.max(
        -100,
        Math.min(100, (e.x / sliderWidth) * 200 - 100),
      );
      const sv = (() => {
        'worklet';
        switch (selectedTool) {
          case 'faceSlim':
            return faceSlimSV;
          case 'eyeEnlarge':
            return eyeEnlargeSV;
          case 'noseSlim':
            return noseSlimSV;
        }
      })();
      sv.value = Math.round(normalized);
    })
    .onEnd(() => {
      'worklet';
      // Sync to JS for display
    });

  // Long press for before/after
  const longPress = Gesture.LongPress()
    .minDuration(200)
    .onStart(() => {
      'worklet';
      showOriginal.value = true;
    })
    .onEnd(() => {
      'worklet';
      showOriginal.value = false;
    });

  const isDetecting = status === 'detecting' || status === 'modelLoading';
  const currentValue = sliderValues[selectedTool];

  // Sync shared values back to display state periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setSliderValues({
        faceSlim: Math.round(faceSlimSV.value),
        eyeEnlarge: Math.round(eyeEnlargeSV.value),
        noseSlim: Math.round(noseSlimSV.value),
      });
    }, 100);
    return () => clearInterval(interval);
  }, [faceSlimSV, eyeEnlargeSV, noseSlimSV]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0D0D0D' }}>
      {/* Top bar */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: 16,
          height: topBarHeight,
        }}
      >
        <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }}>
          Face Reshape Lab
        </Text>
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <TouchableOpacity onPress={resetAll}>
            <Text style={{ color: '#FF6B6B', fontSize: 14 }}>Reset</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={pickImage}>
            <Text style={{ color: '#00D2FF', fontSize: 14 }}>Gallery</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Test image selector chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
        style={{ maxHeight: chipBarHeight }}
      >
        {TEST_IMAGES.map((img, i) => (
          <TouchableOpacity
            key={i}
            onPress={() => {
              setSelectedImageIndex(i);
              resetAll();
            }}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 12,
              backgroundColor:
                selectedImageIndex === i ? '#00D2FF' : '#2E2E2E',
            }}
          >
            <Text
              style={{
                color: selectedImageIndex === i ? '#000000' : '#AAAAAA',
                fontSize: 12,
                fontWeight: '500',
              }}
            >
              {img.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Status */}
      <View
        style={{ paddingHorizontal: 16, height: statusHeight, justifyContent: 'center' }}
      >
        <Text style={{ color: '#666666', fontSize: 11 }}>
          {isDetecting
            ? 'Detecting face...'
            : contours
              ? `Mesh: ${mesh?.positions.length ?? 0} vertices, ${(mesh?.indices.length ?? 0) / 3} triangles`
              : status === 'done'
                ? 'No face found — try another photo'
                : 'Loading...'}
        </Text>
      </View>

      {/* Canvas with deformation */}
      <GestureDetector gesture={longPress}>
        <View style={{ flex: 1, backgroundColor: '#0D0D0D' }}>
          {isDetecting && (
            <View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                justifyContent: 'center',
                alignItems: 'center',
                zIndex: 10,
              }}
            >
              <ActivityIndicator size="large" color="#00D2FF" />
            </View>
          )}
          {imageUri && mesh && contours && (
            <SkiaDeformCanvas
              imageUri={imageUri}
              mesh={mesh}
              canvasWidth={screenWidth}
              canvasHeight={canvasHeight}
              imageWidth={imageSize.width}
              imageHeight={imageSize.height}
              faceOval={contours.faceOval}
              faceSlim={faceSlimSV}
              eyeEnlarge={eyeEnlargeSV}
              noseSlim={noseSlimSV}
              showOriginal={showOriginal}
            />
          )}
        </View>
      </GestureDetector>

      {/* Slider */}
      <View
        style={{
          height: sliderHeight,
          paddingHorizontal: 16,
          justifyContent: 'center',
          backgroundColor: '#1A1A1A',
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            marginBottom: 8,
          }}
        >
          <Text style={{ color: '#AAAAAA', fontSize: 12 }}>
            {TOOLS.find((t) => t.key === selectedTool)?.label}
          </Text>
          <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '600' }}>
            {currentValue}
          </Text>
        </View>
        <GestureDetector gesture={panGesture}>
          <View
            style={{
              height: 24,
              backgroundColor: '#2E2E2E',
              borderRadius: 12,
              justifyContent: 'center',
            }}
          >
            {/* Zero marker */}
            <View
              style={{
                position: 'absolute',
                left: '50%',
                width: 1,
                height: 12,
                backgroundColor: '#666666',
              }}
            />
            {/* Thumb indicator */}
            <View
              style={{
                position: 'absolute',
                left: `${((currentValue + 100) / 200) * 100}%`,
                width: 18,
                height: 18,
                borderRadius: 9,
                backgroundColor: '#FFFFFF',
                marginLeft: -9,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.3,
                shadowRadius: 3,
              }}
            />
          </View>
        </GestureDetector>
      </View>

      {/* Tool strip */}
      <View
        style={{
          flexDirection: 'row',
          height: toolStripHeight,
          backgroundColor: '#1A1A1A',
          borderTopWidth: 1,
          borderTopColor: '#2E2E2E',
        }}
      >
        {TOOLS.map((tool) => (
          <TouchableOpacity
            key={tool.key}
            onPress={() => setSelectedTool(tool.key)}
            style={{
              flex: 1,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Text
              style={{
                color: selectedTool === tool.key ? '#00D2FF' : '#888888',
                fontSize: 12,
                fontWeight: selectedTool === tool.key ? '600' : '400',
              }}
            >
              {tool.label}
            </Text>
            {selectedTool === tool.key && (
              <View
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: '#00D2FF',
                  marginTop: 4,
                }}
              />
            )}
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}
