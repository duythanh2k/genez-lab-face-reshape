# LAB-M3: Face Reshape — Findings

> Status: Proven
> Last updated: 2026-04-04

---

## Chosen Approach

**Approach 1: Delaunay Triangulation + Skia drawVertices**

### Why

- Smooth 60fps rendering on physical device (iPhone, dev build)
- No visible triangle artifacts at moderate intensities (50%)
- Smooth distance-based falloff on ALL nearby vertices eliminates spike artifacts
- Background lock via feathered face oval mask prevents warping outside face
- Simple displacement math runs in Reanimated worklets on UI thread

### Approach 2 (SkSL Warp Shader) — Rejected

Implemented and tested. The shader with 32 control point pairs using inverse distance weighting **froze the app completely** when activated. Root cause: per-pixel loop over 32 uniform lookups via if-chain is too heavy for mobile GPU. Would need significant optimization (fewer points, tiled rendering, texture-based control point storage) which isn't justified since Approach 1 works well.

---

## Comparison Table

| Metric | drawVertices | SkSL Shader |
|--------|-------------|-------------|
| Visual quality at 50% intensity | Good — natural looking | N/A — froze app |
| Visual quality at 100% intensity | Acceptable — some edge softness | N/A |
| Artifacts visible? | No (after smooth falloff fix) | N/A |
| Render time per frame | < 16ms (60fps) | Infinite (frozen) |
| Code complexity | Medium (3 files) | High (shader + uniform packing) |

**Winner: drawVertices (Approach 1)**

---

## ML Kit Face Detection Observations

- **Library**: `@infinitered/react-native-mlkit-face-detection` v5.0.0
- **Contour types**: PascalCase — `Face`, `LeftEye`, `RightEye`, `NoseBridge`, `NoseBottom`, `UpperLipTop`, `UpperLipBottom`, `LowerLipTop`, `LowerLipBottom`, `LeftEyebrowTop`, `LeftEyebrowBottom`, `RightEyebrowTop`, `RightEyebrowBottom`, `LeftCheek`, `RightCheek`
- **Total contour types**: 15 (all returned when contourMode enabled)
- **Face oval**: 36 points
- **Each eye**: 16 points
- **Nose bridge**: 2 points, nose bottom: 3 points
- **Lip contours**: 9-11 points each (4 contour types)
- **Multi-face**: Works — largest face by bounding box area is selected
- **Angled faces**: Detection works on slightly turned faces (~15-20 deg). Contour accuracy degrades on strong angles but remains usable.
- **Low light**: Detection succeeds but accuracy may be reduced
- **Provider config**: `performanceMode: 'accurate'`, `contourMode: true`, `landmarkMode: true`

---

## Image Loading

- **Skia `useImage()`**: Only handles JPEG/PNG. Cannot decode HEIC.
- **Skia `Data.fromURI()` + `Image.MakeImageFromEncoded()`**: Also cannot decode HEIC.
- **Solution**: Use `expo-image-manipulator` to convert HEIC to JPEG before passing to Skia. Requires native rebuild (not available in Expo Go).
- **Bundled test images**: Load fine via `expo-asset` → `Asset.fromModule()` → `localUri`

---

## Reshape Tools Implemented (10 total)

| Tool | Technique | Quality |
|------|-----------|---------|
| Face Slim | Push jawline inward, quadratic vertical weight | Good |
| Jawline | Sharpen lower 40% of face, sine weight | Good |
| Chin | Vertical shift near chin point | OK — overflow at extreme values |
| Forehead | Elliptical influence zone, upper half only | OK — fixed off-center issue on angled faces |
| Eye Size | Scale from eye center with smooth falloff | Good |
| Eye Distance | Shift eye regions horizontally | Good |
| Nose Slim | Horizontal push toward center line | Good |
| Nose Length | Vertical shift near nose bottom | Good |
| Lip Fullness | Scale from lip center, more vertical than horizontal | Good |
| Smile | Lift mouth corners, horizontal weight | Good |

---

## Background Lock

- **Technique**: Two-layer Skia rendering — original image as base, deformed Vertices in SaveLayer with DstIn blurred face oval mask
- **Mask**: Face oval expanded outward (30% of face width base, 2.5x vertical multiplier)
- **Feather**: 15px Gaussian blur on mask edge
- **Result**: Background stays perfectly still during face deformation
- **Known issue**: At extreme chin/forehead values, deformation can overflow the mask boundary. Mitigated by increasing vertical expansion.

---

## Performance

| Metric | Value |
|--------|-------|
| Mesh vertices | ~800-900 (contour + grid + corners) |
| Mesh triangles | ~1100-1600 |
| Face detection time | < 500ms (one-time on image load) |
| Mesh build time | < 50ms (one-time) |
| Slider frame rate | 60fps (UI thread, no JS involvement) |
| Device tested | iPhone (physical device via dev build) |

---

## Known Limitations

1. **HEIC images**: Require native rebuild with `expo-image-manipulator` for conversion
2. **Extreme slider values**: Chin and forehead can overflow mask at +-100
3. **Side-profile faces**: Forehead tool was off-center on angled faces (fixed with elliptical influence using face center X)
4. **No Expo Go support**: `@infinitered/react-native-mlkit-face-detection` is a native module
5. **Single face only**: Multi-face detection works but only processes the largest face

---

## Recommendations for Porting to Main App

1. **Engine code**: `lib/displacements.ts`, `lib/meshDeformation.ts`, `lib/faceDetection.ts` are portable to `engine/beauty/`
2. **Refactor needed**: Wrap in a clean `FaceReshapeEngine` class with zero UI/store/SDK imports (Phase 8)
3. **Store pattern**: Matches Genez's Zustand architecture — direct port
4. **UI components**: `ReshapeSlider` mirrors Genez's `AdjustmentSlider`, `ReshapeToolStrip` mirrors `ToolStrip` — can reuse main app components
5. **Image loading**: Main app already handles HEIC via proxy pipeline — no special handling needed when porting
6. **Performance**: Displacement math in worklets is efficient enough for iPhone X (simple arithmetic on ~900 vertices)
