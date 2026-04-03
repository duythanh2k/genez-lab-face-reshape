# LAB-M3: Face Reshape -- Findings

> Status: In Progress
> Last updated: 2026-04-03

---

## Chosen Approach

**Approach 1: Delaunay Triangulation + Skia drawVertices**

### Why

- Faster to prototype than SkSL warp shader
- Skia's `Vertices` component with `ImageShader` handles texture mapping natively
- Triangle mesh covers both face and background, enabling background lock via layer masking
- Worklet-safe displacement math is simple arithmetic (push/scale/narrow)

### Approach 2 Status

Not yet implemented. Will evaluate if Approach 1 shows visible triangle artifacts at moderate intensities.

---

## Comparison Table

| Metric | drawVertices | SkSL Shader |
|--------|-------------|-------------|
| Visual quality at 50% intensity | TBD | TBD |
| Visual quality at 100% intensity | TBD | TBD |
| Artifacts visible? | TBD | TBD |
| Render time per frame | TBD | TBD |
| Code complexity | Low | TBD |

---

## Benchmark Results

| Metric | Value |
|--------|-------|
| Mesh vertices | ~500 (contour + grid) |
| Mesh triangles | ~900 |
| Detection time | TBD |
| Mesh build time | TBD |
| Frame render time | TBD |
| Device tested | TBD |

---

## ML Kit Observations

- Contour mode provides ~133 points (face oval 36, each eye 16, nose bridge + bottom ~7)
- TBD: accuracy on angled faces
- TBD: accuracy in low light
- TBD: multi-face selection (largest by bounding box)

---

## Known Limitations

- TBD (fill in after testing on device)

---

## Recommendations for Porting

- Engine code in `lib/` is portable to `engine/beauty/` in the main app
- `FaceReshapeEngine` class refactor (Phase 8) needed before porting
- Store pattern matches Genez's Zustand architecture
- UI components (slider, tool strip) match Genez patterns closely

---

*Update this file as experiments complete.*
