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

interface ReshapeState {
  values: Record<ReshapeTool, number>;
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
  detectedFaces: [],
  selectedFaceIndex: 0,

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
      detectedFaces: [],
      selectedFaceIndex: 0,
    }),

  setFaceContours: (contours) => set({ faceContours: contours }),
  setMesh: (mesh) => set({ mesh }),
  setDetecting: (detecting) => set({ isDetecting: detecting }),
  setDetectedFaces: (faces) => set({ detectedFaces: faces }),
  selectFace: (index) =>
    set({ selectedFaceIndex: index, values: { ...INITIAL_VALUES } }),
}));
