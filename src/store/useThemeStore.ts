import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface ThemePreset {
  key: string;
  label: string;
  primary: string;   // cor principal
  accent: string;    // cor secundária/glow
}

export const THEME_PRESETS: ThemePreset[] = [
  { key: 'violet',   label: 'Violeta',   primary: '#a78bfa', accent: '#c4b5fd' },
  { key: 'rose',     label: 'Rosa',      primary: '#e11d48', accent: '#fb7185' },
  { key: 'cyan',     label: 'Ciano',     primary: '#0891b2', accent: '#22d3ee' },
  { key: 'emerald',  label: 'Verde',     primary: '#059669', accent: '#34d399' },
  { key: 'amber',    label: 'Âmbar',     primary: '#d97706', accent: '#fbbf24' },
  { key: 'indigo',   label: 'Índigo',    primary: '#4338ca', accent: '#818cf8' },
  { key: 'orange',   label: 'Laranja',   primary: '#ea580c', accent: '#fb923c' },
  { key: 'pink',     label: 'Pink',      primary: '#db2777', accent: '#f472b6' },
];

export const DEFAULT_THEME = THEME_PRESETS[0];

interface ThemeState {
  preset: ThemePreset;
  setPreset: (preset: ThemePreset) => Promise<void>;
  loadTheme: () => Promise<void>;
}

const STORAGE_KEY = '@skaphostv_theme';

export const useThemeStore = create<ThemeState>((set) => ({
  preset: DEFAULT_THEME,

  setPreset: async (preset) => {
    set({ preset });
    try {
      await AsyncStorage.setItem(STORAGE_KEY, preset.key);
    } catch (_) {}
  },

  loadTheme: async () => {
    try {
      const key = await AsyncStorage.getItem(STORAGE_KEY);
      if (key) {
        const found = THEME_PRESETS.find(p => p.key === key);
        if (found) set({ preset: found });
      }
    } catch (_) {}
  },
}));