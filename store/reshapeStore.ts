import { create } from 'zustand';
import type { FaceContours } from '@/lib/types';
import type { DeformationMesh } from '@/lib/meshDeformation';

export type ReshapeTool = 'faceSlim' | 'eyeEnlarge' | 'noseSlim';

export const RESHAPE_TOOLS: { key: ReshapeTool; label: string }[] = [
  { key: 'faceSlim', label: 'Face Slim' },
  { key: 'eyeEnlarge', label: 'Eye Enlarge' },
  { key: 'noseSlim', label: 'Nose Slim' },
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
  eyeEnlarge: 0,
  noseSlim: 0,
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
