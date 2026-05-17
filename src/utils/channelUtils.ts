export const LAUNCH_YEAR = new Date().getFullYear().toString();

export const YEAR_GROUPS = ['Filmes', 'Séries'] as const;

export const NAV_ITEMS = [
  { key: 'home',      label: 'Início',    icon: 'home-outline'   },
  { key: 'live',      label: 'Ao Vivo',   icon: 'radio-outline'  },
  { key: 'movies',    label: 'Filmes',    icon: 'film-outline'   },
  { key: 'series',    label: 'Séries',    icon: 'tv-outline'     },
  { key: 'year',      label: LAUNCH_YEAR, icon: 'star-outline'   },
  { key: 'favorites', label: 'Favoritos', icon: 'heart-outline'  },
  { key: 'search',    label: 'Busca',     icon: 'search-outline' },
];

/**
 * Detecta o tipo do conteúdo pela group-title do M3U.
 * ♦️/◆ no grupo → filmes ou séries (séries têm S##E## no nome).
 * Sem ♦ → ao vivo.
 */
export function detectType(group: string, name?: string): 'live' | 'movies' | 'series' {
  const clean = group.replace(/\uFE0F/g, ''); // normaliza ♦️ → ♦
  if (clean.includes('♦') || clean.includes('◆')) {
    if (name && /S\d+\s*E\d+/i.test(name)) return 'series';
    return 'movies';
  }
  return 'live';
}

export function getSeriesBaseName(name: string): string {
  return name
    .replace(/\s*[-–]?\s*S\d+\s*E\d+.*$/i, '')
    .replace(/\s*[-–]?\s*S\d+\s*$/i, '')
    .replace(/\s*[-–]?\s*T\d+\s*$/i, '')
    .replace(/\s*\(\d{4}\)\s*$/, '')
    .trim();
}

/**
 * Retorna true se o canal é do ano de lançamento atual.
 * Verifica o nome primeiro (ex: "Filme (2026)", "Filme [2026]", "Filme 2026"),
 * e em seguida o releaseDate (ex: "2026-05-01", "2026", "01/2026").
 */
export function isLaunchYear(name: string, releaseDate?: string): boolean {
  if (
    name.includes(`(${LAUNCH_YEAR})`) ||
    name.includes(`[${LAUNCH_YEAR}]`) ||
    new RegExp(`\\b${LAUNCH_YEAR}\\b`).test(name)
  ) return true;

  if (releaseDate) {
    return new RegExp(`\\b${LAUNCH_YEAR}\\b`).test(releaseDate);
  }
  return false;
}
