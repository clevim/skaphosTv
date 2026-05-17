export const colors = {
  // Neutrals (cool zinc with violet whisper — from design)
  bg0: '#0a0810',
  bg1: '#14111c',
  bg2: '#1a1626',
  bg3: '#28232f',
  bgSoft: '#1c1a23',

  // Accent (deep violet, matching the logo)
  accent: '#a78bfa',
  accent2: '#c4b5fd',
  accent3: '#7c3aed',
  accentSoft: 'rgba(167,139,250,0.16)',

  border: '#28232f',
  borderSoft: '#1c1a23',
  borderHover: 'rgba(167,139,250,0.5)',

  text1: '#f4f4f5',
  text2: '#a1a1aa',
  text3: '#5b5b63',

  // Status
  red: '#ef4444',
  green: '#22c55e',
  yellow: '#f59e0b',
  blue: '#3b82f6',
  white: '#ffffff',
  black: '#000000',

  // Live
  live: '#ef4444',

  overlay: 'rgba(0,0,0,0.7)',
  overlayDark: 'rgba(0,0,0,0.9)',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 999,
};

export const fontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 18,
  xl: 22,
  xxl: 28,
  hero: 36,
};

// Geist font family — carregada via useGeistFonts() no App.tsx
export const fontFamily = {
  regular:  'Geist-Regular',
  medium:   'Geist-Medium',
  semiBold: 'Geist-SemiBold',
  bold:     'Geist-Bold',
} as const;

export const TV_FOCUS_STYLE = {
  transform: [{ scale: 1.06 }],
  borderColor: colors.accent,
  borderWidth: 2,
  shadowColor: colors.accent,
  shadowOpacity: 0.5,
  shadowRadius: 13,
  elevation: 10,
};
