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

// Datas comemorativas (mês 0-indexado, igual Date.getMonth()) — janela de dias
// em que o preset sazonal substitui automaticamente a escolha manual do
// usuário, sem sobrescrevê-la (volta pro preset manual sozinho ao passar a data).
interface SeasonalPreset extends ThemePreset {
  startMonth: number; startDay: number;
  endMonth: number; endDay: number;
}

const SEASONAL_PRESETS: SeasonalPreset[] = [
  {
    key: 'christmas', label: 'Natal', primary: '#dc2626', accent: '#16a34a',
    startMonth: 11, startDay: 1, endMonth: 11, endDay: 26,
  },
  {
    key: 'halloween', label: 'Halloween', primary: '#ea580c', accent: '#7c3aed',
    startMonth: 9, startDay: 24, endMonth: 9, endDay: 31,
  },
];

function getSeasonalPreset(now = new Date()): ThemePreset | null {
  const m = now.getMonth();
  const d = now.getDate();
  for (const s of SEASONAL_PRESETS) {
    if (m === s.startMonth && m === s.endMonth) {
      if (d >= s.startDay && d <= s.endDay) return s;
    }
  }
  return null;
}

interface ThemeState {
  /** Preset EFETIVO (o que a UI deve usar) — sazonal, se ativo, senão o manual. */
  preset: ThemePreset;
  /** Última escolha manual do usuário — preservada mesmo com o sazonal ativo. */
  manualPreset: ThemePreset;
  seasonalEnabled: boolean;
  setPreset: (preset: ThemePreset) => Promise<void>;
  setSeasonalEnabled: (enabled: boolean) => Promise<void>;
  loadTheme: () => Promise<void>;
}

const STORAGE_KEY = '@skaphostv_theme';
const SEASONAL_KEY = '@skaphostv_theme_seasonal_enabled';

function effectivePreset(manual: ThemePreset, seasonalEnabled: boolean): ThemePreset {
  if (!seasonalEnabled) return manual;
  return getSeasonalPreset() ?? manual;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  preset: DEFAULT_THEME,
  manualPreset: DEFAULT_THEME,
  seasonalEnabled: true,

  setPreset: async (preset) => {
    set({ manualPreset: preset, preset: effectivePreset(preset, get().seasonalEnabled) });
    try {
      await AsyncStorage.setItem(STORAGE_KEY, preset.key);
    } catch (_) {}
  },

  setSeasonalEnabled: async (enabled) => {
    set({ seasonalEnabled: enabled, preset: effectivePreset(get().manualPreset, enabled) });
    try {
      await AsyncStorage.setItem(SEASONAL_KEY, enabled ? '1' : '0');
    } catch (_) {}
  },

  loadTheme: async () => {
    try {
      const [key, seasonalRaw] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEY),
        AsyncStorage.getItem(SEASONAL_KEY),
      ]);
      const manual = (key && THEME_PRESETS.find(p => p.key === key)) || DEFAULT_THEME;
      const seasonalEnabled = seasonalRaw !== '0'; // default true na primeira vez
      set({ manualPreset: manual, seasonalEnabled, preset: effectivePreset(manual, seasonalEnabled) });
    } catch (_) {}
  },
}));
