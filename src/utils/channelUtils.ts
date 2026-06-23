import type { Channel } from '../types';

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

/**
 * Tipo efetivo do conteúdo, normalizado para 'live' | 'movies' | 'series'.
 * Xtream/Jellyfin definem `streamType` ('live'|'movie'|'series') explicitamente — tem
 * precedência sobre a heurística por group-title (detectType). Só quando não há
 * `streamType` (ex.: M3U puro) caímos no detectType. Evita série marcada como "Filme".
 */
export function resolveContentType(channel: Channel): 'live' | 'movies' | 'series' {
  switch (channel.streamType) {
    case 'series': return 'series';
    case 'movie':  return 'movies';
    case 'live':   return 'live';
    default:       return detectType(channel.group || '', channel.name);
  }
}

/**
 * Detecta a qualidade a partir de uma string livre (nome e/ou URL do stream).
 * Fonte única — antes havia 3 cópias divergentes (m3uParser, xtreamLoader, phased).
 */
export function detectQuality(str: string): string {
  const s = str.toUpperCase();
  if (s.includes('4K') || s.includes('UHD') || s.includes('2160')) return '4K';
  if (s.includes('FHD') || s.includes('1080')) return 'FHD';
  if (s.includes('HD') || s.includes('720')) return 'HD';
  if (s.includes('SD') || s.includes('480')) return 'SD';
  return 'HD';
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
