import { useMemo, useCallback } from 'react';
import { Channel } from '../types';
import { ChannelIndex } from '../store/channelIndex';
import { getSeriesBaseName, isLaunchYear, YEAR_GROUPS, FAVORITES_GROUPS } from '../utils/channelUtils';
import { IPTVSource, useStore, resolveChannelType } from '../store/useStore';
import { useUsageStats } from '../store/usageStats';

interface UseChannelFilterProps {
  navKey: string;
  selectedGroup: string | null;
  channels: Channel[];
  groups: string[];
  favorites: string[];
  categorySearch: string;
  channelIndex: ChannelIndex | null;
  sources?: IPTVSource[];
  /** 'default' (ordem do catálogo) | 'az' | 'popular' (mais assistido). */
  sortMode?: 'default' | 'az' | 'popular';
}

const EMPTY_MAP = new Map<string, number>();

export function useChannelFilter({
  navKey,
  selectedGroup,
  channels,
  groups,
  favorites,
  categorySearch,
  channelIndex,
  sources,
  sortMode = 'default',
}: UseChannelFilterProps) {
  const favoritesSet = useMemo(() => new Set(favorites), [favorites]);
  const usageBySource = useUsageStats(s => s.bySource);

  // O(1) — índice já tem o map pronto
  const episodeCountMap = channelIndex?.episodeCountMap ?? EMPTY_MAP;

  // Para navKey jf-{id}: encontra o serverName da fonte Jellyfin
  const jellyfinServerName = useMemo(() => {
    if (!navKey.startsWith('jf-') || !sources) return null;
    const sourceId = navKey.slice(3);
    const src = sources.find(s => s.id === sourceId && s.type === 'jellyfin');
    return src ? (src.serverName || src.name) : null;
  }, [navKey, sources]);

  // O(1) — listas de grupos pré-computadas por tipo
  const filteredGroups = useMemo(() => {
    let groups: string[];
    if (!channelIndex) return [];
    if (navKey === 'live')         groups = channelIndex.liveGroups;
    else if (navKey === 'movies')  groups = channelIndex.movieGroups;
    else if (navKey === 'series')  groups = channelIndex.seriesGroups;
    else if (navKey === 'year')    groups = [...YEAR_GROUPS];
    else if (navKey === 'favorites') groups = [...FAVORITES_GROUPS];
    else if (jellyfinServerName) {
      // Grupos que pertencem a esta fonte Jellyfin
      groups = [...channelIndex.byGroup.keys()].filter(g =>
        g.startsWith(`${jellyfinServerName} ·`)
      );
    } else return [];
    return groups;
  }, [channelIndex, navKey, jellyfinServerName]);

  const filteredChannels = useMemo(() => {
    if (navKey === 'home' || navKey === 'search') return [];
    if (!channelIndex) return [];

    let list: Channel[];

    if (navKey === 'favorites') {
      list = channels.filter(c => favoritesSet.has(c.id));
      if (selectedGroup === 'Ao vivo')      list = list.filter(c => resolveChannelType(c) === 'live');
      else if (selectedGroup === 'Filmes')  list = list.filter(c => resolveChannelType(c) === 'movies');
      else if (selectedGroup === 'Séries')  list = list.filter(c => resolveChannelType(c) === 'series');

    } else if (navKey === 'year') {
      if (selectedGroup === 'Filmes')      list = channelIndex.yearMovies;
      else if (selectedGroup === 'Séries') list = channelIndex.yearSeries;
      else                                 list = [...channelIndex.yearMovies, ...channelIndex.yearSeries];

    } else if (jellyfinServerName) {
      // Jellyfin: filtra por grupo específico ou todos os grupos da fonte
      if (selectedGroup) {
        // Series group: deduplica por nome base; Movie group: lista direta
        const isSeriesGroup = selectedGroup.includes('Séries');
        if (isSeriesGroup) {
          list = channelIndex.seriesByGroup.get(selectedGroup) ?? channelIndex.byGroup.get(selectedGroup) ?? [];
        } else {
          list = channelIndex.byGroup.get(selectedGroup) ?? [];
        }
      } else {
        // Todos os canais de todos os grupos desta fonte
        list = filteredGroups.flatMap(g => channelIndex.byGroup.get(g) ?? []);
        // Deduplica séries globalmente
        const seenSeries = new Set<string>();
        list = list.filter(c => {
          if (c.streamType !== 'series') return true;
          const base = getSeriesBaseName(c.name);
          if (seenSeries.has(base)) return false;
          seenSeries.add(base);
          return true;
        });
      }

    } else if (selectedGroup) {
      // O(1) lookup — nenhuma iteração sobre canais
      if (navKey === 'series') {
        list = channelIndex.seriesByGroup.get(selectedGroup) ?? [];
      } else {
        list = channelIndex.byGroup.get(selectedGroup) ?? [];
      }

    } else {
      if (navKey === 'live')         list = channelIndex.live;
      else if (navKey === 'movies')  list = channelIndex.movies;
      else if (navKey === 'series')  list = channelIndex.series;
      else                           list = [];
    }

    if (categorySearch.trim()) {
      const q = categorySearch.toLowerCase();
      list = list.filter(c => {
        const searchName = resolveChannelType(c) === 'series'
          ? getSeriesBaseName(c.name)
          : c.name;
        return searchName.toLowerCase().includes(q);
      });
    }

    if (sortMode === 'az') {
      list = [...list].sort((a, b) => {
        const an = resolveChannelType(a) === 'series' ? getSeriesBaseName(a.name) : a.name;
        const bn = resolveChannelType(b) === 'series' ? getSeriesBaseName(b.name) : b.name;
        return an.localeCompare(bn, 'pt-BR');
      });
    } else if (sortMode === 'popular') {
      list = [...list].sort((a, b) => {
        const ac = (a.sourceId && usageBySource[a.sourceId]?.playCounts[a.id]?.count) || 0;
        const bc = (b.sourceId && usageBySource[b.sourceId]?.playCounts[b.id]?.count) || 0;
        return bc - ac;
      });
    }

    return list;
  }, [channelIndex, navKey, selectedGroup, favoritesSet, categorySearch, channels, jellyfinServerName, filteredGroups, sortMode, usageBySource]);

  // O(1) — usa contagens pré-computadas
  const navCount = useCallback((key: string): number => {
    if (!channelIndex) return 0;
    if (key === 'favorites') return favorites.length;
    return channelIndex.counts[key as keyof typeof channelIndex.counts] ?? 0;
  }, [channelIndex, favorites]);

  // O(1) — usa byGroup / seriesByGroup do índice
  const getGroupCount = useCallback((group: string): number => {
    if (!channelIndex) return 0;
    if (navKey === 'year') {
      if (group === 'Filmes')  return channelIndex.yearMovies.length;
      if (group === 'Séries')  return channelIndex.yearSeries.length;
    }
    if (navKey === 'favorites') {
      const favChannels = channels.filter(c => favoritesSet.has(c.id));
      if (group === 'Ao vivo') return favChannels.filter(c => resolveChannelType(c) === 'live').length;
      if (group === 'Filmes')  return favChannels.filter(c => resolveChannelType(c) === 'movies').length;
      if (group === 'Séries')  return favChannels.filter(c => resolveChannelType(c) === 'series').length;
    }
    if (navKey === 'series') {
      return channelIndex.seriesByGroup.get(group)?.length ?? 0;
    }
    return channelIndex.byGroup.get(group)?.length ?? 0;
  }, [channelIndex, navKey, channels, favoritesSet]);

  return {
    filteredGroups,
    filteredChannels,
    navCount,
    getGroupCount,
    favoritesSet,
    episodeCountMap,
  };
}
