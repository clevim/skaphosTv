import React, { useEffect, useRef, useState, useCallback, useMemo, memo } from 'react';
import {
  View, Text, StyleSheet, FlatList, ScrollView,
  ActivityIndicator, Platform, useWindowDimensions, Animated,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { useStore, IPTVSource } from '../store/useStore';
import ChannelCard from '../components/ChannelCard';
import HomeContent from '../components/HomeContent';
import SearchContent from '../components/SearchContent';
import TVFocusable from '../components/TVFocusable';
import TopHeader from '../components/TopHeader';
import BottomTabBar from '../components/BottomTabBar';
import TVTopBar from '../components/TVTopBar';
import { colors, spacing, fontSize, radius, fontFamily } from '../utils/theme';
import { RootStackParamList, Channel } from '../types';
import { loadSourceChannels } from '../utils/sourceLoader';
import { usePaginatedList } from '../hooks/usePaginatedList';
import { useChannelFilter } from '../hooks/useChannelFilter';
import SkeletonCard from '@/components/SkeletonCard';
import { useAppLayout } from '../hooks/useAppLayout';
import { detectType, getSeriesBaseName, LAUNCH_YEAR, NAV_ITEMS } from '../utils/channelUtils';
import RemoteHints from '../components/RemoteHints';
import TVCatalogLayout from '../components/TVCatalogLayout';
import TVSearchContent from '../components/TVSearchContent';

import { IS_TV } from '../utils/tvDetect';
import * as ScreenOrientation from 'expo-screen-orientation';

const IS_MOBILE = !IS_TV && Platform.OS !== 'web';

// ── FlatItem ─────────────────────────────────────────────────────────────────
// Componente intermediário com React.memo + useCallback por item.
// Sem isso, inline arrows no renderCard criam novas refs para todos os 2288 itens
// a cada render, quebrando o memo do ChannelCard.
interface FlatItemProps {
  item: Channel;
  index: number;
  isPlaying: boolean;
  isFavorite: boolean;
  epCount: number;
  contentType: 'live' | 'movies' | 'series';
  cardWidth: number;
  cardHeight: number;
  onPress: (channel: Channel) => void;
  onLongPress: (id: string) => void;
}

const FlatItem = memo(function FlatItem({
  item, index, isPlaying, isFavorite, epCount, contentType,
  cardWidth, cardHeight, onPress, onLongPress,
}: FlatItemProps) {
  const handlePress     = useCallback(() => onPress(item),     [onPress, item]);
  const handleLongPress = useCallback(() => onLongPress(item.id), [onLongPress, item.id]);
  return (
    <ChannelCard
      channel={item}
      isPlaying={isPlaying}
      isFavorite={isFavorite}
      onPress={handlePress}
      onLongPress={handleLongPress}
      hasTVPreferredFocus={index === 0 && IS_TV}
      episodeCount={epCount > 1 ? epCount : undefined}
      contentType={contentType}
      cardWidth={cardWidth}
      cardHeight={cardHeight}
    />
  );
}, (prev, next) =>
  prev.isPlaying  === next.isPlaying  &&
  prev.isFavorite === next.isFavorite &&
  prev.item       === next.item       &&
  prev.cardWidth  === next.cardWidth  &&
  prev.cardHeight === next.cardHeight
);

export default function HomeScreen() {
  const { width } = useWindowDimensions();
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const {
    channels, groups, selectedGroup, isLoading, loadError,
    sources, favorites, recentChannels, currentChannel,
    setSelectedGroup, setLoading, setLoadError,
    setCurrentChannel, toggleFavorite, loadFromStorage, channelIndex,
    replaceSourceChannels,
  } = useStore();

  const [navKey, setNavKey]         = useState('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [categorySearch, setCategorySearch] = useState('');
  const [clock, setClock]           = useState('');
  const { mainContentH } = useAppLayout();

  // Refs para centralizar o chip ativo na barra horizontal de categorias
  const chipScrollRef    = useRef<ScrollView>(null);
  const chipLayoutsRef   = useRef<Record<string, { x: number; width: number }>>({});
  const chipScrollWRef   = useRef(0);
  const isLoadingSourcesRef = useRef(false);

  // Quando a categoria ativa muda, centraliza o chip correspondente
  useEffect(() => {
    if (!selectedGroup) return;
    const layout = chipLayoutsRef.current[selectedGroup];
    if (!layout) return;
    const targetX = layout.x - chipScrollWRef.current / 2 + layout.width / 2;
    chipScrollRef.current?.scrollTo({ x: Math.max(0, targetX), animated: true });
  }, [selectedGroup]);

  useEffect(() => {
    const tick = () =>
      setClock(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    tick();
    const interval = setInterval(tick, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const init = async () => {
      await loadFromStorage();
      const state = useStore.getState();
      if (state.channels.length === 0 && state.sources.length > 0) {
        loadAllSources(state.sources);
      } else if (state.channels.length > 0) {
        // Sempre atualiza fontes Jellyfin em background (API rápida; substitui só os canais da fonte)
        const jfSources = state.sources.filter(s => s.type === 'jellyfin');
        for (const src of jfSources) {
          loadOneSource(src)
            .then(({ channels: chs, groups: grps }) => {
              if (chs.length > 0) replaceSourceChannels(src.id, chs, grps);
            })
            .catch(() => {});
        }
      }
    };
    init();
  }, []);

  const loadOneSource = (source: IPTVSource) => loadSourceChannels(source);

  const loadAllSources = async (sourcesToLoad: IPTVSource[], forceRefresh = false) => {
    if (!forceRefresh && useStore.getState().channels.length > 0) return;
    if (isLoadingSourcesRef.current) return;
    isLoadingSourcesRef.current = true;
    setLoading(true);
    setLoadError(null);
    try {
      // Carrega todas as fontes em paralelo, cada uma marcada com seu sourceId
      const results = await Promise.allSettled(
        sourcesToLoad.map(async (src) => ({ src, data: await loadOneSource(src) })),
      );
      let anyLoaded = false;
      for (const res of results) {
        if (res.status === 'rejected') continue;
        const { src, data } = res.value;
        if (data.channels.length === 0) continue;
        replaceSourceChannels(src.id, data.channels, data.groups);
        anyLoaded = true;
      }
      if (!anyLoaded) setLoadError('Nenhum canal encontrado nas fontes configuradas');
    } finally {
      setLoading(false);
      isLoadingSourcesRef.current = false;
    }
  };

  const handleRefresh = useCallback(() => {
    const state = useStore.getState();
    if (state.sources.length > 0) loadAllSources(state.sources, true);
  }, []);

  const jellyfinSources = useMemo(
    () => sources.filter(s => s.type === 'jellyfin'),
    [sources],
  );

  const {
    filteredGroups,
    filteredChannels,
    favoritesSet,
    episodeCountMap,
  } = useChannelFilter({ navKey, selectedGroup, channels, groups, favorites, categorySearch, channelIndex, sources });

  const { visibleItems, hasMore, loadMore, reset } = usePaginatedList(filteredChannels);

  const fadeAnim      = useRef(new Animated.Value(1)).current;
  const isFirstMount  = useRef(true);

  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      reset();
      setCategorySearch('');
      return;
    }
    Animated.timing(fadeAnim, { toValue: 0, duration: 110, useNativeDriver: true }).start(() => {
      reset();
      setCategorySearch('');
      Animated.timing(fadeAnim, { toValue: 1, duration: 190, useNativeDriver: true }).start();
    });
  }, [navKey, selectedGroup]);

  const searchResults = useMemo(() => {
    if (navKey !== 'search' || !searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    const results: Channel[] = [];
    const seen = new Set<string>();
    for (const c of channels) {
      if (results.length >= 100) break;
      const type = detectType(c.group || '', c.name);
      const displayName = type === 'series' ? getSeriesBaseName(c.name) : c.name;
      if (seen.has(displayName)) continue;
      if (displayName.toLowerCase().includes(q) || (c.group || '').toLowerCase().includes(q)) {
        seen.add(displayName);
        results.push({ ...c, name: displayName });
      }
    }
    return results;
  }, [channels, searchQuery, navKey]);

  const handleChannelPress = useCallback((channel: Channel) => {
    // Xtream/Jellyfin definem streamType explicitamente — tem precedência sobre heurística
    const isSingleEpisodeSeries = channel.streamType === 'series';
    const type = isSingleEpisodeSeries
      ? 'series'
      : channel.streamType === 'movie'
        ? 'movies'
        : detectType(channel.group || '', channel.name);

    if (type === 'series') {
      if (isSingleEpisodeSeries) {
        // Xtream/Jellyfin: um canal por série, SeriesScreen busca episódios via API
        navigation.navigate('Series', { seriesName: channel.name, channels: [channel] });
        return;
      }
      // M3U: agrupa todos os episódios pelo nome base (comportamento original)
      const baseName = getSeriesBaseName(channel.name);
      const seriesChannels = channels
        .filter(c => getSeriesBaseName(c.name) === baseName && detectType(c.group || '', c.name) === 'series')
        .sort((a, b) => {
          const ma = a.name.match(/S(\d+)\s*E(\d+)/i);
          const mb = b.name.match(/S(\d+)\s*E(\d+)/i);
          if (!ma || !mb) return 0;
          return (parseInt(ma[1]) * 1000 + parseInt(ma[2])) - (parseInt(mb[1]) * 1000 + parseInt(mb[2]));
        });
      if (seriesChannels.length > 0) {
        navigation.navigate('Series', { seriesName: baseName, channels: seriesChannels });
        return;
      }
    }

    if (type === 'movies') {
      const isJellyfinMovie = channel.id?.startsWith('jf-') && channel.streamType === 'movie';
      const related = isJellyfinMovie
        ? channels.filter(c => c.id !== channel.id && c.group === channel.group).slice(0, 9)
        : channels
            .filter(c => c.id !== channel.id && c.group === channel.group && detectType(c.group || '', c.name) === 'movies')
            .slice(0, 9);
      navigation.navigate('Detail', { channel, relatedChannels: related });
      return;
    }

    setCurrentChannel(channel);
    // Inicia o lock de orientação antes de navegar para evitar a rotação visível ao entrar no player
    if (Platform.OS !== 'web') {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
    }
    navigation.navigate('Player', { channel });
  }, [navigation, setCurrentChannel, channels]);

  const handleNavPress = useCallback((key: string) => {
    setNavKey(key);
    setSelectedGroup(null);
    setSearchQuery('');
  }, []);

  // Responsive card grid — formato portrait (poster 2:3)
  const CARD_MARGIN = IS_TV ? 6 : 4;
  const gridPadding = spacing.md;
  // Em TV o layout tem sidebar de 240px + 1px divisor — subtrair para não vazar
  const TV_SIDEBAR_W = 241;
  const availableW = IS_TV ? width - TV_SIDEBAR_W : width;
  // slot base: card + margens dos dois lados
  const SLOT_BASE = IS_TV ? 160 + CARD_MARGIN * 2 : 110 + CARD_MARGIN * 2;
  const numColumns = Math.max(1, Math.floor((availableW - gridPadding * 2) / SLOT_BASE));
  const cardWidth = Math.floor((availableW - gridPadding * 2) / numColumns) - CARD_MARGIN * 2;
  // altura 2:3 (height = width * 1.4 → levemente maior que 2:3 puro para caber badges)
  const cardHeight = Math.round(cardWidth * 1.4);

  // Fixed info-section height (matches ChannelCard minHeight) → enables getItemLayout
  const INFO_H = IS_TV ? 72 : 56;
  // Full row height: poster + info + card margins (top + bottom)
  const ROW_H = cardHeight + INFO_H + CARD_MARGIN * 2;

  const getItemLayout = useCallback(
    (_: any, index: number) => {
      const row = Math.floor(index / numColumns);
      return { length: ROW_H, offset: gridPadding + ROW_H * row, index };
    },
    [ROW_H, numColumns, gridPadding]
  );

  const renderCard = useCallback(
    (item: Channel, index: number) => {
      const type: 'live' | 'movies' | 'series' =
        item.streamType === 'movie'  ? 'movies'
        : item.streamType === 'series' ? 'series'
        : item.streamType === 'live'   ? 'live'
        : detectType(item.group || '', item.name);
      const isSeries = type === 'series';
      const baseName = isSeries ? getSeriesBaseName(item.name) : item.name;
      const epCount = isSeries ? (episodeCountMap.get(baseName) || 0) : 0;
      const displayChannel = isSeries ? { ...item, name: baseName } : item;
      return (
        <FlatItem
          key={item.id}
          item={displayChannel}
          index={index}
          isPlaying={currentChannel?.id === item.id}
          isFavorite={favoritesSet.has(item.id)}
          epCount={epCount}
          contentType={type}
          cardWidth={cardWidth}
          cardHeight={cardHeight}
          onPress={handleChannelPress}
          onLongPress={toggleFavorite}
        />
      );
    },
    [currentChannel?.id, favoritesSet, handleChannelPress, toggleFavorite, episodeCountMap, cardWidth, cardHeight]
  );

  const renderFlatItem = useCallback(
    ({ item, index }: { item: Channel; index: number }) => renderCard(item, index),
    [renderCard]
  );

  const keyExtractor = useCallback((item: Channel) => item.id, []);

  const renderSkeletonFooter = useCallback(
    () => !hasMore ? null : (
      <View style={styles.skeletonRow}>
        {Array.from({ length: numColumns }).map((_, i) => <SkeletonCard key={i} />)}
      </View>
    ),
    [hasMore, numColumns]
  );

  const sectionTitle = selectedGroup
    ? (navKey === 'year'
        ? `${selectedGroup} ${LAUNCH_YEAR}`
        : selectedGroup.replace(/[♦◆️\uFE0F]\s*/g, '').trim())
    : NAV_ITEMS.find(n => n.key === navKey)?.label || '';

  const favoriteChannels = useMemo(
    () => channels.filter(c => favoritesSet.has(c.id)),
    [channels, favoritesSet]
  );

  // Content area height: subtract tab bar on mobile, top bar on TV
  const contentH = IS_MOBILE ? mainContentH - 60 : mainContentH;

  const renderContent = () => {
    if (isLoading) {
      return (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent2} />
          <Text style={styles.loadingText}>Carregando canais...</Text>
        </View>
      );
    }
    if (loadError) {
      return (
        <View style={styles.center}>
          <Ionicons name="warning" size={48} color={colors.red} />
          <Text style={styles.errorText}>{loadError}</Text>
          <TVFocusable onPress={() => navigation.navigate('Setup')} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>Configurar Fonte</Text>
          </TVFocusable>
        </View>
      );
    }
    if (navKey === 'home') {
      return (
        <HomeContent
          recentChannels={recentChannels}
          favoriteChannels={favoriteChannels}
          sourcesEmpty={sources.length === 0}
          renderCard={renderCard}
          contentH={contentH}
          channels={channels}
          onChannelPress={handleChannelPress}
          onNavPress={handleNavPress}
        />
      );
    }
    if (navKey === 'search') {
      if (IS_TV) {
        return (
          <TVSearchContent
            query={searchQuery}
            onQueryChange={setSearchQuery}
            results={searchResults}
            onResultPress={handleChannelPress}
          />
        );
      }
      return (
        <SearchContent
          query={searchQuery}
          onQueryChange={setSearchQuery}
          results={searchResults}
          onResultPress={handleChannelPress}
          contentH={contentH}
        />
      );
    }
    if (filteredChannels.length === 0) {
      return (
        <View style={styles.center}>
          <Ionicons name="tv-outline" size={64} color={colors.text3} />
          <Text style={styles.emptyTitle}>Nenhum item encontrado</Text>
          <Text style={styles.emptySubtitle}>Tente outro filtro ou categoria</Text>
          {navKey.startsWith('jf-') && (
            <TVFocusable onPress={handleRefresh} style={styles.retryBtn}>
              <Text style={styles.retryBtnText}>Recarregar</Text>
            </TVFocusable>
          )}
        </View>
      );
    }
    // TV: two-panel layout (sidebar + grid)
    if (IS_TV) {
      return (
        <TVCatalogLayout
          title={sectionTitle}
          count={filteredChannels.length}
          groups={filteredGroups}
          selectedGroup={selectedGroup}
          onGroupSelect={setSelectedGroup}
          onReload={handleRefresh}
        >
          <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
            <FlatList
              style={{ flex: 1 }}
              data={visibleItems}
              keyExtractor={keyExtractor}
              numColumns={numColumns}
              key={`${navKey}-${selectedGroup}-${numColumns}`}
              renderItem={renderFlatItem}
              contentContainerStyle={styles.grid}
              showsVerticalScrollIndicator={false}
              initialNumToRender={numColumns * 3}
              maxToRenderPerBatch={numColumns * 2}
              updateCellsBatchingPeriod={100}
              windowSize={5}
              removeClippedSubviews={false}
              onEndReached={loadMore}
              onEndReachedThreshold={0.5}
              ListFooterComponent={renderSkeletonFooter}
              getItemLayout={getItemLayout}
            />
          </Animated.View>
        </TVCatalogLayout>
      );
    }

    // Mobile: header + chips live inside ListHeaderComponent so FlatList
    // is the sole flex child and fills all remaining space correctly.
    const listHeader = (
      <>
        {/* Section header */}
        <View style={styles.sectionHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>{sectionTitle}</Text>
            <Text style={styles.sectionCount}>
              {filteredChannels.length} item{filteredChannels.length !== 1 ? 's' : ''}
            </Text>
          </View>
          <TVFocusable onPress={handleRefresh} style={styles.topbarIconBtn}>
            <Ionicons name="refresh-outline" size={18} color={colors.text2} />
          </TVFocusable>
        </View>

        {/* Category chips */}
        {filteredGroups.length > 0 && (
          <ScrollView
            ref={chipScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipScroll}
            contentContainerStyle={styles.chipRow}
            onLayout={(e) => { chipScrollWRef.current = e.nativeEvent.layout.width; }}
          >
            {filteredGroups.map((g) => {
              const cleanName = g.replace(/[♦◆️\uFE0F]\s*/g, '').trim();
              const isActive = selectedGroup === g;
              return (
                <View
                  key={g}
                  onLayout={(e) => {
                    chipLayoutsRef.current[g] = {
                      x: e.nativeEvent.layout.x,
                      width: e.nativeEvent.layout.width,
                    };
                  }}
                >
                  <TVFocusable
                    onPress={() => setSelectedGroup(selectedGroup === g ? null : g)}
                    style={[styles.chip, isActive && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                      {cleanName}
                    </Text>
                  </TVFocusable>
                </View>
              );
            })}
          </ScrollView>
        )}
      </>
    );

    return (
      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        <FlatList
          style={{ flex: 1 }}
          data={visibleItems}
          keyExtractor={keyExtractor}
          numColumns={numColumns}
          key={`${navKey}-${selectedGroup}-${numColumns}`}
          renderItem={renderFlatItem}
          ListHeaderComponent={listHeader}
          contentContainerStyle={styles.grid}
          showsVerticalScrollIndicator={false}
          initialNumToRender={numColumns * 3}
          maxToRenderPerBatch={numColumns * 2}
          updateCellsBatchingPeriod={100}
          windowSize={5}
          removeClippedSubviews
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={renderSkeletonFooter}
          getItemLayout={getItemLayout}
        />
      </Animated.View>
    );
  };

  return (
    <View style={styles.root}>
      {/* Main content (full area on TV so hero can bleed behind top bar) */}
      <View style={IS_TV ? styles.mainTV : styles.main}>
        {/* Mobile top header inside main */}
        {!IS_TV && (
          <TopHeader
            onSettingsPress={() => navigation.navigate('Settings')}
            onAddPress={() => navigation.navigate('Setup')}
          />
        )}
        {renderContent()}
      </View>

      {/* TV top bar — absolutely overlaid on top of content */}
      {IS_TV && (
        <TVTopBar
          active={navKey}
          clock={clock}
          onNavPress={handleNavPress}
          onSettingsPress={() => navigation.navigate('Settings')}
          jellyfinSources={jellyfinSources}
        />
      )}

      {/* Bottom tab bar — mobile only */}
      {IS_MOBILE && (
        <BottomTabBar active={navKey} onPress={handleNavPress} jellyfinSources={jellyfinSources} />
      )}

      {/* Remote hints — TV only */}
      {IS_TV && <RemoteHints />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg0,
  },
  main: {
    flex: 1,
    overflow: 'hidden',
  },
  mainTV: {
    flex: 1,
    // overflow: 'hidden' removido — bloqueia o FocusFinder do Android TV
  },

  // Section header for list views
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: IS_TV ? spacing.xxxl : 22,
    paddingTop: IS_TV ? spacing.lg : 6,
    paddingBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: IS_TV ? 28 : 24,
    fontFamily: fontFamily.semiBold,
    color: colors.text1,
    letterSpacing: -0.6,
  },
  sectionCount: {
    fontSize: 11,
    color: colors.text3,
    marginTop: 4,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },

  // Category chips
  chipScroll: {
    paddingBottom: 14,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: IS_TV ? spacing.xxxl : 22,
    paddingBottom: 2,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: colors.bg1,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.text1,
    borderColor: colors.text1,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text1,
  },
  chipTextActive: {
    color: '#0a0a0b',
    fontWeight: '600',
  },

  // Top bar buttons
  topbarIconBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg1,
    borderWidth: 1,
    borderColor: colors.border,
  },

  grid: {
    padding: spacing.md,
    paddingBottom: IS_MOBILE ? 80 : spacing.md,
  },
  skeletonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.md,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  loadingText: { color: colors.text2, fontSize: fontSize.md, marginTop: 12 },
  errorText: { color: colors.text2, fontSize: fontSize.sm, textAlign: 'center', maxWidth: 300 },
  retryBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.sm,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  retryBtnText: { color: colors.white, fontWeight: '600' },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text1,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: fontSize.sm,
    color: colors.text3,
    textAlign: 'center',
    maxWidth: 320,
  },
});
