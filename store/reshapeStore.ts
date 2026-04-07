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

/** Tool key used in UI (ReshapeTool + special 'lipstick' makeup tool). */
export type ToolKey = ReshapeTool | 'lipstick';

export const RESHAPE_TOOLS: { key: ToolKey; label: string; icon: string }[] = [
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
  { key: 'lipstick', label: 'Lipstick', icon: 'lipstick' },
];

/** Lipstick palette — 12 trending colors (2025 trends, one pink variant only) */
export const LIPSTICK_COLORS: { name: string; hex: string }[] = [
  { name: 'Nude', hex: '#C68B7B' },
  { name: 'Burnt Terracotta', hex: '#A0522D' },
  { name: 'MLBB', hex: '#B56B6B' },
  { name: 'Brown Nude', hex: '#8B5A4A' },
  { name: 'Chocolate Brown', hex: '#5C3222' },
  { name: 'Mauve', hex: '#9B6B7A' },
  { name: 'Mulberry', hex: '#7A2D42' },
  { name: 'Black Cherry', hex: '#4A0E1F' },
  { name: 'Wine', hex: '#6B1E30' },
  { name: 'Brick Red', hex: '#9C2A2A' },
  { name: 'Classic Red', hex: '#C4233C' },
  { name: 'Glossy Pink', hex: '#E8526A' },
];

export interface LipstickState {
  colorIndex: number; // 0-11, index into LIPSTICK_COLORS
  intensity: number; // 0-100, opacity
}

/** Per-face slider + makeup values (explicit interface, NOT a Record) */
export interface FaceValues {
  faceSlim: number;
  jawline: number;
  chin: number;
  forehead: number;
  eyeEnlarge: number;
  eyeDistance: number;
  noseSlim: number;
  noseLength: number;
  lipFullness: number;
  smile: number;
  skinSmooth: number;
  skinTone: number;
  darkCircles: number;
  teethWhiten: number;
  eyeRetouch: number;
  lipstick: LipstickState;
}

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
  skinSmooth: 0,
  skinTone: 0,
  darkCircles: 0,
  teethWhiten: 0,
  eyeRetouch: 0,
  lipstick: { colorIndex: 0, intensity: 0 },
};

/** Create a fresh copy of INITIAL_VALUES (deep copy for lipstick nested object) */
function freshInitial(): FaceValues {
  return { ...INITIAL_VALUES, lipstick: { ...INITIAL_VALUES.lipstick } };
}

interface ReshapeState {
  /** Per-face values */
  allFaceValues: FaceValues[];
  /** Current selected face's values (shortcut) */
  values: FaceValues;
  selectedTool: ToolKey;
  selectedFaceIndex: number;
  faceCount: number;
  imageUri: string | null;
  imageWidth: number;
  imageHeight: number;
  mesh: MultiFaceMesh | null;
  detectedFaces: FaceContours[];

  setSelectedTool: (tool: ToolKey) => void;
  setValue: (tool: ReshapeTool, value: number) => void;
  resetTool: (tool: ReshapeTool) => void;
  resetAll: () => void;
  setImage: (uri: string, width: number, height: number) => void;
  setDetection: (faces: FaceContours[], mesh: MultiFaceMesh) => void;
  selectFace: (index: number) => void;
  // Lipstick-specific actions
  setLipstickColor: (colorIndex: number) => void;
  setLipstickIntensity: (value: number) => void;
  resetLipstick: () => void;
}

export const useReshapeStore = create<ReshapeState>((set) => ({
  allFaceValues: [],
  values: freshInitial(),
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
      values: freshInitial(),
      allFaceValues: state.allFaceValues.map(() => freshInitial()),
    })),

  setImage: (uri, width, height) =>
    set({
      imageUri: uri,
      imageWidth: width,
      imageHeight: height,
      mesh: null,
      detectedFaces: [],
      allFaceValues: [],
      selectedFaceIndex: 0,
      faceCount: 0,
      values: freshInitial(),
    }),

  setDetection: (faces, mesh) =>
    set({
      detectedFaces: faces,
      mesh,
      faceCount: faces.length,
      allFaceValues: faces.map(() => freshInitial()),
      selectedFaceIndex: 0,
      values: freshInitial(),
    }),

  selectFace: (index) =>
    set((state) => ({
      selectedFaceIndex: index,
      values: state.allFaceValues[index] ?? freshInitial(),
    })),

  setLipstickColor: (colorIndex) =>
    set((state) => {
      const newLipstick = { ...state.values.lipstick, colorIndex };
      const newValues = { ...state.values, lipstick: newLipstick };
      const newAll = [...state.allFaceValues];
      newAll[state.selectedFaceIndex] = newValues;
      return { values: newValues, allFaceValues: newAll };
    }),

  setLipstickIntensity: (value) =>
    set((state) => {
      const intensity = Math.max(0, Math.min(100, Math.round(value)));
      const newLipstick = { ...state.values.lipstick, intensity };
      const newValues = { ...state.values, lipstick: newLipstick };
      const newAll = [...state.allFaceValues];
      newAll[state.selectedFaceIndex] = newValues;
      return { values: newValues, allFaceValues: newAll };
    }),

  resetLipstick: () =>
    set((state) => {
      const newValues = {
        ...state.values,
        lipstick: { colorIndex: 0, intensity: 0 },
      };
      const newAll = [...state.allFaceValues];
      newAll[state.selectedFaceIndex] = newValues;
      return { values: newValues, allFaceValues: newAll };
    }),
}));
