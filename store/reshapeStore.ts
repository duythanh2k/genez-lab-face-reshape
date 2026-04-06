import { create } from 'zustand';
import type { FaceContours } from '@/lib/types';
import type { MultiFaceMesh } from '@/lib/meshDeformation';

export type ReshapeTool =
  | 'faceSlim'
  | 'jawline'
  | 'chin'
  | 'eyeEnlarge'
  | 'eyeDistance'
  | 'noseSlim'
  | 'noseLength'
  | 'lipFullness'
  | 'smile'
  | 'forehead'
  | 'skinSmooth'
  | 'skinTone'
  | 'darkCircles'
  | 'teethWhiten'
  | 'eyeRetouch';

export const RESHAPE_TOOLS: { key: ReshapeTool; label: string; icon: string }[] = [
  { key: 'faceSlim', label: 'Face', icon: 'face-man-shimmer' },
  { key: 'jawline', label: 'Jawline', icon: 'triangle-outline' },
  { key: 'chin', label: 'Chin', icon: 'arrow-collapse-down' },
  { key: 'forehead', label: 'Forehead', icon: 'arrow-collapse-up' },
  { key: 'eyeEnlarge', label: 'Eye Size', icon: 'eye-outline' },
  { key: 'eyeDistance', label: 'Eye Dist', icon: 'arrow-expand-horizontal' },
  { key: 'noseSlim', label: 'Nose', icon: 'chevron-double-down' },
  { key: 'noseLength', label: 'Nose Len', icon: 'arrow-up-down' },
  { key: 'lipFullness', label: 'Lips', icon: 'lipstick' },
  { key: 'smile', label: 'Smile', icon: 'emoticon-happy-outline' },
  { key: 'skinSmooth', label: 'Smooth', icon: 'blur' },
  { key: 'skinTone', label: 'Skin Tone', icon: 'palette-outline' },
  { key: 'darkCircles', label: 'Dark Circles', icon: 'eye-off-outline' },
  { key: 'teethWhiten', label: 'Teeth', icon: 'tooth-outline' },
  { key: 'eyeRetouch', label: 'Eyes', icon: 'eye-plus-outline' },
];

export type FaceValues = Record<ReshapeTool, number>;

export const INITIAL_VALUES: FaceValues = {
  faceSlim: 0, jawline: 0, chin: 0, forehead: 0,
  eyeEnlarge: 0, eyeDistance: 0, noseSlim: 0, noseLength: 0,
  lipFullness: 0, smile: 0,
  skinSmooth: 0, skinTone: 0, darkCircles: 0, teethWhiten: 0, eyeRetouch: 0,
};

interface ReshapeState {
  /** Per-face slider values */
  allFaceValues: FaceValues[];
  /** Current selected face's values (shortcut) */
  values: FaceValues;
  selectedTool: ReshapeTool;
  selectedFaceIndex: number;
  faceCount: number;
  imageUri: string | null;
  imageWidth: number;
  imageHeight: number;
  /** Single mesh containing all faces */
  mesh: MultiFaceMesh | null;
  /** All detected face contours */
  detectedFaces: FaceContours[];

  setSelectedTool: (tool: ReshapeTool) => void;
  setValue: (tool: ReshapeTool, value: number) => void;
  resetTool: (tool: ReshapeTool) => void;
  resetAll: () => void;
  setImage: (uri: string, width: number, height: number) => void;
  setDetection: (faces: FaceContours[], mesh: MultiFaceMesh) => void;
  selectFace: (index: number) => void;
}

export const useReshapeStore = create<ReshapeState>((set) => ({
  allFaceValues: [],
  values: { ...INITIAL_VALUES },
  selectedTool: 'faceSlim',
  selectedFaceIndex: 0,
  faceCount: 0,
  imageUri: null,
  imageWidth: 1,
  imageHeight: 1,
  mesh: null,
  detectedFaces: [],

  setSelectedTool: (tool) => set({ selectedTool: tool }),

  setValue: (tool, value) =>
    set((state) => {
      const newValues = { ...state.values, [tool]: Math.round(value) };
      const newAll = [...state.allFaceValues];
      newAll[state.selectedFaceIndex] = newValues;
      return { values: newValues, allFaceValues: newAll };
    }),

  resetTool: (tool) =>
    set((state) => {
      const newValues = { ...state.values, [tool]: 0 };
      const newAll = [...state.allFaceValues];
      newAll[state.selectedFaceIndex] = newValues;
      return { values: newValues, allFaceValues: newAll };
    }),

  resetAll: () =>
    set((state) => ({
      values: { ...INITIAL_VALUES },
      allFaceValues: state.allFaceValues.map(() => ({ ...INITIAL_VALUES })),
    })),

  setImage: (uri, width, height) =>
    set({
      imageUri: uri, imageWidth: width, imageHeight: height,
      mesh: null, detectedFaces: [], allFaceValues: [],
      selectedFaceIndex: 0, faceCount: 0, values: { ...INITIAL_VALUES },
    }),

  setDetection: (faces, mesh) =>
    set({
      detectedFaces: faces,
      mesh,
      faceCount: faces.length,
      allFaceValues: faces.map(() => ({ ...INITIAL_VALUES })),
      selectedFaceIndex: 0,
      values: { ...INITIAL_VALUES },
    }),

  selectFace: (index) =>
    set((state) => ({
      selectedFaceIndex: index,
      values: state.allFaceValues[index] ?? { ...INITIAL_VALUES },
    })),
}));
