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

export const INITIAL_VALUES: FaceValues = {
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

/** Data for one detected face */
export interface FaceData {
  contours: FaceContours;
  mesh: DeformationMesh;
  values: FaceValues;
}

interface ReshapeState {
  /** All detected faces with their meshes and per-face values */
  faces: FaceData[];
  /** Currently selected face index for slider interaction */
  selectedFaceIndex: number;
  /** Current face's values (shortcut) */
  values: FaceValues;
  selectedTool: ReshapeTool;
  imageUri: string | null;
  imageWidth: number;
  imageHeight: number;
  isDetecting: boolean;

  setSelectedTool: (tool: ReshapeTool) => void;
  setValue: (tool: ReshapeTool, value: number) => void;
  resetTool: (tool: ReshapeTool) => void;
  resetAll: () => void;
  setImage: (uri: string, width: number, height: number) => void;
  setDetecting: (detecting: boolean) => void;
  /** Set all detected faces (builds meshes externally, passed in) */
  setFaces: (faces: FaceData[]) => void;
  /** Switch to a different face — loads its saved values */
  selectFace: (index: number) => void;
}

export const useReshapeStore = create<ReshapeState>((set) => ({
  faces: [],
  selectedFaceIndex: 0,
  values: { ...INITIAL_VALUES },
  selectedTool: 'faceSlim',
  imageUri: null,
  imageWidth: 1,
  imageHeight: 1,
  isDetecting: false,

  setSelectedTool: (tool) => set({ selectedTool: tool }),

  // Save value for current face
  setValue: (tool, value) =>
    set((state) => {
      const newValues = { ...state.values, [tool]: Math.round(value) };
      const newFaces = [...state.faces];
      if (newFaces[state.selectedFaceIndex]) {
        newFaces[state.selectedFaceIndex] = {
          ...newFaces[state.selectedFaceIndex],
          values: newValues,
        };
      }
      return { values: newValues, faces: newFaces };
    }),

  resetTool: (tool) =>
    set((state) => {
      const newValues = { ...state.values, [tool]: 0 };
      const newFaces = [...state.faces];
      if (newFaces[state.selectedFaceIndex]) {
        newFaces[state.selectedFaceIndex] = {
          ...newFaces[state.selectedFaceIndex],
          values: newValues,
        };
      }
      return { values: newValues, faces: newFaces };
    }),

  // Reset ALL faces
  resetAll: () =>
    set((state) => ({
      values: { ...INITIAL_VALUES },
      faces: state.faces.map((f) => ({ ...f, values: { ...INITIAL_VALUES } })),
    })),

  setImage: (uri, width, height) =>
    set({
      imageUri: uri,
      imageWidth: width,
      imageHeight: height,
      faces: [],
      selectedFaceIndex: 0,
      values: { ...INITIAL_VALUES },
    }),

  setDetecting: (detecting) => set({ isDetecting: detecting }),

  setFaces: (faces) =>
    set({
      faces,
      selectedFaceIndex: 0,
      values: faces[0]?.values ?? { ...INITIAL_VALUES },
    }),

  // Switch face — load that face's saved values
  selectFace: (index) =>
    set((state) => ({
      selectedFaceIndex: index,
      values: state.faces[index]?.values ?? { ...INITIAL_VALUES },
    })),
}));
