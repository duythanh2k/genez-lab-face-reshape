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
  const detectedFaces = useReshapeStore((s) => s.detectedFaces);
  const selectedFaceIndex = useReshapeStore((s) => s.selectedFaceIndex);
  const setDetectedFaces = useReshapeStore((s) => s.setDetectedFaces);
  const selectFace = useReshapeStore((s) => s.selectFace);

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
        for (const key of Object.keys(svMap)) svMap[key as keyof typeof svMap].value = 0;
      }
    })();
  }, [selectedImageIndex, setImage]);

  // Run face detection
  const { faces, status, error } = useFacesInPhoto(imageUri ?? undefined);

  // Extract contours for ALL faces when detection changes
  useEffect(() => {
    if (!faces || faces.length === 0) {
      setDetectedFaces([]);
      setFaceContours(null);
      setMesh(null);
      return;
    }
    const allFaces = extractAllFaceContours(faces);
    setDetectedFaces(allFaces);
    console.log(`[FaceDetection] extracted ${allFaces.length} faces`);
    // Build mesh from the first (largest) face
    const contours = allFaces[0] ?? null;
    setFaceContours(contours);
    if (contours) {
      setMesh(buildMesh(contours, imageWidth, imageHeight));
    } else {
      setMesh(null);
    }
  }, [faces, imageWidth, imageHeight, setFaceContours, setMesh, setDetectedFaces]);

  // Rebuild mesh when selected face changes — load saved values into SharedValues
  useEffect(() => {
    if (detectedFaces.length === 0) return;
    const contours = detectedFaces[selectedFaceIndex] ?? null;
    setFaceContours(contours);
    if (contours) {
      setMesh(buildMesh(contours, imageWidth, imageHeight));
    } else {
      setMesh(null);
    }
    // Load saved values for this face into SharedValues
    for (const key of Object.keys(svMap)) {
      svMap[key as keyof typeof svMap].value = values[key as keyof typeof svMap] ?? 0;
    }
  }, [selectedFaceIndex]);

  // Also sync SharedValues when store values change (e.g. from slider)
  // This is needed because the slider writes to both the store AND the SharedValue,
  // but when switching faces, only the store values update via selectFace()

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

  // Handle reset all faces
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
      const result = await ImageManipulator.manipulateAsync(uri, [], {
        compress: 0.9,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      setImage(result.uri, result.width, result.height);
      for (const key of Object.keys(svMap)) svMap[key as keyof typeof svMap].value = 0;
    },
    [setImage],
  );

  // Tap-to-select face — no dimming, just tap to switch
  const handleFaceTap = useCallback(
    (tapX: number, tapY: number) => {
      if (detectedFaces.length <= 1) return;

      const imgScale = Math.min(screenWidth / imageWidth, canvasHeight / imageHeight);
      const oX = (screenWidth - imageWidth * imgScale) / 2;
      const oY = (canvasHeight - imageHeight * imgScale) / 2;
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
          if (i !== selectedFaceIndex) {
            selectFace(i);
          }
          return;
        }
      }
    },
    [detectedFaces, selectedFaceIndex, selectFace, screenWidth, imageWidth, imageHeight, canvasHeight],
  );

  const tapGesture = Gesture.Tap().onEnd((e) => {
    'worklet';
    runOnJS(handleFaceTap)(e.x, e.y);
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

  const composedGesture = Gesture.Race(tapGesture, longPress);

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
              ? `Face ${selectedFaceIndex + 1}/${detectedFaces.length}${detectedFaces.length > 1 ? ' | Tap face to switch' : ''} | Long press for B/A`
              : `Status: ${status} | Faces: ${faces?.length ?? 0} | URI: ${imageUri ? 'yes' : 'no'}${error ? ` | Error: ${error}` : ''}`}
        </Text>
      </View>

      {/* Canvas — no dimming overlay, just the normal image with deformation */}
      <GestureDetector gesture={composedGesture}>
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
