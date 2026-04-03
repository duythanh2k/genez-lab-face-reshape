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
import {
  Canvas,
  Circle,
  Image as SkiaImage,
  useImage,
  Path,
  Skia,
} from '@shopify/react-native-skia';
import { Asset } from 'expo-asset';
import * as ImagePicker from 'expo-image-picker';
import { extractFaceContours } from '@/lib/faceDetection';
import type { FaceContours, Point } from '@/lib/types';

// Bundled test images — require() returns a module ID
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

export default function ReshapeScreen() {
  const { width: screenWidth } = useWindowDimensions();
  const [selectedIndex, setSelectedIndex] = useState(0);
  // file:// URI for both ML Kit detection and Skia rendering
  const [imageUri, setImageUri] = useState<string | undefined>(undefined);

  // Resolve bundled asset to a local file URI
  useEffect(() => {
    (async () => {
      const asset = Asset.fromModule(TEST_IMAGES[selectedIndex].module);
      await asset.downloadAsync();
      if (asset.localUri) {
        setImageUri(asset.localUri);
      }
    })();
  }, [selectedIndex]);

  // Load image for Skia rendering
  const skiaImage = useImage(imageUri ?? null);

  // Run face detection on the file URI
  const { faces, status } = useFacesInPhoto(imageUri);

  // Extract contours from detected faces
  const contours: FaceContours | null = useMemo(() => {
    if (!faces || faces.length === 0) return null;
    return extractFaceContours(faces);
  }, [faces]);

  // Compute canvas dimensions to fit image
  const canvasHeight = screenWidth * 1.2;
  const imageWidth = skiaImage?.width() ?? 1;
  const imageHeight = skiaImage?.height() ?? 1;
  const scale = Math.min(
    screenWidth / imageWidth,
    canvasHeight / imageHeight,
  );
  const offsetX = (screenWidth - imageWidth * scale) / 2;
  const offsetY = (canvasHeight - imageHeight * scale) / 2;

  // Pick from gallery
  const pickImage = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setSelectedIndex(-1); // deselect bundled
      setImageUri(result.assets[0].uri);
    }
  }, []);

  // Select a bundled test image
  const selectTestImage = useCallback((index: number) => {
    setSelectedIndex(index);
  }, []);

  // Build Skia path from contour points for visualization
  const buildContourPath = useCallback(
    (points: Point[]) => {
      if (points.length < 2) return null;
      const path = Skia.Path.Make();
      path.moveTo(
        points[0].x * scale + offsetX,
        points[0].y * scale + offsetY,
      );
      for (let i = 1; i < points.length; i++) {
        path.lineTo(
          points[i].x * scale + offsetX,
          points[i].y * scale + offsetY,
        );
      }
      path.close();
      return path;
    },
    [scale, offsetX, offsetY],
  );

  const isDetecting = status === 'detecting' || status === 'modelLoading';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0D0D0D' }}>
      {/* Top bar */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: 16,
          height: 44,
        }}
      >
        <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }}>
          Face Reshape Lab
        </Text>
        <TouchableOpacity onPress={pickImage}>
          <Text style={{ color: '#00D2FF', fontSize: 14 }}>Gallery</Text>
        </TouchableOpacity>
      </View>

      {/* Test image selector */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
        style={{ maxHeight: 32, marginBottom: 4 }}
      >
        {TEST_IMAGES.map((img, i) => (
          <TouchableOpacity
            key={i}
            onPress={() => selectTestImage(i)}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 4,
              borderRadius: 12,
              backgroundColor:
                selectedIndex === i ? '#00D2FF' : '#2E2E2E',
            }}
          >
            <Text
              style={{
                color: selectedIndex === i ? '#000000' : '#AAAAAA',
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
      <View style={{ paddingHorizontal: 16, paddingVertical: 4 }}>
        <Text style={{ color: '#888888', fontSize: 11 }}>
          {isDetecting
            ? 'Detecting face...'
            : contours
              ? `Face oval: ${contours.faceOval.length}pts | Eyes: ${contours.leftEye.length}+${contours.rightEye.length}pts | Nose: ${contours.noseBridge.length}+${contours.noseBottom.length}pts`
              : status === 'done'
                ? 'No face found'
                : 'Loading...'}
        </Text>
      </View>

      {/* Canvas with image + contour overlay */}
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
        <Canvas style={{ width: screenWidth, height: canvasHeight }}>
          {/* Render image */}
          {skiaImage && (
            <SkiaImage
              image={skiaImage}
              x={offsetX}
              y={offsetY}
              width={imageWidth * scale}
              height={imageHeight * scale}
              fit="contain"
            />
          )}

          {/* Draw face oval contour path */}
          {contours?.faceOval &&
            (() => {
              const path = buildContourPath(contours.faceOval);
              return path ? (
                <Path
                  path={path}
                  color="rgba(0, 210, 255, 0.4)"
                  style="stroke"
                  strokeWidth={2}
                />
              ) : null;
            })()}

          {/* Face oval dots */}
          {contours?.faceOval.map((p, i) => (
            <Circle
              key={`oval-${i}`}
              cx={p.x * scale + offsetX}
              cy={p.y * scale + offsetY}
              r={3}
              color="rgba(0, 210, 255, 0.8)"
            />
          ))}

          {/* Left eye dots */}
          {contours?.leftEye.map((p, i) => (
            <Circle
              key={`leye-${i}`}
              cx={p.x * scale + offsetX}
              cy={p.y * scale + offsetY}
              r={2.5}
              color="rgba(0, 255, 100, 0.8)"
            />
          ))}

          {/* Right eye dots */}
          {contours?.rightEye.map((p, i) => (
            <Circle
              key={`reye-${i}`}
              cx={p.x * scale + offsetX}
              cy={p.y * scale + offsetY}
              r={2.5}
              color="rgba(0, 255, 100, 0.8)"
            />
          ))}

          {/* Nose bridge dots */}
          {contours?.noseBridge.map((p, i) => (
            <Circle
              key={`nbridge-${i}`}
              cx={p.x * scale + offsetX}
              cy={p.y * scale + offsetY}
              r={2.5}
              color="rgba(255, 200, 0, 0.8)"
            />
          ))}

          {/* Nose bottom dots */}
          {contours?.noseBottom.map((p, i) => (
            <Circle
              key={`nbottom-${i}`}
              cx={p.x * scale + offsetX}
              cy={p.y * scale + offsetY}
              r={2.5}
              color="rgba(255, 150, 0, 0.8)"
            />
          ))}
        </Canvas>
      </View>

      {/* Legend */}
      <View
        style={{
          paddingHorizontal: 16,
          paddingVertical: 12,
          backgroundColor: '#1A1A1A',
        }}
      >
        <Text style={{ color: '#666666', fontSize: 11, textAlign: 'center' }}>
          cyan = face oval | green = eyes | yellow = nose bridge | orange = nose
          bottom
        </Text>
      </View>
    </SafeAreaView>
  );
}
