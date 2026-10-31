import { colors } from '../utils/theme';
import { useThemeStore, ThemePreset } from '../store/useThemeStore';

const hexRgb = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

/** '#rrggbb' + alpha -> 'rgba(r,g,b,a)'. */
export const withAlpha = (hex: string, a: number) => `rgba(${hexRgb(hex).join(',')},${a})`;

// Luminância relativa WCAG. >= 0.2 dá ~4.5:1 contra o bg0 (AA para texto).
function luminance(hex: string) {
  const [r, g, b] = hexRgb(hex).map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export interface AccentColors {
  /** Cor legível sobre fundo escuro (texto/ícone/foco/fill): primary, ou accent do preset se o primary for escuro. */
  accent: string;
  /** Variante clara (glow, ring de foco). */
  accent2: string;
  /** Preenchimento forte (botão primário) — leva texto branco. */
  accent3: string;
  accentSoft: string;
}

// Cache por objeto de preset: identidade estável sem useMemo (presets são constantes do store).
const cache = new WeakMap<ThemePreset, AccentColors>();

export function accentFor(p: ThemePreset): AccentColors {
  let c = cache.get(p);
  if (!c) {
    // ponytail: Violeta fixa nos valores estáticos (accent3 #7c3aed != primary) p/ default idêntico.
    const violet = p.key === 'violet';
    const accent = violet || luminance(p.primary) >= 0.2 ? p.primary : p.accent;
    c = {
      accent,
      accent2: p.accent,
      accent3: violet ? colors.accent3 : p.primary,
      accentSoft: withAlpha(accent, 0.16),
    };
    cache.set(p, c);
  }
  return c;
}

/** Seletor narrow (objeto de preset estável) -> cores de acento memoizadas. */
export const useAccentColors = () => accentFor(useThemeStore(s => s.preset));
