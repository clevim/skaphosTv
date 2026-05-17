/**
 * channelIndex — índice pré-computado da lista de canais.
 *
 * Construído uma única vez quando a lista é carregada (setChannels / appendChannels / cache).
 * Todas as operações de filtro passam de O(n) para O(1) via lookup no Map.
 *
 * Para 30 000 canais a construção leva ~30-50 ms (passe único, operações O(1) por canal).
 */

import { Channel } from '../types';
import { detectType, getSeriesBaseName, isLaunchYear, YEAR_GROUPS } from '../utils/channelUtils';

export interface ChannelIndex {
  // Listas pré-filtradas por tipo (sem duplicatas de séries)
  live:    Channel[];
  movies:  Channel[];
  series:  Channel[];   // um item por série (base name único)

  // Lookups O(1) por grupo
  byGroup:       Map<string, Channel[]>;   // canais brutos do grupo
  seriesByGroup: Map<string, Channel[]>;   // séries deduplicadas por grupo

  // Listas de grupos pré-filtradas por tipo (para sidebar)
  liveGroups:    string[];
  movieGroups:   string[];
  seriesGroups:  string[];

  // Contagem de episódios por série
  episodeCountMap: Map<string, number>;

  // Aba "Ano" pré-filtrada
  yearMovies: Channel[];
  yearSeries: Channel[];   // deduplicado

  // Contagens para badges de navegação
  counts: { live: number; movies: number; series: number; year: number };
}

const EMPTY_INDEX: ChannelIndex = {
  live: [], movies: [], series: [],
  byGroup: new Map(), seriesByGroup: new Map(),
  liveGroups: [], movieGroups: [], seriesGroups: [],
  episodeCountMap: new Map(),
  yearMovies: [], yearSeries: [],
  counts: { live: 0, movies: 0, series: 0, year: 0 },
};

export function buildChannelIndex(channels: Channel[]): ChannelIndex {
  if (channels.length === 0) return EMPTY_INDEX;

  const live:      Channel[] = [];
  const movies:    Channel[] = [];
  const allSeries: Channel[] = [];

  const byGroup    = new Map<string, Channel[]>();
  const groupTypes = new Map<string, Set<'live' | 'movies' | 'series'>>();
  const episodeCountMap = new Map<string, number>();

  const yearMoviesArr: Channel[] = [];
  const yearSeriesRaw: Channel[] = [];

  // ── Passe único ─────────────────────────────────────────────────────────────
  for (const c of channels) {
    // Prefer explicit streamType from Xtream API; fall back to heuristic for M3U
    const type: 'live' | 'movies' | 'series' =
      c.streamType === 'live'   ? 'live'
      : c.streamType === 'movie'  ? 'movies'
      : c.streamType === 'series' ? 'series'
      : detectType(c.group || '', c.name);
    const group = c.group || '';

    // byGroup
    let arr = byGroup.get(group);
    if (!arr) { arr = []; byGroup.set(group, arr); }
    arr.push(c);

    // groupTypes
    let ts = groupTypes.get(group);
    if (!ts) { ts = new Set(); groupTypes.set(group, ts); }
    ts.add(type);

    if (type === 'live') {
      live.push(c);

    } else if (type === 'movies') {
      movies.push(c);
      if (isLaunchYear(c.name, c.releaseDate)) yearMoviesArr.push(c);

    } else {
      allSeries.push(c);
      const base = getSeriesBaseName(c.name);
      episodeCountMap.set(base, (episodeCountMap.get(base) || 0) + 1);
      if (isLaunchYear(c.name, c.releaseDate)) yearSeriesRaw.push(c);
    }
  }

  // ── Dedup global de séries ────────────────────────────────────────────────
  const seen = new Set<string>();
  const series = allSeries.filter(c => {
    const b = getSeriesBaseName(c.name);
    if (seen.has(b)) return false;
    seen.add(b);
    return true;
  });

  // ── seriesByGroup: deduplicado por grupo ─────────────────────────────────
  const seriesByGroup = new Map<string, Channel[]>();
  for (const [group, chans] of byGroup) {
    if (!groupTypes.get(group)?.has('series')) continue;
    const gSeen = new Set<string>();
    seriesByGroup.set(
      group,
      chans.filter(c => {
        const t = c.streamType === 'series' ? 'series'
          : c.streamType === 'live' ? 'live'
          : c.streamType === 'movie' ? 'movies'
          : detectType(c.group || '', c.name);
        if (t !== 'series') return false;
        const b = getSeriesBaseName(c.name);
        if (gSeen.has(b)) return false;
        gSeen.add(b);
        return true;
      }),
    );
  }

  // ── Year series deduplicado ────────────────────────────────────────────────
  const ySeen = new Set<string>();
  const yearSeries = yearSeriesRaw.filter(c => {
    const b = getSeriesBaseName(c.name);
    if (ySeen.has(b)) return false;
    ySeen.add(b);
    return true;
  });

  // ── Grupos por tipo ────────────────────────────────────────────────────────
  const liveGroups:   string[] = [];
  const movieGroups:  string[] = [];
  const seriesGroups: string[] = [];

  for (const [group, types] of groupTypes) {
    if (types.has('live'))    liveGroups.push(group);
    if (types.has('movies'))  movieGroups.push(group);
    if (types.has('series'))  seriesGroups.push(group);
  }

  return {
    live,
    movies,
    series,
    byGroup,
    seriesByGroup,
    liveGroups,
    movieGroups,
    seriesGroups,
    episodeCountMap,
    yearMovies: yearMoviesArr,
    yearSeries,
    counts: {
      live:   live.length,
      movies: movies.length,
      series: series.length,
      year:   yearMoviesArr.length + yearSeries.length,
    },
  };
}
