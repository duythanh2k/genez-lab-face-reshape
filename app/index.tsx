import { useCallback, useEffect, useMemo } from 'react';
import { View, Text, ActivityIndicator, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFacesInPhoto } from '@infinitered/react-native-mlkit-face-detection';
import { Asset } from 'expo-asset';
import * as ImageManipulator from 'expo-image-manipulator';
import { useSharedValue, runOnJS } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useState } from 'react';
import { extractAllFaceContours } from '@/lib/faceDetection';
import { buildMultiFaceMesh } from '@/lib/meshDeformation';
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
  const allFaceValues = useReshapeStore((s) => s.allFaceValues);
  const imageUri = useReshapeStore((s) => s.imageUri);
  const imageWidth = useReshapeStore((s) => s.imageWidth);
  const imageHeight = useReshapeStore((s) => s.imageHeight);
  const mesh = useReshapeStore((s) => s.mesh);
  const detectedFaces = useReshapeStore((s) => s.detectedFaces);
  const selectedFaceIndex = useReshapeStore((s) => s.selectedFaceIndex);
  const faceCount = useReshapeStore((s) => s.faceCount);
  const setSelectedTool = useReshapeStore((s) => s.setSelectedTool);
  const setValue = useReshapeStore((s) => s.setValue);
  const resetTool = useReshapeStore((s) => s.resetTool);
  const resetAll = useReshapeStore((s) => s.resetAll);
  const setImage = useReshapeStore((s) => s.setImage);
  const setDetection = useReshapeStore((s) => s.setDetection);
  const selectFace = useReshapeStore((s) => s.selectFace);

  // Shared values for 60fps Skia — selected face only
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

  // Load bundled image
  useEffect(() => {
    if (selectedImageIndex < 0) return;
    (async () => {
      const asset = Asset.fromModule(TEST_IMAGES[selectedImageIndex].module);
      await asset.downloadAsync();
      if (asset.localUri) {
        setImage(asset.localUri, asset.width ?? 1, asset.height ?? 1);
        for (const key of Object.keys(svMap)) svMap[key as keyof typeof svMap].value = 0;
      }
    })();
  }, [selectedImageIndex, setImage]);

  // Face detection
  const { faces: mlkitFaces, status } = useFacesInPhoto(imageUri ?? undefined);

  // Build ONE mesh with ALL faces when detection completes
  useEffect(() => {
    if (!mlkitFaces || mlkitFaces.length === 0) {
      setDetection([], null as any);
      return;
    }
    const allContours = extractAllFaceContours(mlkitFaces);
    console.log(`[FaceDetection] ${allContours.length} faces, building multi-face mesh`);
    const multiFaceMesh = buildMultiFaceMesh(allContours, imageWidth, imageHeight);
    console.log(`[FaceDetection] mesh: ${multiFaceMesh.positions.length} vertices, ${multiFaceMesh.indices.length / 3} triangles`);
    setDetection(allContours, multiFaceMesh);
  }, [mlkitFaces, imageWidth, imageHeight, setDetection]);

  // Load saved values into SharedValues when face changes
  useEffect(() => {
    for (const key of Object.keys(svMap)) {
      svMap[key as keyof typeof svMap].value = values[key as keyof typeof svMap] ?? 0;
    }
  }, [selectedFaceIndex]);

  const canvasHeight = screenHeight - 44 - 36 - 24 - 56 - 64 - 40;

  // Coordinate transform for tap
  const imgScale = Math.min(screenWidth / imageWidth, canvasHeight / imageHeight);
  const oX = (screenWidth - imageWidth * imgScale) / 2;
  const oY = (canvasHeight - imageHeight * imgScale) / 2;

  const handleSelectTool = useCallback((tool: (typeof RESHAPE_TOOLS)[number]['key']) => {
    setSelectedTool(tool);
  }, [setSelectedTool]);

  const handleValueChange = useCallback((value: number) => {
    setValue(selectedTool, value);
  }, [selectedTool, setValue]);

  const handleReset = useCallback(() => {
    resetTool(selectedTool);
    activeSharedValue.value = 0;
  }, [selectedTool, resetTool, activeSharedValue]);

  const handleResetAll = useCallback(() => {
    resetAll();
    for (const key of Object.keys(svMap)) svMap[key as keyof typeof svMap].value = 0;
  }, [resetAll]);

  const handleSelectTestImage = useCallback((index: number) => {
    setSelectedImageIndex(index);
    handleResetAll();
  }, [handleResetAll]);

  const handlePickGallery = useCallback(async (uri: string, _w: number, _h: number) => {
    setSelectedImageIndex(-1);
    const result = await ImageManipulator.manipulateAsync(uri, [], {
      compress: 0.9, format: ImageManipulator.SaveFormat.JPEG,
    });
    setImage(result.uri, result.width, result.height);
    for (const key of Object.keys(svMap)) svMap[key as keyof typeof svMap].value = 0;
  }, [setImage]);

  // Tap to select face
  const handleFaceTap = useCallback((tapX: number, tapY: number) => {
    if (faceCount <= 1) return;
    const imageX = Math.max(0, Math.min(imageWidth, (tapX - oX) / imgScale));
    const imageY = Math.max(0, Math.min(imageHeight, (tapY - oY) / imgScale));
    for (let i = 0; i < detectedFaces.length; i++) {
      const bb = detectedFaces[i].boundingBox;
      if (imageX >= bb.x && imageX <= bb.x + bb.width &&
          imageY >= bb.y && imageY <= bb.y + bb.height) {
        if (i !== selectedFaceIndex) selectFace(i);
        return;
      }
    }
  }, [detectedFaces, selectedFaceIndex, selectFace, imageWidth, imageHeight, imgScale, oX, oY, faceCount]);

  const tapGesture = Gesture.Tap().onEnd((e) => {
    'worklet';
    runOnJS(handleFaceTap)(e.x, e.y);
  });
  const longPress = Gesture.LongPress().minDuration(200)
    .onStart(() => { 'worklet'; showOriginal.value = true; })
    .onEnd(() => { 'worklet'; showOriginal.value = false; });
  const composedGesture = Gesture.Race(tapGesture, longPress);

  const isDetecting = status === 'detecting' || status === 'modelLoading';
  const currentToolLabel = RESHAPE_TOOLS.find((t) => t.key === selectedTool)?.label ?? '';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0D0D0D' }}>
      <TopBar
        selectedImageIndex={selectedImageIndex}
        onSelectTestImage={handleSelectTestImage}
        onPickGalleryImage={handlePickGallery}
        onResetAll={handleResetAll}
      />

      <View style={{ paddingHorizontal: 16, height: 24, justifyContent: 'center' }}>
        <Text style={{ color: '#666666', fontSize: 11 }}>
          {isDetecting ? 'Detecting face...'
            : mesh ? `Face ${selectedFaceIndex + 1}/${faceCount}${faceCount > 1 ? ' | Tap face to switch' : ''} | Long press for B/A`
            : 'No face found'}
        </Text>
      </View>

      <GestureDetector gesture={composedGesture}>
        <View style={{ flex: 1, backgroundColor: '#0D0D0D' }}>
          {isDetecting && (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', zIndex: 10 }}>
              <ActivityIndicator size="large" color="#00D2FF" />
            </View>
          )}
          {imageUri && mesh && (
            <SkiaDeformCanvas
              imageUri={imageUri}
              mesh={mesh}
              allFaceValues={allFaceValues}
              selectedFaceIndex={selectedFaceIndex}
              canvasWidth={screenWidth}
              canvasHeight={canvasHeight}
              imageWidth={imageWidth}
              imageHeight={imageHeight}
              sliderValues={svMap}
              showOriginal={showOriginal}
            />
          )}
        </View>
      </GestureDetector>

      <ReshapeSlider
        toolName={currentToolLabel}
        value={values[selectedTool]}
        sharedValue={activeSharedValue}
        onValueChange={handleValueChange}
        onReset={handleReset}
      />

      <ReshapeToolStrip
        selectedTool={selectedTool}
        values={values}
        onSelectTool={handleSelectTool}
      />
    </SafeAreaView>
  );
}
