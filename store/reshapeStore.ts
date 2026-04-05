import { create } from 'zustand';
import type { FaceContours } from '@/lib/types';
import type { DeformationMesh } from '@/lib/meshDeformation';

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
  | 'forehead';

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
];

export type FaceValues = Record<ReshapeTool, number>;

interface ReshapeState {
  /** Per-face slider values — key is face index */
  faceValues: Record<number, FaceValues>;
  /** Current face's values (shortcut for faceValues[selectedFaceIndex]) */
  values: FaceValues;
  selectedTool: ReshapeTool;
  imageUri: string | null;
  imageWidth: number;
  imageHeight: number;
  faceContours: FaceContours | null;
  mesh: DeformationMesh | null;
  isDetecting: boolean;
  detectedFaces: FaceContours[];
  selectedFaceIndex: number;

  setSelectedTool: (tool: ReshapeTool) => void;
  setValue: (tool: ReshapeTool, value: number) => void;
  resetTool: (tool: ReshapeTool) => void;
  resetAll: () => void;
  setImage: (uri: string, width: number, height: number) => void;
  setFaceContours: (contours: FaceContours | null) => void;
  setMesh: (mesh: DeformationMesh | null) => void;
  setDetecting: (detecting: boolean) => void;
  setDetectedFaces: (faces: FaceContours[]) => void;
  selectFace: (index: number) => void;
}

const INITIAL_VALUES: FaceValues = {
  faceSlim: 0,
  jawline: 0,
  chin: 0,
  forehead: 0,
  eyeEnlarge: 0,
  eyeDistance: 0,
  noseSlim: 0,
  noseLength: 0,
  lipFullness: 0,
  smile: 0,
};

export const useReshapeStore = create<ReshapeState>((set) => ({
  faceValues: {},
  values: { ...INITIAL_VALUES },
  selectedTool: 'faceSlim',
  imageUri: null,
  imageWidth: 1,
  imageHeight: 1,
  faceContours: null,
  mesh: null,
  isDetecting: false,
  detectedFaces: [],
  selectedFaceIndex: 0,

  setSelectedTool: (tool) => set({ selectedTool: tool }),

  // Save value for current face
  setValue: (tool, value) =>
    set((state) => {
      const newValues = { ...state.values, [tool]: Math.round(value) };
      return {
        values: newValues,
        faceValues: { ...state.faceValues, [state.selectedFaceIndex]: newValues },
      };
    }),

  resetTool: (tool) =>
    set((state) => {
      const newValues = { ...state.values, [tool]: 0 };
      return {
        values: newValues,
        faceValues: { ...state.faceValues, [state.selectedFaceIndex]: newValues },
      };
    }),

  // Reset ALL faces
  resetAll: () =>
    set({ values: { ...INITIAL_VALUES }, faceValues: {} }),

  setImage: (uri, width, height) =>
    set({
      imageUri: uri,
      imageWidth: width,
      imageHeight: height,
      faceContours: null,
      mesh: null,
      values: { ...INITIAL_VALUES },
      faceValues: {},
      detectedFaces: [],
      selectedFaceIndex: 0,
    }),

  setFaceContours: (contours) => set({ faceContours: contours }),
  setMesh: (mesh) => set({ mesh }),
  setDetecting: (detecting) => set({ isDetecting: detecting }),
  setDetectedFaces: (faces) => set({ detectedFaces: faces }),

  // Switch face — load saved values for that face (or zeros if never edited)
  selectFace: (index) =>
    set((state) => ({
      selectedFaceIndex: index,
      values: state.faceValues[index] ?? { ...INITIAL_VALUES },
    })),
}));
