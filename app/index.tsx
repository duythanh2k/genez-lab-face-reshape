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
import { buildMesh } from '@/lib/meshDeformation';
import { SkiaDeformCanvas } from '@/components/SkiaDeformCanvas';
import { ReshapeSlider } from '@/components/ReshapeSlider';
import { ReshapeToolStrip } from '@/components/ReshapeToolStrip';
import { TopBar, TEST_IMAGES } from '@/components/TopBar';
import { useReshapeStore, RESHAPE_TOOLS, INITIAL_VALUES, type FaceData } from '@/store/reshapeStore';

export default function ReshapeScreen() {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  // Store
  const selectedTool = useReshapeStore((s) => s.selectedTool);
  const values = useReshapeStore((s) => s.values);
  const imageUri = useReshapeStore((s) => s.imageUri);
  const imageWidth = useReshapeStore((s) => s.imageWidth);
  const imageHeight = useReshapeStore((s) => s.imageHeight);
  const faces = useReshapeStore((s) => s.faces);
  const selectedFaceIndex = useReshapeStore((s) => s.selectedFaceIndex);
  const setSelectedTool = useReshapeStore((s) => s.setSelectedTool);
  const setValue = useReshapeStore((s) => s.setValue);
  const resetTool = useReshapeStore((s) => s.resetTool);
  const resetAll = useReshapeStore((s) => s.resetAll);
  const setImage = useReshapeStore((s) => s.setImage);
  const setFaces = useReshapeStore((s) => s.setFaces);
  const selectFace = useReshapeStore((s) => s.selectFace);

  // Shared values for 60fps Skia updates — for the SELECTED face only
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
        for (const key of Object.keys(svMap)) svMap[key as keyof typeof svMap].value = 0;
      }
    })();
  }, [selectedImageIndex, setImage]);

  // Run face detection
  const { faces: mlkitFaces, status, error } = useFacesInPhoto(imageUri ?? undefined);

  // Build meshes for ALL detected faces at once
  useEffect(() => {
    if (!mlkitFaces || mlkitFaces.length === 0) {
      setFaces([]);
      return;
    }
    const allContours = extractAllFaceContours(mlkitFaces);
    console.log(`[FaceDetection] extracted ${allContours.length} faces`);

    // Build a mesh for each face
    const faceDataArray: FaceData[] = allContours.map((contours) => ({
      contours,
      mesh: buildMesh(contours, imageWidth, imageHeight),
      values: { ...INITIAL_VALUES },
    }));

    setFaces(faceDataArray);
  }, [mlkitFaces, imageWidth, imageHeight, setFaces]);

  // When selected face changes, load its values into SharedValues
  useEffect(() => {
    if (faces.length === 0) return;
    const faceValues = faces[selectedFaceIndex]?.values ?? INITIAL_VALUES;
    for (const key of Object.keys(svMap)) {
      svMap[key as keyof typeof svMap].value = faceValues[key as keyof typeof svMap] ?? 0;
    }
  }, [selectedFaceIndex, faces.length]);

  // Canvas height
  const canvasHeight = screenHeight - 44 - 36 - 24 - 56 - 64 - 40;

  // Scale/offset for tap coordinate conversion
  const imgScale = useMemo(
    () => Math.min(screenWidth / imageWidth, canvasHeight / imageHeight),
    [screenWidth, imageWidth, canvasHeight, imageHeight],
  );
  const oX = useMemo(
    () => (screenWidth - imageWidth * imgScale) / 2,
    [screenWidth, imageWidth, imgScale],
  );
  const oY = useMemo(
    () => (canvasHeight - imageHeight * imgScale) / 2,
    [canvasHeight, imageHeight, imgScale],
  );

  // Handle tool select
  const handleSelectTool = useCallback(
    (tool: (typeof RESHAPE_TOOLS)[number]['key']) => {
      setSelectedTool(tool);
    },
    [setSelectedTool],
  );

  const handleValueChange = useCallback(
    (value: number) => {
      setValue(selectedTool, value);
    },
    [selectedTool, setValue],
  );

  const handleReset = useCallback(() => {
    resetTool(selectedTool);
    activeSharedValue.value = 0;
  }, [selectedTool, resetTool, activeSharedValue]);

  const handleResetAll = useCallback(() => {
    resetAll();
    for (const key of Object.keys(svMap)) svMap[key as keyof typeof svMap].value = 0;
  }, [resetAll]);

  const handleSelectTestImage = useCallback(
    (index: number) => {
      setSelectedImageIndex(index);
      handleResetAll();
    },
    [handleResetAll],
  );

  const handlePickGallery = useCallback(
    async (uri: string, _width: number, _height: number) => {
      setSelectedImageIndex(-1);
      const result = await ImageManipulator.manipulateAsync(uri, [], {
        compress: 0.9,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      setImage(result.uri, result.width, result.height);
      for (const key of Object.keys(svMap)) svMap[key as keyof typeof svMap].value = 0;
    },
    [setImage],
  );

  // Tap-to-select face
  const handleFaceTap = useCallback(
    (tapX: number, tapY: number) => {
      if (faces.length <= 1) return;
      const imageX = Math.max(0, Math.min(imageWidth, (tapX - oX) / imgScale));
      const imageY = Math.max(0, Math.min(imageHeight, (tapY - oY) / imgScale));

      for (let i = 0; i < faces.length; i++) {
        const bb = faces[i].contours.boundingBox;
        if (
          imageX >= bb.x && imageX <= bb.x + bb.width &&
          imageY >= bb.y && imageY <= bb.y + bb.height
        ) {
          if (i !== selectedFaceIndex) {
            selectFace(i);
          }
          return;
        }
      }
    },
    [faces, selectedFaceIndex, selectFace, imageWidth, imageHeight, imgScale, oX, oY],
  );

  const tapGesture = Gesture.Tap().onEnd((e) => {
    'worklet';
    runOnJS(handleFaceTap)(e.x, e.y);
  });

  const longPress = Gesture.LongPress()
    .minDuration(200)
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
          {isDetecting
            ? 'Detecting face...'
            : faces.length > 0
              ? `Face ${selectedFaceIndex + 1}/${faces.length}${faces.length > 1 ? ' | Tap face to switch' : ''} | Long press for B/A`
              : `No face found`}
        </Text>
      </View>

      <GestureDetector gesture={composedGesture}>
        <View style={{ flex: 1, backgroundColor: '#0D0D0D' }}>
          {isDetecting && (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', zIndex: 10 }}>
              <ActivityIndicator size="large" color="#00D2FF" />
            </View>
          )}
          {imageUri && faces.length > 0 && (
            <SkiaDeformCanvas
              imageUri={imageUri}
              faces={faces}
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
