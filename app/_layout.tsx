import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { FaceDetectionProvider } from '@infinitered/react-native-mlkit-face-detection';
import 'react-native-reanimated';
import '../global.css';

const faceDetectionOptions = {
  performanceMode: 'accurate' as const,
  contourMode: true,
  landmarkMode: true,
  classificationMode: false,
  minFaceSize: 0.15,
  isTrackingEnabled: false,
};

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#0D0D0D' }}>
      <FaceDetectionProvider options={faceDetectionOptions}>
        <Stack screenOptions={{ headerShown: false }} />
        <StatusBar style="light" />
      </FaceDetectionProvider>
    </GestureHandlerRootView>
  );
}
