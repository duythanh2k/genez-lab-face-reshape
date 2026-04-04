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

export const RESHAPE_TOOLS: { key: ReshapeTool; label: string }[] = [
  { key: 'faceSlim', label: 'Face Slim' },
  { key: 'jawline', label: 'Jawline' },
  { key: 'chin', label: 'Chin' },
  { key: 'forehead', label: 'Forehead' },
  { key: 'eyeEnlarge', label: 'Eye Size' },
  { key: 'eyeDistance', label: 'Eye Dist' },
  { key: 'noseSlim', label: 'Nose Slim' },
  { key: 'noseLength', label: 'Nose Len' },
  { key: 'lipFullness', label: 'Lips' },
  { key: 'smile', label: 'Smile' },
];

interface ReshapeState {
  values: Record<ReshapeTool, number>;
  selectedTool: ReshapeTool;
  imageUri: string | null;
  imageWidth: number;
  imageHeight: number;
  faceContours: FaceContours | null;
  mesh: DeformationMesh | null;
  isDetecting: boolean;

  setSelectedTool: (tool: ReshapeTool) => void;
  setValue: (tool: ReshapeTool, value: number) => void;
  resetTool: (tool: ReshapeTool) => void;
  resetAll: () => void;
  setImage: (uri: string, width: number, height: number) => void;
  setFaceContours: (contours: FaceContours | null) => void;
  setMesh: (mesh: DeformationMesh | null) => void;
  setDetecting: (detecting: boolean) => void;
}

const INITIAL_VALUES: Record<ReshapeTool, number> = {
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
  values: { ...INITIAL_VALUES },
  selectedTool: 'faceSlim',
  imageUri: null,
  imageWidth: 1,
  imageHeight: 1,
  faceContours: null,
  mesh: null,
  isDetecting: false,

  setSelectedTool: (tool) => set({ selectedTool: tool }),

  setValue: (tool, value) =>
    set((state) => ({
      values: { ...state.values, [tool]: Math.round(value) },
    })),

  resetTool: (tool) =>
    set((state) => ({
      values: { ...state.values, [tool]: 0 },
    })),

  resetAll: () => set({ values: { ...INITIAL_VALUES } }),

  setImage: (uri, width, height) =>
    set({
      imageUri: uri,
      imageWidth: width,
      imageHeight: height,
      faceContours: null,
      mesh: null,
      values: { ...INITIAL_VALUES },
    }),

  setFaceContours: (contours) => set({ faceContours: contours }),
  setMesh: (mesh) => set({ mesh }),
  setDetecting: (detecting) => set({ isDetecting: detecting }),
}));
