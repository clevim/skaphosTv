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
  // 4.6:1 sobre bg0 (era #5b5b63, 2.9:1 — ilegível a 3m da TV)
  text3: '#7a7a85',
  // Texto/ícone escuro sobre superfícies claras (botões brancos, chips ativos)
  textInverse: '#0a0a0b',

  // Status
  red: '#ef4444',
  green: '#22c55e',
  yellow: '#f59e0b',
  blue: '#3b82f6',
  white: '#ffffff',
  black: '#000000',

  // Live
  live: '#ef4444',

  // Estrela de favorito (mais clara que o yellow de status)
  favorite: '#facc15',


  overlay: 'rgba(0,0,0,0.7)',
};

// Vocabulário de elevação (DESIGN.md §4): tonal em repouso, relevo nas
// superfícies flutuantes, sombra máxima só no item focado (Salto de Foco).
export const shadow = {
  /** Exclusiva do elemento focado no D-pad (TVFocusable). */
  focus: { shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  /** Sheets, modais e popovers em repouso. */
  floating: { shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 16 },
  /** Cards de destaque (hero, MiniPlayer) em repouso. */
  ambient: { shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 6 },
} as const;

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

// Escala de fonte configurável (Ajustes > Reprodução) — não é um multiplicador
// global do app (o fontSize acima é usado em centenas de StyleSheet.create()
// estáticos, não reativos; refazer isso pra tudo exigiria sobrescrever o
// render interno do Text do RN, arriscado demais sem poder testar no
// aparelho). Aplicada só nas telas de texto denso: Ajustes, busca, guia.
export const UI_FONT_SCALE: Record<'small' | 'medium' | 'large', number> = {
  small: 0.9,
  medium: 1,
  large: 1.15,
};

// Geist font family — carregada via useGeistFonts() no App.tsx
export const fontFamily = {
  regular:  'Geist-Regular',
  medium:   'Geist-Medium',
  semiBold: 'Geist-SemiBold',
  bold:     'Geist-Bold',
} as const;
