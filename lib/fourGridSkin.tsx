import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type FourGridSkin = 'postit' | 'whiteboard';

const STORAGE_KEY = 'four_grid_skin_v1';
const DEFAULT_SKIN: FourGridSkin = 'postit';

export interface FourGridTheme {
  pageBg: string;
  cellBg: string;
  cellBorderColor: string;
  cellBorderWidth: number;
  cellBorderRadius: number;
  cellShadowColor: string;
  cellShadowOffset: { width: number; height: number };
  cellShadowOpacity: number;
  cellShadowRadius: number;
  cellElevation: number;
  titleColor: string;
  titleFontStyle: 'normal' | 'italic';
  titleFontWeight: '400' | '500' | '600' | '700';
  titleUnderline: boolean;
  titleUnderlineStyle?: 'solid' | 'dashed' | 'dotted';
  titleUnderlineColor?: string;
  titleLetterSpacing: number;
  progressTrack: string;
  progressTrackBorder: string;
  progressTrackBorderWidth: number;
  progressFill: string;
  progressBarRadius: number;
  todoBg: string;
  todoBorderLeftColor: string;
  todoBorderLeftWidth: number;
  todoBorderRadius: number;
  todoTextColor: string;
  todoTextCompletedColor: string;
  todoDraggingBg: string;
  inlineAddColor: string;
  inlineAddBorder: string;
  inlineAddPlaceholder: string;
  showGridPattern: boolean;
  gridPatternDotColor: string;
}

export const POSTIT_THEME: FourGridTheme = {
  pageBg: '#f5f5dc',
  cellBg: '#fffacd',
  cellBorderColor: '#f0e68c',
  cellBorderWidth: 0.5,
  cellBorderRadius: 2,
  cellShadowColor: '#000',
  cellShadowOffset: { width: 2, height: 2 },
  cellShadowOpacity: 0.15,
  cellShadowRadius: 3,
  cellElevation: 3,
  titleColor: '#2c3e50',
  titleFontStyle: 'italic',
  titleFontWeight: '400',
  titleUnderline: true,
  titleUnderlineStyle: 'dashed',
  titleUnderlineColor: '#e74c3c',
  titleLetterSpacing: 0,
  progressTrack: '#f5f5dc',
  progressTrackBorder: '#d4af37',
  progressTrackBorderWidth: 1,
  progressFill: '#ff6b6b',
  progressBarRadius: 2,
  todoBg: 'rgba(255, 255, 255, 0.3)',
  todoBorderLeftColor: '#ff6b6b',
  todoBorderLeftWidth: 3,
  todoBorderRadius: 4,
  todoTextColor: '#2c3e50',
  todoTextCompletedColor: '#7f8c8d',
  todoDraggingBg: '#fffacd',
  inlineAddColor: '#2c3e50',
  inlineAddBorder: 'rgba(212, 175, 55, 0.3)',
  inlineAddPlaceholder: '#bdc3c7',
  showGridPattern: false,
  gridPatternDotColor: 'transparent',
};

export const WHITEBOARD_THEME: FourGridTheme = {
  pageBg: '#f1f5f9',
  cellBg: '#ffffff',
  cellBorderColor: '#dbe2ea',
  cellBorderWidth: 1,
  cellBorderRadius: 12,
  cellShadowColor: '#0f172a',
  cellShadowOffset: { width: 0, height: 2 },
  cellShadowOpacity: 0.08,
  cellShadowRadius: 8,
  cellElevation: 2,
  titleColor: '#0f172a',
  titleFontStyle: 'normal',
  titleFontWeight: '600',
  titleUnderline: false,
  titleLetterSpacing: 0.3,
  progressTrack: '#eef2f7',
  progressTrackBorder: '#cbd5e1',
  progressTrackBorderWidth: 0,
  progressFill: '#3b82f6',
  progressBarRadius: 4,
  todoBg: 'rgba(241, 245, 249, 0.85)',
  todoBorderLeftColor: '#3b82f6',
  todoBorderLeftWidth: 3,
  todoBorderRadius: 8,
  todoTextColor: '#0f172a',
  todoTextCompletedColor: '#94a3b8',
  todoDraggingBg: '#ffffff',
  inlineAddColor: '#0f172a',
  inlineAddBorder: 'rgba(59, 130, 246, 0.3)',
  inlineAddPlaceholder: '#94a3b8',
  showGridPattern: true,
  gridPatternDotColor: '#cbd5e1',
};

export function getThemeForSkin(skin: FourGridSkin): FourGridTheme {
  return skin === 'whiteboard' ? WHITEBOARD_THEME : POSTIT_THEME;
}

interface FourGridSkinContextValue {
  skin: FourGridSkin;
  setSkin: (next: FourGridSkin) => Promise<void>;
  loaded: boolean;
}

const FourGridSkinContext = createContext<FourGridSkinContextValue>({
  skin: DEFAULT_SKIN,
  setSkin: async () => {},
  loaded: false,
});

export function FourGridSkinProvider({ children }: { children: React.ReactNode }) {
  const [skin, setSkinState] = useState<FourGridSkin>(DEFAULT_SKIN);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(value => {
        if (value === 'whiteboard' || value === 'postit') {
          setSkinState(value);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const setSkin = useCallback(async (next: FourGridSkin) => {
    setSkinState(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, next);
    } catch {}
  }, []);

  return (
    <FourGridSkinContext.Provider value={{ skin, setSkin, loaded }}>
      {children}
    </FourGridSkinContext.Provider>
  );
}

export function useFourGridSkin() {
  return useContext(FourGridSkinContext);
}
