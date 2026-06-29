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
import { useChannelFilter } from '../hooks/useChannelFilter';
import { useAppLayout } from '../hooks/useAppLayout';
import { detectType, getSeriesBaseName, LAUNCH_YEAR, NAV_ITEMS } from '../utils/channelUtils';
import { searchChannels, SearchType } from '../utils/search';
import { useRecentSearches } from '../store/recentSearches';
import RemoteHints from '../components/RemoteHints';
import TVCatalogLayout from '../components/TVCatalogLayout';
import TVSearchContent from '../components/TVSearchContent';

import { IS_TV } from '../utils/tvDetect';
import * as ScreenOrientation from 'expo-screen-orientation';

// Barra de abas inferior: presente no mobile E no web (só a TV usa a top bar).
const HAS_BOTTOM_NAV = !IS_TV;

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
  displayName?: string;
  onPress: (channel: Channel) => void;
  onLongPress: (id: string) => void;
}

const FlatItem = memo(function FlatItem({
  item, index, isPlaying, isFavorite, epCount, contentType,
  cardWidth, cardHeight, displayName, onPress, onLongPress,
}: FlatItemProps) {
  const handlePress     = useCallback(() => onPress(item),     [onPress, item]);
  const handleLongPress = useCallback(() => onLongPress(item.id), [onLongPress, item.id]);
  return (
    <ChannelCard
      channel={item}
      displayName={displayName}
      isPlaying={isPlaying}
      isFavorite={isFavorite}
      onPress={handlePress}
      onLongPress={handleLongPress}
      onToggleFavorite={handleLongPress}
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
  prev.displayName === next.displayName &&
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
  // Query com debounce (evita re-buscar a cada tecla em listas grandes) + filtro de tipo
  const [searchDebounced, setSearchDebounced] = useState('');
  const [searchType, setSearchType] = useState<SearchType>('all');
  const recentQueries = useRecentSearches(s => s.queries);
  const clearRecentSearches = useRecentSearches(s => s.clear);
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
      if (state.sources.length === 0) return;

      // Reconciliação por fonte: o cache de canais é debounced/serializado, então
      // pode ficar PARCIAL se o app fechar no meio. O Xtream carrega em 3 fases
      // (live → filmes → SÉRIES por último), cada uma com save debounced — se o app
      // fecha antes da fase de séries gravar, o cache fica com a fonte incompleta
      // (tipicamente sem as séries). Detectar só "fonte sem NENHUM canal" não pegava
      // esse caso: a fonte tinha live+filmes, era considerada completa e as séries
      // nunca voltavam. Aqui comparamos o que há em cache com o total esperado
      // (source.channelCount, gravado após a carga completa) e recarregamos a fonte
      // inteira quando o cache está abaixo do esperado.
      const incompleteSources = (srcs: IPTVSource[], chans: Channel[]): IPTVSource[] => {
        const counts = new Map<string, number>();
        for (const c of chans) {
          if (c.sourceId) counts.set(c.sourceId, (counts.get(c.sourceId) ?? 0) + 1);
        }
        return srcs.filter(s => {
          const have = counts.get(s.id) ?? 0;
          if (have === 0) return true;                          // nada em cache
          const expected = s.channelCount ?? 0;
          // Tolerância de 15%: o catálogo do servidor varia um pouco entre cargas.
          return expected > 0 && have < expected * 0.85;        // cache parcial (ex.: faltam séries)
        });
      };

      let missing = incompleteSources(state.sources, state.channels);
      // Jellyfin completo em cache → atualiza em background (API rápida; não entra no retry)
      const jfCached = state.sources.filter(
        s => s.type === 'jellyfin' && !missing.some(m => m.id === s.id),
      );

      // Fontes faltantes/incompletas → recarrega da rede (mostra loading se nada na tela).
      // Retry com backoff: no boot frio a rede/proxy pode ainda não estar pronta e a
      // carga falhava silenciosamente, deixando a fonte vazia/parcial até o reload manual.
      if (missing.length > 0) {
        const RETRY_DELAYS = [3000, 6000, 12000];
        const missingIds = new Set(missing.map(s => s.id));
        for (let attempt = 0; ; attempt++) {
          await loadSomeSources(missing);
          // Reavalia com o MESMO critério de completude (presença não basta: uma fonte
          // parcial que falhou em recarregar continuaria "presente" e pararia o retry).
          // Relê as fontes da store: o channelCount pode ter sido atualizado pela recarga.
          const fresh = useStore.getState();
          missing = incompleteSources(
            fresh.sources.filter(s => missingIds.has(s.id)),
            fresh.channels,
          );
          if (missing.length === 0 || attempt >= RETRY_DELAYS.length) break;
          await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
        }
      }

      // Fontes Jellyfin já em cache → atualiza em background (API rápida; substitui a fonte)
      for (const src of jfCached) {
        loadOneSource(src)
          .then(({ channels: chs, groups: grps }) => {
            if (chs.length > 0) replaceSourceChannels(src.id, chs, grps);
          })
          .catch(() => {});
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

  /** Carrega da rede um subconjunto específico de fontes (sem o guard de "já tem canais"),
   *  preservando os canais das demais. Usado no boot para reconciliar fontes faltantes. */
  const loadSomeSources = async (sourcesToLoad: IPTVSource[]) => {
    if (sourcesToLoad.length === 0 || isLoadingSourcesRef.current) return;
    isLoadingSourcesRef.current = true;
    // Só exibe o spinner global se ainda não há nada na tela
    const showSpinner = useStore.getState().channels.length === 0;
    if (showSpinner) { setLoading(true); setLoadError(null); }
    try {
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
      if (showSpinner && !anyLoaded) setLoadError('Nenhum canal encontrado nas fontes configuradas');
    } finally {
      if (showSpinner) setLoading(false);
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

  const fadeAnim      = useRef(new Animated.Value(1)).current;
  const isFirstMount  = useRef(true);

  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      setCategorySearch('');
      return;
    }
    Animated.timing(fadeAnim, { toValue: 0, duration: 110, useNativeDriver: true }).start(() => {
      setCategorySearch('');
      Animated.timing(fadeAnim, { toValue: 1, duration: 190, useNativeDriver: true }).start();
    });
  }, [navKey, selectedGroup]);

  // Debounce da query (200ms) — evita re-buscar a cada tecla na lista inteira
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(searchQuery), 200);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const searchResults = useMemo(() => {
    if (navKey !== 'search') return [];
    return searchChannels(channels, searchDebounced, searchType);
  }, [channels, searchDebounced, searchType, navKey]);

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
        // Xtream/Jellyfin: um canal por série; a SeriesScreen busca os episódios via API
        // usando o id da SÉRIE. Se o que chegou aqui for um EPISÓDIO solto (recente salvo
        // por versões antigas, ou hero), o id/URL são do episódio e a API não acha nada
        // ("Nenhum episódio disponível"). Então recuperamos a série-pai:
        //   1) seriesRef embutido (episódios criados nesta versão);
        //   2) casamento pelo nome-base na lista de canais (cobre recentes antigos).
        const looksLikeEpisode = /S\d+\s*E\d+/i.test(channel.name) || channel.id?.startsWith('ep-');
        const seriesEntry =
          channel.seriesRef ??
          (looksLikeEpisode
            ? channels.find(c => c.streamType === 'series' &&
                getSeriesBaseName(c.name) === getSeriesBaseName(channel.name))
            : undefined) ??
          channel;
        navigation.navigate('Series', { seriesName: seriesEntry.name, channels: [seriesEntry] });
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

  // Hero "Assistir": inicia a reprodução direto (filme/ao vivo → player). Para série,
  // vai à tela da série (precisa escolher episódio). Diferente de handleChannelPress,
  // que para filme abre os Detalhes — esse é o comportamento do botão "Detalhes".
  const handleHeroWatch = useCallback((channel: Channel) => {
    const type = channel.streamType === 'series' ? 'series'
      : channel.streamType === 'movie' ? 'movies'
      : detectType(channel.group || '', channel.name);
    if (type === 'series') { handleChannelPress(channel); return; }
    setCurrentChannel(channel);
    if (Platform.OS !== 'web') {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
    }
    navigation.navigate('Player', { channel });
  }, [navigation, setCurrentChannel, handleChannelPress]);

  // Busca: ao abrir um resultado, registra a query nas buscas recentes
  const handleSearchResultPress = useCallback((channel: Channel) => {
    if (searchQuery.trim()) useRecentSearches.getState().add(searchQuery.trim());
    handleChannelPress(channel);
  }, [searchQuery, handleChannelPress]);

  const handleNavPress = useCallback((key: string) => {
    setNavKey(key);
    setSelectedGroup(null);
    setSearchQuery('');
  }, []);

  // "Estou com sorte": abre uma mídia aleatória dentro do que está filtrado no momento
  // (categoria + subcategoria selecionada). Usa a mesma lista exibida no grid.
  const handleRandomPick = useCallback(() => {
    if (filteredChannels.length === 0) return;
    const pick = filteredChannels[Math.floor(Math.random() * filteredChannels.length)];
    handleChannelPress(pick);
  }, [filteredChannels, handleChannelPress]);

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
      // Passa o item com referência ESTÁVEL + displayName separado — evita criar
      // objeto novo por render (que quebrava o memo das séries).
      return (
        <FlatItem
          key={item.id}
          item={item}
          displayName={isSeries ? baseName : undefined}
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
  const contentH = HAS_BOTTOM_NAV ? mainContentH - 60 : mainContentH;

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
          onWatch={handleHeroWatch}
          onDetails={handleChannelPress}
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
            onResultPress={handleSearchResultPress}
            searchType={searchType}
            onSearchTypeChange={setSearchType}
            recent={recentQueries}
            onRecentPress={setSearchQuery}
            onClearRecent={clearRecentSearches}
          />
        );
      }
      return (
        <SearchContent
          query={searchQuery}
          onQueryChange={setSearchQuery}
          results={searchResults}
          onResultPress={handleSearchResultPress}
          contentH={contentH}
          searchType={searchType}
          onSearchTypeChange={setSearchType}
          recent={recentQueries}
          onRecentPress={setSearchQuery}
          onClearRecent={clearRecentSearches}
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
          onRandom={handleRandomPick}
        >
          <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
            <FlatList
              style={{ flex: 1 }}
              data={filteredChannels}
              keyExtractor={keyExtractor}
              numColumns={numColumns}
              key={`${navKey}-${selectedGroup}-${numColumns}`}
              renderItem={renderFlatItem}
              contentContainerStyle={styles.grid}
              showsVerticalScrollIndicator={false}
              // Virtualização nativa da FlatList renderiza só a janela visível —
              // sem paginação manual (que causava solavanco e perda de foco).
              initialNumToRender={numColumns * 4}
              maxToRenderPerBatch={numColumns * 3}
              updateCellsBatchingPeriod={50}
              windowSize={9}
              removeClippedSubviews={false}
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
          <TVFocusable onPress={handleRandomPick} style={[styles.topbarIconBtn, { marginRight: 8 }]}>
            <Ionicons name="dice-outline" size={18} color={colors.accent} />
          </TVFocusable>
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
          data={filteredChannels}
          keyExtractor={keyExtractor}
          numColumns={numColumns}
          key={`${navKey}-${selectedGroup}-${numColumns}`}
          renderItem={renderFlatItem}
          ListHeaderComponent={listHeader}
          contentContainerStyle={styles.grid}
          showsVerticalScrollIndicator={false}
          initialNumToRender={numColumns * 4}
          maxToRenderPerBatch={numColumns * 3}
          updateCellsBatchingPeriod={50}
          windowSize={7}
          removeClippedSubviews
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

      {/* Bottom tab bar — mobile e web (TV usa a top bar) */}
      {HAS_BOTTOM_NAV && (
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
    paddingBottom: HAS_BOTTOM_NAV ? 80 : spacing.md,
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
