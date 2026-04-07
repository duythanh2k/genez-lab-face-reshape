import { useCallback, useEffect } from 'react';
import { View, Text, ActivityIndicator, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFacesInPhoto } from '@infinitered/react-native-mlkit-face-detection';
import { Asset } from 'expo-asset';
import * as ImageManipulator from 'expo-image-manipulator';
import { runOnJS } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useState } from 'react';
import { extractAllFaceContours } from '@/lib/faceDetection';
import { buildMultiFaceMesh } from '@/lib/meshDeformation';
import { SkiaDeformCanvas } from '@/components/SkiaDeformCanvas';
import { ReshapeSlider } from '@/components/ReshapeSlider';
import { ReshapeToolStrip } from '@/components/ReshapeToolStrip';
import { LipstickColorPicker } from '@/components/LipstickColorPicker';
import { TopBar, TEST_IMAGES } from '@/components/TopBar';
import {
  useReshapeStore,
  RESHAPE_TOOLS,
  type ReshapeTool,
  type ToolKey,
} from '@/store/reshapeStore';

const LIPSTICK_PICKER_HEIGHT = 56;

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
  const setLipstickColor = useReshapeStore((s) => s.setLipstickColor);
  const setLipstickIntensity = useReshapeStore((s) => s.setLipstickIntensity);
  const resetLipstick = useReshapeStore((s) => s.resetLipstick);

  const isLipstickSelected = selectedTool === 'lipstick';

  // Load bundled image
  useEffect(() => {
    if (selectedImageIndex < 0) return;
    (async () => {
      const asset = Asset.fromModule(TEST_IMAGES[selectedImageIndex].module);
      await asset.downloadAsync();
      if (asset.localUri) {
        setImage(asset.localUri, asset.width ?? 1, asset.height ?? 1);
      }
    })();
  }, [selectedImageIndex, setImage]);

  // Face detection
  const { faces: mlkitFaces, status } = useFacesInPhoto(imageUri ?? undefined);

  // Build ONE mesh with ALL faces
  useEffect(() => {
    if (!mlkitFaces || mlkitFaces.length === 0) return;
    const allContours = extractAllFaceContours(mlkitFaces);
    if (allContours.length === 0) return;
    const multiFaceMesh = buildMultiFaceMesh(allContours, imageWidth, imageHeight);
    setDetection(allContours, multiFaceMesh);
  }, [mlkitFaces, imageWidth, imageHeight, setDetection]);

  // Reserve space for the lipstick color picker when active
  const canvasHeight =
    screenHeight -
    44 -
    36 -
    24 -
    56 -
    64 -
    40 -
    (isLipstickSelected ? LIPSTICK_PICKER_HEIGHT : 0);

  // Tap coordinate transform
  const imgScale = Math.min(screenWidth / imageWidth, canvasHeight / imageHeight);
  const oX = (screenWidth - imageWidth * imgScale) / 2;
  const oY = (canvasHeight - imageHeight * imgScale) / 2;

  const handleSelectTool = useCallback(
    (tool: ToolKey) => {
      setSelectedTool(tool);
    },
    [setSelectedTool],
  );

  const handleValueChange = useCallback(
    (value: number) => {
      if (isLipstickSelected) {
        setLipstickIntensity(value);
      } else {
        setValue(selectedTool as ReshapeTool, value);
      }
    },
    [isLipstickSelected, selectedTool, setValue, setLipstickIntensity],
  );

  const handleReset = useCallback(() => {
    if (isLipstickSelected) {
      resetLipstick();
    } else {
      resetTool(selectedTool as ReshapeTool);
    }
  }, [isLipstickSelected, selectedTool, resetTool, resetLipstick]);

  const handleResetAll = useCallback(() => {
    resetAll();
  }, [resetAll]);

  const handleSelectTestImage = useCallback((index: number) => {
    setSelectedImageIndex(index);
  }, []);

  const handlePickGallery = useCallback(
    async (uri: string, _w: number, _h: number) => {
      setSelectedImageIndex(-1);
      const result = await ImageManipulator.manipulateAsync(uri, [], {
        compress: 0.9,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      setImage(result.uri, result.width, result.height);
    },
    [setImage],
  );

  // Tap to select face
  const handleFaceTap = useCallback(
    (tapX: number, tapY: number) => {
      if (faceCount <= 1) return;
      const imageX = Math.max(0, Math.min(imageWidth, (tapX - oX) / imgScale));
      const imageY = Math.max(0, Math.min(imageHeight, (tapY - oY) / imgScale));
      for (let i = 0; i < detectedFaces.length; i++) {
        const bb = detectedFaces[i].boundingBox;
        if (
          imageX >= bb.x &&
          imageX <= bb.x + bb.width &&
          imageY >= bb.y &&
          imageY <= bb.y + bb.height
        ) {
          if (i !== selectedFaceIndex) selectFace(i);
          return;
        }
      }
    },
    [detectedFaces, selectedFaceIndex, selectFace, imageWidth, imageHeight, imgScale, oX, oY, faceCount],
  );

  const tapGesture = Gesture.Tap().onEnd((e) => {
    'worklet';
    runOnJS(handleFaceTap)(e.x, e.y);
  });

  const isDetecting = status === 'detecting' || status === 'modelLoading';
  const currentToolLabel =
    RESHAPE_TOOLS.find((t) => t.key === selectedTool)?.label ?? '';

  // Slider value, min, max routed based on active tool
  const sliderValue = isLipstickSelected
    ? values.lipstick.intensity
    : values[selectedTool as ReshapeTool];
  const sliderMin = isLipstickSelected ? 0 : -100;
  const sliderMax = 100;

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
          {isDetecting
            ? 'Detecting face...'
            : mesh
              ? `Face ${selectedFaceIndex + 1}/${faceCount}${faceCount > 1 ? ' | Tap face to switch' : ''}`
              : 'No face found'}
        </Text>
      </View>

      <GestureDetector gesture={tapGesture}>
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
          {imageUri && mesh && (
            <SkiaDeformCanvas
              imageUri={imageUri}
              mesh={mesh}
              allFaceValues={allFaceValues}
              detectedFaces={detectedFaces}
              canvasWidth={screenWidth}
              canvasHeight={canvasHeight}
              imageWidth={imageWidth}
              imageHeight={imageHeight}
            />
          )}
        </View>
      </GestureDetector>

      {isLipstickSelected && (
        <LipstickColorPicker
          selectedIndex={values.lipstick.colorIndex}
          onSelect={setLipstickColor}
        />
      )}

      <ReshapeSlider
        toolName={currentToolLabel}
        value={sliderValue}
        min={sliderMin}
        max={sliderMax}
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
