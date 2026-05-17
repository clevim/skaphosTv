import { useMemo, useCallback } from 'react';
import { Channel } from '../types';
import { ChannelIndex } from '../store/channelIndex';
import { detectType, getSeriesBaseName, isLaunchYear, YEAR_GROUPS } from '../utils/channelUtils';

interface UseChannelFilterProps {
  navKey: string;
  selectedGroup: string | null;
  channels: Channel[];
  groups: string[];
  favorites: string[];
  categorySearch: string;
  channelIndex: ChannelIndex | null;
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
}: UseChannelFilterProps) {
  const favoritesSet = useMemo(() => new Set(favorites), [favorites]);

  // O(1) — índice já tem o map pronto
  const episodeCountMap = channelIndex?.episodeCountMap ?? EMPTY_MAP;

  // O(1) — listas de grupos pré-computadas por tipo
  const filteredGroups = useMemo(() => {
    if (!channelIndex) return [];
    if (navKey === 'live')    return channelIndex.liveGroups;
    if (navKey === 'movies')  return channelIndex.movieGroups;
    if (navKey === 'series')  return channelIndex.seriesGroups;
    if (navKey === 'year')    return [...YEAR_GROUPS];
    return [];
  }, [channelIndex, navKey]);

  const filteredChannels = useMemo(() => {
    if (navKey === 'home' || navKey === 'search') return [];
    if (!channelIndex) return [];

    let list: Channel[];

    if (navKey === 'favorites') {
      list = channels.filter(c => favoritesSet.has(c.id));

    } else if (navKey === 'year') {
      if (selectedGroup === 'Filmes')      list = channelIndex.yearMovies;
      else if (selectedGroup === 'Séries') list = channelIndex.yearSeries;
      else                                 list = [...channelIndex.yearMovies, ...channelIndex.yearSeries];

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
        const searchName = detectType(c.group || '', c.name) === 'series'
          ? getSeriesBaseName(c.name)
          : c.name;
        return searchName.toLowerCase().includes(q);
      });
    }

    return list;
  }, [channelIndex, navKey, selectedGroup, favoritesSet, categorySearch, channels]);

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
    if (navKey === 'series') {
      return channelIndex.seriesByGroup.get(group)?.length ?? 0;
    }
    return channelIndex.byGroup.get(group)?.length ?? 0;
  }, [channelIndex, navKey]);

  return {
    filteredGroups,
    filteredChannels,
    navCount,
    getGroupCount,
    favoritesSet,
    episodeCountMap,
  };
}
