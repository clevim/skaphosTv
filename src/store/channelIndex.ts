/**
 * channelIndex — índice pré-computado da lista de canais.
 *
 * Construído uma única vez quando a lista é carregada (setChannels / appendChannels / cache).
 * Todas as operações de filtro passam de O(n) para O(1) via lookup no Map.
 *
 * ponytail: pra catálogos grandes (Xtream com dezenas de milhares de itens,
 * rebuilds a cada fase — Ao Vivo/Filmes/Séries), mesmo um passe único síncrono
 * trava a thread por tempo suficiente pra travar o app/dar ANR num device
 * fraco (Firestick). Async + yield a cada 2000 itens no passe principal.
 */

import { Channel } from '../types';
import { resolveContentType, getSeriesBaseName, isLaunchYear, YEAR_GROUPS, yieldToUI } from '../utils/channelUtils';
import type { IPTVSource } from './useStore';

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

  // Gêneros mais frequentes entre filmes/séries (campo `genre` da API, dividido
  // por vírgula) — pra carrosséis tipo "Recomendados por gênero" na Home.
  // Ordenado por quantidade, só gêneros com pelo menos 4 itens.
  topGenres: { genre: string; channels: Channel[] }[];

  // Mapa cru gênero→canais (capado) — só existe pra mergeChannelIndexes poder
  // recompor o topGenres global a partir dos índices parciais por fonte.
  genreMap: Map<string, Channel[]>;

  // Contagens para badges de navegação
  counts: { live: number; movies: number; series: number; year: number };
}

const EMPTY_INDEX: ChannelIndex = {
  live: [], movies: [], series: [],
  byGroup: new Map(), seriesByGroup: new Map(),
  liveGroups: [], movieGroups: [], seriesGroups: [],
  episodeCountMap: new Map(),
  yearMovies: [], yearSeries: [],
  topGenres: [],
  genreMap: new Map(),
  counts: { live: 0, movies: 0, series: 0, year: 0 },
};

export async function buildChannelIndex(channels: Channel[], sources: IPTVSource[] = []): Promise<ChannelIndex> {
  if (channels.length === 0) return EMPTY_INDEX;

  // Overrides manuais de tipo (Ajustes > Corrigir categorias), indexados por fonte
  // pra lookup O(1) no passe principal — a maioria das fontes não tem nenhum.
  const overridesBySource = new Map<string, Record<string, 'live' | 'movies' | 'series'>>();
  for (const s of sources) {
    if (s.groupTypeOverrides) overridesBySource.set(s.id, s.groupTypeOverrides);
  }

  const live:      Channel[] = [];
  const movies:    Channel[] = [];
  const allSeries: Channel[] = [];

  const byGroup    = new Map<string, Channel[]>();
  const groupTypes = new Map<string, Set<'live' | 'movies' | 'series'>>();
  const episodeCountMap = new Map<string, number>();

  const yearMoviesArr: Channel[] = [];
  const yearSeriesRaw: Channel[] = [];

  // genre (string "Ação, Aventura" da API) → canais únicos daquele gênero.
  // Cap por gênero evita um gênero gigante (ex.: "Drama") inflar memória/render.
  const GENRE_CAP = 30;
  const genreMap = new Map<string, Channel[]>();
  const genreSeen = new Map<string, Set<string>>(); // gênero → ids já adicionados

  // ── Passe único ─────────────────────────────────────────────────────────────
  let i = 0;
  for (const c of channels) {
    const type = resolveContentType(c, c.sourceId ? overridesBySource.get(c.sourceId) : undefined);
    const group = c.group || '';

    if (type !== 'live' && c.genre) {
      for (const g of c.genre.split(',').map(s => s.trim()).filter(Boolean)) {
        let seen = genreSeen.get(g);
        if (!seen) { seen = new Set(); genreSeen.set(g, seen); }
        if (seen.has(c.id)) continue;
        let list = genreMap.get(g);
        if (!list) { list = []; genreMap.set(g, list); }
        if (list.length < GENRE_CAP) { list.push(c); seen.add(c.id); }
      }
    }

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

    if (++i % 2000 === 0) await yieldToUI();
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
        const t = resolveContentType(c, c.sourceId ? overridesBySource.get(c.sourceId) : undefined);
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

  // ── Top gêneros ────────────────────────────────────────────────────────────
  const topGenres = Array.from(genreMap.entries())
    .filter(([, chans]) => chans.length >= 4)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 8)
    .map(([genre, chans]) => ({ genre, channels: chans }));

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
    topGenres,
    genreMap,
    counts: {
      live:   live.length,
      movies: movies.length,
      series: series.length,
      year:   yearMoviesArr.length + yearSeries.length,
    },
  };
}

/**
 * Funde índices PARCIAIS (um por fonte) num índice global.
 *
 * É o que torna o índice incremental: recarregar/carregar uma fonte reconstrói
 * só o parcial dela (buildChannelIndex sobre os canais DAQUELA fonte) e o
 * global sai deste merge — que é só concat/lookup de referências, sem regex
 * nem resolveContentType. O dedup global de séries usa getSeriesBaseName, que
 * é cacheado (channelUtils), então também vira lookup.
 *
 * NUNCA muta os parciais: em colisão de chave (grupo presente em 2 fontes),
 * concat cria um array novo.
 */
export function mergeChannelIndexes(parts: ChannelIndex[]): ChannelIndex {
  if (parts.length === 0) return EMPTY_INDEX;
  if (parts.length === 1) return parts[0];

  const live: Channel[] = [], movies: Channel[] = [], series: Channel[] = [];
  const seriesSeen = new Set<string>();
  const byGroup = new Map<string, Channel[]>();
  const seriesByGroup = new Map<string, Channel[]>();
  const episodeCountMap = new Map<string, number>();
  const yearMovies: Channel[] = [], yearSeries: Channel[] = [];
  const ySeen = new Set<string>();
  const liveGroupsSet = new Set<string>(), movieGroupsSet = new Set<string>(), seriesGroupsSet = new Set<string>();
  const genreMap = new Map<string, Channel[]>();

  for (const p of parts) {
    for (const c of p.live)   live.push(c);
    for (const c of p.movies) movies.push(c);
    for (const c of p.series) {
      const b = getSeriesBaseName(c.name);
      if (!seriesSeen.has(b)) { seriesSeen.add(b); series.push(c); }
    }
    for (const [g, chans] of p.byGroup) {
      const prev = byGroup.get(g);
      byGroup.set(g, prev ? prev.concat(chans) : chans);
    }
    for (const [g, chans] of p.seriesByGroup) {
      const prev = seriesByGroup.get(g);
      if (!prev) { seriesByGroup.set(g, chans); continue; }
      const seen = new Set(prev.map(c => getSeriesBaseName(c.name)));
      seriesByGroup.set(g, prev.concat(chans.filter(c => !seen.has(getSeriesBaseName(c.name)))));
    }
    for (const [b, n] of p.episodeCountMap) {
      episodeCountMap.set(b, (episodeCountMap.get(b) || 0) + n);
    }
    for (const c of p.yearMovies) yearMovies.push(c);
    for (const c of p.yearSeries) {
      const b = getSeriesBaseName(c.name);
      if (!ySeen.has(b)) { ySeen.add(b); yearSeries.push(c); }
    }
    for (const g of p.liveGroups)   liveGroupsSet.add(g);
    for (const g of p.movieGroups)  movieGroupsSet.add(g);
    for (const g of p.seriesGroups) seriesGroupsSet.add(g);
    for (const [g, chans] of p.genreMap) {
      const prev = genreMap.get(g);
      genreMap.set(g, prev ? prev.concat(chans) : chans);
    }
  }

  // topGenres global: dedup por id entre fontes + mesmo cap/limiar do build
  const GENRE_CAP = 30;
  const topGenres = Array.from(genreMap.entries())
    .map(([genre, chans]) => {
      const seen = new Set<string>();
      const uniq: Channel[] = [];
      for (const c of chans) {
        if (uniq.length >= GENRE_CAP) break;
        if (!seen.has(c.id)) { seen.add(c.id); uniq.push(c); }
      }
      return { genre, channels: uniq };
    })
    .filter(x => x.channels.length >= 4)
    .sort((a, b) => b.channels.length - a.channels.length)
    .slice(0, 8);

  return {
    live, movies, series,
    byGroup, seriesByGroup,
    liveGroups:   Array.from(liveGroupsSet),
    movieGroups:  Array.from(movieGroupsSet),
    seriesGroups: Array.from(seriesGroupsSet),
    episodeCountMap,
    yearMovies, yearSeries,
    topGenres,
    genreMap,
    counts: {
      live:   live.length,
      movies: movies.length,
      series: series.length,
      year:   yearMovies.length + yearSeries.length,
    },
  };
}
