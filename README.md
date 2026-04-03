# LAB-M3: Face Reshape

A standalone Expo lab proving face reshaping (face slim, eye enlarge, nose slim) with background lock, before integrating into the main Genez photo editor.

## What This Lab Proves

- ML Kit face detection provides accurate enough contour points for reshaping
- Delaunay triangulation + Skia `drawVertices` can produce smooth face deformation
- Background lock via feathered mask prevents warping artifacts outside the face
- 60fps real-time preview via Reanimated SharedValues + Skia UI-thread rendering

## How to Run

This lab requires a **dev build** (not Expo Go) because `@infinitered/react-native-mlkit-face-detection` is a native module.

```bash
# Install dependencies
bun install

# Generate native projects
npx expo prebuild --clean

# Run on iOS (or open ios/FaceReshapeLab.xcworkspace in Xcode)
npx expo run:ios

# Run on Android
npx expo run:android
```

## Architecture

```
Image Load -> ML Kit Face Detection -> Delaunay Mesh -> Displacement -> Skia Render
                                                            ^
                                              Slider SharedValue (UI thread)
```

1. **Face Detection** (`lib/faceDetection.ts`): ML Kit extracts face oval, eye, nose contour points
2. **Mesh Generation** (`lib/meshDeformation.ts`): Delaunay triangulation from contours + background grid
3. **Displacement** (`lib/displacements.ts`): Worklet-safe math runs on UI thread every frame
4. **Background Lock** (`lib/backgroundBlend.ts`): Expanded face oval path with blur feather
5. **Rendering** (`components/SkiaDeformCanvas.tsx`): Two-layer Vertices -- original background + masked deformed face

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `expo` | ~54.0.0 | Framework |
| `@shopify/react-native-skia` | 2.2.12 | GPU rendering |
| `@infinitered/react-native-mlkit-face-detection` | ^5.0.0 | Face contour detection |
| `react-native-reanimated` | ~4.1.1 | UI-thread animations |
| `react-native-gesture-handler` | ~2.28.0 | Touch gestures |
| `delaunator` | ^5.0.0 | Delaunay triangulation |
| `zustand` | ^5.0.0 | State management |

## Test Images

5 bundled Unsplash portraits in `assets/images/test-faces/`:
1. Front-facing portrait
2. Slightly angled face
3. Face near straight lines (background lock test)
4. Multiple faces (largest face selected)
5. Low light conditions
