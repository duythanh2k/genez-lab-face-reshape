import { useCallback, useEffect, useMemo } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFacesInPhoto } from '@infinitered/react-native-mlkit-face-detection';
import { Asset } from 'expo-asset';
import * as ImageManipulator from 'expo-image-manipulator';
import { useSharedValue } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useState } from 'react';
import { extractFaceContours } from '@/lib/faceDetection';
import { buildMesh } from '@/lib/meshDeformation';
import { SkiaDeformCanvas } from '@/components/SkiaDeformCanvas';
import { SkiaWarpCanvas } from '@/components/SkiaWarpCanvas';
import { ReshapeSlider } from '@/components/ReshapeSlider';
import { ReshapeToolStrip } from '@/components/ReshapeToolStrip';
import { TopBar, TEST_IMAGES } from '@/components/TopBar';
import { useReshapeStore, RESHAPE_TOOLS } from '@/store/reshapeStore';

export default function ReshapeScreen() {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [useWarpShader, setUseWarpShader] = useState(false);

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

  // Shared values for 60fps Skia updates — one per tool
  const svMap = {
    faceSlim: useSharedValue(0),
    jawline: useSharedValue(0),
    chin: useSharedValue(0),
    forehead: useSharedValue(0),
    eyeEnlarge: useSharedValue(0),
    eyeDistance: useSharedValue(0),
    noseSlim: useSharedValue(0),
    noseLength: useSharedValue(0),
    lipFullness: useSharedValue(0),
    smile: useSharedValue(0),
  };
  const showOriginal = useSharedValue(false);

  const activeSharedValue = svMap[selectedTool];

  // Resolve bundled asset to local JPEG URI
  useEffect(() => {
    if (selectedImageIndex < 0) return;
    (async () => {
      const asset = Asset.fromModule(TEST_IMAGES[selectedImageIndex].module);
      await asset.downloadAsync();
      if (asset.localUri) {
        setImage(asset.localUri, asset.width ?? 1, asset.height ?? 1);
        // Reset shared values
        for (const key of Object.keys(svMap)) svMap[key as keyof typeof svMap].value = 0;
      }
    })();
  }, [selectedImageIndex, setImage]);

  // Run face detection
  const { faces, status, error } = useFacesInPhoto(imageUri ?? undefined);

  // Debug logging
  useEffect(() => {
    console.log('[Debug] imageUri:', imageUri);
    console.log('[Debug] imageSize:', imageWidth, 'x', imageHeight);
  }, [imageUri, imageWidth, imageHeight]);

  useEffect(() => {
    console.log('[FaceDetection] status:', status, 'faces:', faces?.length ?? 0, 'error:', error);
    if (faces && faces.length > 0) {
      const f = faces[0];
      console.log('[FaceDetection] face frame:', JSON.stringify(f.frame));
      console.log('[FaceDetection] contours count:', f.contours?.length ?? 0);
      if (f.contours && f.contours.length > 0) {
        for (const c of f.contours) {
          console.log(`[FaceDetection] contour: ${c.type}, points: ${c.points?.length ?? 0}`);
        }
      }
    }
  }, [faces, status, error]);

  // Extract contours and build mesh when faces change
  useEffect(() => {
    if (!faces || faces.length === 0) {
      setFaceContours(null);
      setMesh(null);
      return;
    }
    const contours = extractFaceContours(faces);
    console.log('[FaceDetection] extracted contours:', contours ? 'yes' : 'null');
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
    for (const key of Object.keys(svMap)) svMap[key as keyof typeof svMap].value = 0;
  }, [resetAll]);

  // Handle test image select
  const handleSelectTestImage = useCallback(
    (index: number) => {
      setSelectedImageIndex(index);
      handleResetAll();
    },
    [handleResetAll],
  );

  // Handle gallery image pick — convert HEIC to JPEG for Skia compatibility
  const handlePickGallery = useCallback(
    async (uri: string, _width: number, _height: number) => {
      setSelectedImageIndex(-1);
      // Convert to JPEG — Skia cannot decode HEIC
      const result = await ImageManipulator.manipulateAsync(uri, [], {
        compress: 0.9,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      console.log('[Gallery] converted to JPEG:', result.uri.slice(-30), result.width, 'x', result.height);
      setImage(result.uri, result.width, result.height);
      for (const key of Object.keys(svMap)) svMap[key as keyof typeof svMap].value = 0;
    },
    [setImage],
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

      {/* Status + render mode toggle */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 16, height: 24, alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: '#666666', fontSize: 11, flex: 1 }}>
          {isDetecting
            ? 'Detecting face...'
            : faceContours
              ? `${useWarpShader ? 'Shader' : 'Mesh'}: ${mesh?.positions.length ?? 0} pts | Long press for before/after`
              : `Status: ${status} | Faces: ${faces?.length ?? 0} | URI: ${imageUri ? 'yes' : 'no'}${error ? ` | Error: ${error}` : ''}`}
        </Text>
        <TouchableOpacity
          onPress={() => setUseWarpShader((v) => !v)}
          style={{
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: 8,
            backgroundColor: useWarpShader ? '#00D2FF' : '#2E2E2E',
          }}
        >
          <Text style={{ color: useWarpShader ? '#000' : '#AAA', fontSize: 10, fontWeight: '600' }}>
            {useWarpShader ? 'SHADER' : 'MESH'}
          </Text>
        </TouchableOpacity>
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
          {imageUri && mesh && faceContours && !useWarpShader && (
            <SkiaDeformCanvas
              imageUri={imageUri}
              mesh={mesh}
              canvasWidth={screenWidth}
              canvasHeight={canvasHeight}
              imageWidth={imageWidth}
              imageHeight={imageHeight}
              faceOval={faceContours.faceOval}
              sliderValues={svMap}
              showOriginal={showOriginal}
            />
          )}
          {imageUri && mesh && faceContours && useWarpShader && (
            <SkiaWarpCanvas
              imageUri={imageUri}
              mesh={mesh}
              canvasWidth={screenWidth}
              canvasHeight={canvasHeight}
              imageWidth={imageWidth}
              imageHeight={imageHeight}
              faceOval={faceContours.faceOval}
              sliderValues={svMap}
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
