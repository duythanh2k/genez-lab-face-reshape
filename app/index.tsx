import { useCallback, useEffect, useMemo } from 'react';
import { View, Text, ActivityIndicator, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFacesInPhoto } from '@infinitered/react-native-mlkit-face-detection';
import { Asset } from 'expo-asset';
import { useSharedValue } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useState } from 'react';
import { extractFaceContours } from '@/lib/faceDetection';
import { buildMesh } from '@/lib/meshDeformation';
import { SkiaDeformCanvas } from '@/components/SkiaDeformCanvas';
import { ReshapeSlider } from '@/components/ReshapeSlider';
import { ReshapeToolStrip } from '@/components/ReshapeToolStrip';
import { TopBar, TEST_IMAGES } from '@/components/TopBar';
import { useReshapeStore, RESHAPE_TOOLS } from '@/store/reshapeStore';

export default function ReshapeScreen() {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  // Store
  const selectedTool = useReshapeStore((s) => s.selectedTool);
  const values = useReshapeStore((s) => s.values);
  const imageUri = useReshapeStore((s) => s.imageUri);
  const imageWidth = useReshapeStore((s) => s.imageWidth);
  const imageHeight = useReshapeStore((s) => s.imageHeight);
  const faceContours = useReshapeStore((s) => s.faceContours);
  const mesh = useReshapeStore((s) => s.mesh);
  const setSelectedTool = useReshapeStore((s) => s.setSelectedTool);
  const setValue = useReshapeStore((s) => s.setValue);
  const resetTool = useReshapeStore((s) => s.resetTool);
  const resetAll = useReshapeStore((s) => s.resetAll);
  const setImage = useReshapeStore((s) => s.setImage);
  const setFaceContours = useReshapeStore((s) => s.setFaceContours);
  const setMesh = useReshapeStore((s) => s.setMesh);

  // Shared values for 60fps Skia updates
  const faceSlimSV = useSharedValue(0);
  const eyeEnlargeSV = useSharedValue(0);
  const noseSlimSV = useSharedValue(0);
  const showOriginal = useSharedValue(false);

  // Get the SharedValue for the selected tool
  const activeSharedValue = useMemo(() => {
    switch (selectedTool) {
      case 'faceSlim':
        return faceSlimSV;
      case 'eyeEnlarge':
        return eyeEnlargeSV;
      case 'noseSlim':
        return noseSlimSV;
    }
  }, [selectedTool, faceSlimSV, eyeEnlargeSV, noseSlimSV]);

  // Resolve bundled asset to local file URI
  useEffect(() => {
    if (selectedImageIndex < 0) return;
    (async () => {
      const asset = Asset.fromModule(TEST_IMAGES[selectedImageIndex].module);
      await asset.downloadAsync();
      if (asset.localUri) {
        setImage(asset.localUri, asset.width ?? 1, asset.height ?? 1);
        // Reset shared values
        faceSlimSV.value = 0;
        eyeEnlargeSV.value = 0;
        noseSlimSV.value = 0;
      }
    })();
  }, [selectedImageIndex, setImage, faceSlimSV, eyeEnlargeSV, noseSlimSV]);

  // Run face detection
  const { faces, status } = useFacesInPhoto(imageUri ?? undefined);

  // Extract contours and build mesh when faces change
  useEffect(() => {
    if (!faces || faces.length === 0) {
      setFaceContours(null);
      setMesh(null);
      return;
    }
    const contours = extractFaceContours(faces);
    setFaceContours(contours);
    if (contours) {
      setMesh(buildMesh(contours, imageWidth, imageHeight));
    } else {
      setMesh(null);
    }
  }, [faces, imageWidth, imageHeight, setFaceContours, setMesh]);

  // Canvas height calculation
  const canvasHeight = screenHeight - 44 - 36 - 24 - 56 - 64 - 40;

  // Handle tool select
  const handleSelectTool = useCallback(
    (tool: (typeof RESHAPE_TOOLS)[number]['key']) => {
      setSelectedTool(tool);
    },
    [setSelectedTool],
  );

  // Handle slider value change (from throttled runOnJS)
  const handleValueChange = useCallback(
    (value: number) => {
      setValue(selectedTool, value);
    },
    [selectedTool, setValue],
  );

  // Handle reset current tool
  const handleReset = useCallback(() => {
    resetTool(selectedTool);
    activeSharedValue.value = 0;
  }, [selectedTool, resetTool, activeSharedValue]);

  // Handle reset all
  const handleResetAll = useCallback(() => {
    resetAll();
    faceSlimSV.value = 0;
    eyeEnlargeSV.value = 0;
    noseSlimSV.value = 0;
  }, [resetAll, faceSlimSV, eyeEnlargeSV, noseSlimSV]);

  // Handle test image select
  const handleSelectTestImage = useCallback(
    (index: number) => {
      setSelectedImageIndex(index);
      handleResetAll();
    },
    [handleResetAll],
  );

  // Handle gallery image pick
  const handlePickGallery = useCallback(
    (uri: string, width: number, height: number) => {
      setSelectedImageIndex(-1);
      setImage(uri, width, height);
      faceSlimSV.value = 0;
      eyeEnlargeSV.value = 0;
      noseSlimSV.value = 0;
    },
    [setImage, faceSlimSV, eyeEnlargeSV, noseSlimSV],
  );

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
  const currentToolLabel =
    RESHAPE_TOOLS.find((t) => t.key === selectedTool)?.label ?? '';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0D0D0D' }}>
      {/* Top bar + image chips */}
      <TopBar
        selectedImageIndex={selectedImageIndex}
        onSelectTestImage={handleSelectTestImage}
        onPickGalleryImage={handlePickGallery}
        onResetAll={handleResetAll}
      />

      {/* Status */}
      <View style={{ paddingHorizontal: 16, height: 24, justifyContent: 'center' }}>
        <Text style={{ color: '#666666', fontSize: 11 }}>
          {isDetecting
            ? 'Detecting face...'
            : faceContours
              ? `Mesh: ${mesh?.positions.length ?? 0} vertices, ${((mesh?.indices.length ?? 0) / 3) | 0} triangles | Long press for before/after`
              : status === 'done'
                ? 'No face found — try another photo'
                : 'Loading...'}
        </Text>
      </View>

      {/* Canvas */}
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
          {imageUri && mesh && faceContours && (
            <SkiaDeformCanvas
              imageUri={imageUri}
              mesh={mesh}
              canvasWidth={screenWidth}
              canvasHeight={canvasHeight}
              imageWidth={imageWidth}
              imageHeight={imageHeight}
              faceOval={faceContours.faceOval}
              faceSlim={faceSlimSV}
              eyeEnlarge={eyeEnlargeSV}
              noseSlim={noseSlimSV}
              showOriginal={showOriginal}
            />
          )}
        </View>
      </GestureDetector>

      {/* Slider */}
      <ReshapeSlider
        toolName={currentToolLabel}
        value={values[selectedTool]}
        sharedValue={activeSharedValue}
        onValueChange={handleValueChange}
        onReset={handleReset}
      />

      {/* Tool strip */}
      <ReshapeToolStrip
        selectedTool={selectedTool}
        values={values}
        onSelectTool={handleSelectTool}
      />
    </SafeAreaView>
  );
}
