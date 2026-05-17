// SeriesScreen.tsx — Detalhe da série com temporadas e episódios
// Xtream: busca episódios via get_series_info ao abrir
// M3U: usa episódios já agrupados passados por parâmetro
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Image,
  StatusBar, FlatList, ActivityIndicator, Share,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store/useStore';
import TVFocusable from '../components/TVFocusable';
import GlassButton from '../components/GlassButton';
import { colors, radius, fontFamily } from '../utils/theme';
import { Channel, RootStackParamList } from '../types';
import { getSeriesBaseName } from '../utils/channelUtils';
import { fetchSeriesInfo, parseSeriesCredentials } from '../utils/xtreamApi';
import { IS_TV } from '../utils/tvDetect';

type SeriesRoute = RouteProp<RootStackParamList, 'Series'>;
type Nav = StackNavigationProp<RootStackParamList>;

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseEpisode(name: string): { episode: number } {
  const patterns = [
    /[Ss]\d+\s*[Ee](\d+)/,
    /\d+[Xx](\d+)/,
    /[Tt]emp(?:orada)?\s*\d+.*?[Ee]p?\.?\s*(\d+)/i,
  ];
  for (const p of patterns) {
    const m = name.match(p);
    if (m) return { episode: parseInt(m[1]) };
  }
  return { episode: 0 };
}

function parseSeason(name: string): number {
  const m = name.match(/[Ss](\d+)\s*[Ee]\d+/) || name.match(/(\d+)[Xx]\d+/);
  return m ? parseInt(m[1]) : 1;
}

function epLabel(name: string, index: number): string {
  const { episode } = parseEpisode(name);
  if (episode > 0) return `E${String(episode).padStart(2, '0')}`;
  return `#${index + 1}`;
}

function seasonLabel(n: number) {
  return n === 0 ? 'Especiais' : `Temporada ${n}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function EpThumb({ logo, size }: { logo?: string; size: { w: number; h: number } }) {
  if (logo) {
    return <Image source={{ uri: logo }} style={{ width: size.w, height: size.h, borderRadius: 8 }} resizeMode="cover" />;
  }
  return (
    <View style={[thumbStyles.ph, { width: size.w, height: size.h }]}>
      <Ionicons name="play" size={size.w * 0.18} color="rgba(255,255,255,0.25)" />
    </View>
  );
}

const thumbStyles = StyleSheet.create({
  ph: {
    borderRadius: 8,
    backgroundColor: colors.bg2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});

// ── Main ──────────────────────────────────────────────────────────────────────

export default function SeriesScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<SeriesRoute>();
  const { seriesName, channels: routeChannels } = route.params;
  const { setCurrentChannel, toggleFavorite, favorites, recentChannels } = useStore();

  // Detecta se é série Xtream (uma entrada por série, sem episódios embutidos)
  const seriesChannel = routeChannels[0];
  const isXtreamSeries = routeChannels.length === 1 && seriesChannel?.streamType === 'series';

  const [allEpisodes, setAllEpisodes] = useState<Channel[]>(isXtreamSeries ? [] : routeChannels);
  const [loadingEpisodes, setLoadingEpisodes] = useState(isXtreamSeries);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Busca episódios via API para séries Xtream
  useEffect(() => {
    if (!isXtreamSeries) return;

    let cancelled = false;

    const creds = parseSeriesCredentials(seriesChannel.url);
    if (!creds) {
      setFetchError('URL da série inválida');
      setLoadingEpisodes(false);
      return;
    }

    // tvgId preferencial; fallback: extrai do path da URL ({host}/series/{user}/{pass}/{id})
    const seriesId = seriesChannel.tvgId
      || seriesChannel.url.match(/\/series\/[^/]+\/[^/]+\/([^/?#]+)/)?.[1]
      || null;
    if (!seriesId) {
      setFetchError('ID da série não encontrado');
      setLoadingEpisodes(false);
      return;
    }

    fetchSeriesInfo(creds.host, creds.user, creds.pass, seriesId)
      .then(info => {
        if (cancelled) return;

        const episodeList: Channel[] = [];
        // Normaliza: alguns servidores retornam episodes como array flat em vez de objeto por temporada
        const rawEpisodes = info.episodes || {};
        const seasonsData: Record<string, typeof rawEpisodes[string]> =
          Array.isArray(rawEpisodes)
            ? rawEpisodes.reduce((acc: any, ep: any) => {
                const key = String(ep.season || 1);
                (acc[key] = acc[key] || []).push(ep);
                return acc;
              }, {})
            : rawEpisodes;
        const sortedSeasonKeys = Object.keys(seasonsData).sort((a, b) => Number(a) - Number(b));

        for (const seasonKey of sortedSeasonKeys) {
          const seasonNum = Number(seasonKey);
          const eps = [...(seasonsData[seasonKey] || [])].sort((a, b) => a.episode_num - b.episode_num);

          for (const ep of eps) {
            const ext = (ep.container_extension || 'mp4').replace(/^\./, '');
            const epUrl = `${creds.host}/series/${creds.user}/${creds.pass}/${ep.id}.${ext}`;
            const s = String(seasonNum).padStart(2, '0');
            const e = String(ep.episode_num).padStart(2, '0');

            episodeList.push({
              id: `ep-${ep.id}`,
              name: `${seriesName} S${s}E${e}`,
              url: epUrl,
              logo: ep.info?.movie_image || seriesChannel.logo,
              group: seriesChannel.group,
              quality: seriesChannel.quality || 'HD',
              streamType: 'series',
              plot: ep.info?.plot,
              releaseDate: ep.info?.releasedate,
              isFavorite: false,
            });
          }
        }

        setAllEpisodes(episodeList);
        setLoadingEpisodes(false);
      })
      .catch(e => {
        if (cancelled) return;
        setFetchError(e.message || 'Erro ao carregar episódios');
        setLoadingEpisodes(false);
      });

    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const baseName = isXtreamSeries ? seriesName : getSeriesBaseName(seriesName);
  const heroChannel = seriesChannel;

  const isFav = favorites.some(id =>
    isXtreamSeries ? id === seriesChannel?.id : routeChannels.some(c => c.id === id),
  );

  const handleShare = async () => {
    const id = seriesChannel?.tvgId;
    const link = id
      ? `com.skaphostv.app://open?type=series&id=${encodeURIComponent(id)}&name=${encodeURIComponent(baseName)}`
      : null;
    try {
      await Share.share({
        message: link
          ? `Assistindo "${baseName}" no SkaphosTV\n\nAbrir no app:\n${link}`
          : `Assistindo "${baseName}" no SkaphosTV`,
        title: baseName,
      });
    } catch (_) {}
  };

  // ── Season map (baseado em allEpisodes) ─────────────────────────────────
  const seasons = useMemo(() => {
    const map = new Map<number, Channel[]>();
    allEpisodes.forEach(ch => {
      const season = parseSeason(ch.name);
      if (!map.has(season)) map.set(season, []);
      map.get(season)!.push(ch);
    });
    const sorted = new Map([...map.entries()].sort((a, b) => a[0] - b[0]));
    sorted.forEach((eps, s) => {
      sorted.set(s, eps.sort((a, b) => parseEpisode(a.name).episode - parseEpisode(b.name).episode));
    });
    return sorted;
  }, [allEpisodes]);

  const seasonKeys = Array.from(seasons.keys());
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [focusedEp, setFocusedEp] = useState(0);

  // Atualiza temporada selecionada quando episódios são carregados
  const seasonInitialized = useRef(false);
  useEffect(() => {
    if (!seasonInitialized.current && seasonKeys.length > 0) {
      seasonInitialized.current = true;
      setSelectedSeason(seasonKeys[0]);
    }
  }, [seasonKeys.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const episodes = seasons.get(selectedSeason) || [];

  const currentEpIdx = useMemo(() => {
    const recentIds = new Set(recentChannels.map(c => c.id));
    const idx = episodes.findIndex(c => recentIds.has(c.id));
    return idx >= 0 ? idx : 0;
  }, [episodes, recentChannels]);

  const currentEp = episodes[currentEpIdx];
  const currentEpLbl = currentEp ? epLabel(currentEp.name, currentEpIdx) : 'E01';
  const seasonNum = selectedSeason;

  const handlePlay = (ch: Channel) => {
    setCurrentChannel(ch);
    navigation.navigate('Player', { channel: ch });
  };

  // ── Loading / Error ───────────────────────────────────────────────────────
  if (loadingEpisodes) {
    return (
      <View style={[styles.root, loadStyles.center]}>
        <StatusBar hidden />
        {heroChannel?.backdrop || heroChannel?.logo ? (
          <Image
            source={{ uri: heroChannel.backdrop || heroChannel.logo }}
            style={StyleSheet.absoluteFillObject}
            resizeMode="cover"
            blurRadius={IS_TV ? 8 : 12}
          />
        ) : null}
        <LinearGradient
          colors={['rgba(10,8,16,0.7)', colors.bg0]}
          style={StyleSheet.absoluteFillObject}
        />
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={loadStyles.text}>Carregando episódios…</Text>
        <Text style={loadStyles.sub}>{baseName}</Text>
      </View>
    );
  }

  if (fetchError) {
    return (
      <View style={[styles.root, loadStyles.center]}>
        <StatusBar hidden />
        <Ionicons name="warning-outline" size={48} color={colors.red} />
        <Text style={loadStyles.errorText}>{fetchError}</Text>
        <TVFocusable onPress={() => navigation.goBack()} style={loadStyles.backBtn}>
          <Text style={loadStyles.backBtnText}>Voltar</Text>
        </TVFocusable>
      </View>
    );
  }

  if (isXtreamSeries && allEpisodes.length === 0) {
    return (
      <View style={[styles.root, loadStyles.center]}>
        <StatusBar hidden />
        <Ionicons name="tv-outline" size={48} color={colors.text3} />
        <Text style={loadStyles.errorText}>Nenhum episódio disponível</Text>
        <Text style={loadStyles.sub}>{baseName}</Text>
        <TVFocusable onPress={() => navigation.goBack()} style={loadStyles.backBtn}>
          <Text style={loadStyles.backBtnText}>Voltar</Text>
        </TVFocusable>
      </View>
    );
  }

  // ── Metadados para exibição ───────────────────────────────────────────────
  const displayPlot = isXtreamSeries
    ? (seriesChannel?.plot || seriesChannel?.genre || '')
    : (heroChannel?.group?.replace(/[♦◆️\uFE0F]\s*/g, '').trim() || '');

  const displayGenre = isXtreamSeries
    ? (seriesChannel?.genre || heroChannel?.group?.replace(/[♦◆️\uFE0F]\s*/g, '').trim() || 'Drama')
    : (heroChannel?.group?.replace(/[♦◆️\uFE0F]\s*/g, '').trim() || 'Drama');

  const backdropUri = isXtreamSeries
    ? (seriesChannel?.backdrop || seriesChannel?.logo)
    : heroChannel?.logo;

  // ── TV Layout ─────────────────────────────────────────────────────────────
  if (IS_TV) {
    return (
      <View style={tvStyles.root}>
        <StatusBar hidden />

        {backdropUri ? (
          <Image source={{ uri: backdropUri }} style={tvStyles.backdrop} resizeMode="cover" />
        ) : (
          <View style={[tvStyles.backdrop, { backgroundColor: colors.bg2 }]} />
        )}
        <LinearGradient
          colors={['rgba(10,8,16,0.55)', 'rgba(10,8,16,0.4)', colors.bg0]}
          locations={[0, 0.5, 1]}
          style={tvStyles.gradV}
        />
        <LinearGradient
          colors={['rgba(10,8,16,0.85)', 'rgba(10,8,16,0.3)', 'transparent']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={tvStyles.gradH}
        />

        <TVFocusable onPress={() => navigation.goBack()} style={tvStyles.backBtn} hasTVPreferredFocus>
          <Ionicons name="chevron-back" size={18} color={colors.text1} />
        </TVFocusable>

        <View style={tvStyles.titleBlock}>
          <View style={tvStyles.origBadge}>
            <Text style={tvStyles.origBadgeText}>
              SÉRIE · {seasonKeys.length} TEMPORADA{seasonKeys.length !== 1 ? 'S' : ''}
            </Text>
          </View>
          <Text style={tvStyles.title} numberOfLines={2}>{baseName}</Text>
          <View style={tvStyles.metaRow}>
            <Text style={tvStyles.metaAcc}>{allEpisodes.length} episódios</Text>
            {seriesChannel?.rating ? (
              <View style={tvStyles.ratingBadge}><Text style={tvStyles.ratingText}>{seriesChannel.rating}</Text></View>
            ) : (
              <View style={tvStyles.ratingBadge}><Text style={tvStyles.ratingText}>TV-MA</Text></View>
            )}
            {heroChannel?.quality && (
              <View style={tvStyles.ratingBadge}><Text style={tvStyles.ratingText}>{heroChannel.quality}</Text></View>
            )}
          </View>
          <Text style={tvStyles.synopsis} numberOfLines={2}>
            {displayPlot || displayGenre}
          </Text>
        </View>

        <View style={tvStyles.seasonRow}>
          {seasonKeys.map((s) => {
            const active = s === selectedSeason;
            return (
              <TVFocusable
                key={s}
                onPress={() => { setSelectedSeason(s); setFocusedEp(0); }}
                style={[tvStyles.seasonPill, active && tvStyles.seasonPillActive]}
              >
                <Text style={[tvStyles.seasonPillText, active && tvStyles.seasonPillTextActive]}>
                  {seasonLabel(s)}
                </Text>
              </TVFocusable>
            );
          })}
          <Text style={tvStyles.epCount}>{episodes.length} EPISÓDIOS</Text>
        </View>

        <FlatList
          horizontal
          data={episodes}
          keyExtractor={item => item.id}
          style={tvStyles.rail}
          contentContainerStyle={tvStyles.railContent}
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={0}
          renderItem={({ item, index }) => {
            const focused = index === focusedEp;
            const label = epLabel(item.name, index);
            const isFirst = index === 0;
            const epName = item.name
              .replace(/\s*[-–]?\s*S\d+\s*E\d+.*$/i, '')
              .replace(baseName, '')
              .trim() || item.name;
            return (
              <TVFocusable
                onPress={() => { setFocusedEp(index); handlePlay(item); }}
                style={[tvStyles.epCard, focused && tvStyles.epCardFocused]}
                hasTVPreferredFocus={isFirst}
              >
                <View style={tvStyles.epThumbWrap}>
                  <EpThumb logo={item.logo} size={{ w: 268, h: 150 }} />
                  {focused && (
                    <View style={tvStyles.epPlayOverlay}>
                      <View style={tvStyles.epPlayBtn}>
                        <Ionicons name="play" size={22} color="#0a0a0b" />
                      </View>
                    </View>
                  )}
                </View>
                <View style={tvStyles.epMeta}>
                  <Text style={tvStyles.epCode}>{label}</Text>
                  <Text style={[tvStyles.epTitle, focused && tvStyles.epTitleFocused]} numberOfLines={1}>
                    {epName}
                  </Text>
                </View>
                {focused && item.plot ? (
                  <Text style={tvStyles.epSynopsis} numberOfLines={2}>{item.plot}</Text>
                ) : focused ? (
                  <Text style={tvStyles.epSynopsis} numberOfLines={2}>
                    {displayGenre}
                  </Text>
                ) : null}
                <Text style={tvStyles.epDur}>
                  {item.quality ? `${item.quality} · ` : ''}{item.name.match(/\d+\s*min/)?.[0] || '~50min'}
                </Text>
              </TVFocusable>
            );
          }}
        />
      </View>
    );
  }

  // ── Mobile Layout ─────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      <StatusBar hidden />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        <View style={styles.hero}>
          {backdropUri ? (
            <Image source={{ uri: backdropUri }} style={styles.heroImg} resizeMode="cover" />
          ) : (
            <View style={[styles.heroImg, styles.heroFallback]}>
              <Text style={styles.heroInitials}>{baseName.slice(0, 3).toUpperCase()}</Text>
            </View>
          )}
          <LinearGradient
            colors={['transparent', 'rgba(10,8,16,0.95)', colors.bg0]}
            locations={[0.4, 0.92, 1]}
            style={styles.heroGradient}
          />

          <View style={styles.heroNav}>
            <TVFocusable onPress={() => navigation.goBack()} style={styles.heroNavBtn}>
              <Ionicons name="chevron-back" size={14} color={colors.text1} />
            </TVFocusable>
            <TVFocusable onPress={handleShare} style={styles.heroNavBtn}>
              <Ionicons name="share-outline" size={16} color={colors.text1} />
            </TVFocusable>
          </View>

          <View style={styles.heroInfo}>
            <View style={styles.origBadge}>
              <Text style={styles.origBadgeText}>SÉRIE</Text>
            </View>
            <Text style={styles.heroTitle} numberOfLines={2}>{baseName}</Text>
            <View style={styles.heroMeta}>
              <Text style={styles.metaAcc}>{allEpisodes.length} ep</Text>
              <Text style={styles.metaDim}>·</Text>
              {seriesChannel?.rating ? (
                <View style={styles.ratingBadge}><Text style={styles.ratingText}>{seriesChannel.rating}</Text></View>
              ) : (
                <View style={styles.ratingBadge}><Text style={styles.ratingText}>TV-MA</Text></View>
              )}
              <Text style={styles.metaDim}>{seasonKeys.length} temporada{seasonKeys.length !== 1 ? 's' : ''}</Text>
              {heroChannel?.quality && (
                <View style={styles.ratingBadge}><Text style={styles.ratingText}>{heroChannel.quality}</Text></View>
              )}
            </View>
          </View>
        </View>

        {/* Continue button */}
        <View style={styles.actionWrap}>
          <TVFocusable
            onPress={() => currentEp && handlePlay(currentEp)}
            style={styles.continueBtn}
          >
            <View style={styles.continueBtnLeft}>
              <Ionicons name="play" size={16} color="#0a0a0b" />
              <Text style={styles.continueBtnText}>
                {currentEpIdx > 0 ? `Continuar T${seasonNum} · ${currentEpLbl}` : `Assistir T${seasonNum} · ${currentEpLbl}`}
              </Text>
            </View>
          </TVFocusable>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round((currentEpIdx / Math.max(episodes.length - 1, 1)) * 100)}%` }]} />
          </View>
        </View>

        <View style={styles.secondaryRow}>
          <GlassButton
            icon={isFav ? 'heart' : 'heart-outline'}
            label="Lista"
            onPress={() => {
              if (isXtreamSeries) {
                toggleFavorite(seriesChannel.id);
              } else {
                routeChannels.forEach(c => toggleFavorite(c.id));
              }
            }}
          />
          <GlassButton icon="share-outline" label="Indicar" onPress={handleShare} />
        </View>

        <View style={styles.synopsisBlock}>
          <Text style={styles.synopsis}>
            {displayPlot
              ? displayPlot
              : `Série do gênero ${displayGenre}.`}
          </Text>
          <View style={styles.metaGrid}>
            <Text style={styles.metaKey}>Gênero</Text>
            <Text style={styles.metaVal}>{displayGenre}</Text>
            {isXtreamSeries && seriesChannel?.cast ? (
              <>
                <Text style={styles.metaKey}>Elenco</Text>
                <Text style={styles.metaVal} numberOfLines={2}>{seriesChannel.cast}</Text>
              </>
            ) : null}
            {isXtreamSeries && seriesChannel?.director ? (
              <>
                <Text style={styles.metaKey}>Direção</Text>
                <Text style={styles.metaVal}>{seriesChannel.director}</Text>
              </>
            ) : null}
            <Text style={styles.metaKey}>Temporadas</Text>
            <Text style={styles.metaVal}>{seasonKeys.length}</Text>
            <Text style={styles.metaKey}>Episódios</Text>
            <Text style={styles.metaVal}>{allEpisodes.length}</Text>
          </View>
        </View>

        {/* Season tabs */}
        <View style={styles.seasonTabsRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.seasonTabsScroll}
            contentContainerStyle={styles.seasonTabsGroup}
          >
            {seasonKeys.map((s) => {
              const active = s === selectedSeason;
              return (
                <TVFocusable
                  key={s}
                  onPress={() => setSelectedSeason(s)}
                  style={[styles.seasonTab, active && styles.seasonTabActive]}
                >
                  <Text style={[styles.seasonTabText, active && styles.seasonTabTextActive]}>
                    {seasonLabel(s)}
                  </Text>
                </TVFocusable>
              );
            })}
          </ScrollView>
          <Text style={styles.epCountLabel}>{episodes.length} EP</Text>
        </View>

        {/* Episode list */}
        <View style={styles.episodeList}>
          {episodes.map((item, index) => {
            const label = epLabel(item.name, index);
            const epName = item.name
              .replace(/\s*[-–]?\s*S\d+\s*E\d+.*$/i, '')
              .replace(baseName, '')
              .trim() || item.name;
            const isCurrent = index === currentEpIdx && currentEpIdx > 0;
            return (
              <TVFocusable
                key={item.id}
                onPress={() => handlePlay(item)}
                style={[styles.epRow, index < episodes.length - 1 && styles.epRowBorder]}
              >
                <View style={styles.epThumbWrap}>
                  <EpThumb logo={item.logo} size={{ w: 110, h: 64 }} />
                  {isCurrent && (
                    <View style={styles.epProgress}>
                      <View style={[styles.epProgressFill, { width: '45%' }]} />
                    </View>
                  )}
                  {!isCurrent && (
                    <View style={styles.epPlayHint}>
                      <Ionicons name="play-circle" size={26} color="rgba(255,255,255,0.7)" />
                    </View>
                  )}
                </View>

                <View style={styles.epMeta}>
                  <View style={styles.epMetaTop}>
                    <Text style={styles.epCode}>{label}</Text>
                    {isCurrent && <View style={styles.watchingBadge}><Text style={styles.watchingText}>EM CURSO</Text></View>}
                  </View>
                  <Text style={styles.epTitle} numberOfLines={2}>{epName}</Text>
                  {item.plot ? (
                    <Text style={styles.epPlot} numberOfLines={2}>{item.plot}</Text>
                  ) : null}
                  <Text style={styles.epDur}>
                    {item.releaseDate ? `${item.releaseDate} · ` : ''}{item.name.match(/\d+\s*min/)?.[0] || '~50min'}
                  </Text>
                </View>
              </TVFocusable>
            );
          })}
        </View>

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

// ── Loading / Error styles ────────────────────────────────────────────────────
const loadStyles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', gap: 16 },
  text: { fontSize: 16, color: colors.text2, marginTop: 8 },
  sub: { fontSize: 13, color: colors.text3 },
  errorText: { fontSize: 14, color: colors.text2, textAlign: 'center', maxWidth: 300 },
  backBtn: {
    marginTop: 8,
    paddingHorizontal: 24, paddingVertical: 10,
    backgroundColor: colors.bg2,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
  },
  backBtnText: { fontSize: 14, fontWeight: '600', color: colors.text1 },
});

// ── TV Styles ────────────────────────────────────────────────────────────────
const tvStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg0 },

  backdrop: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
  },
  gradV: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
  },
  gradH: {
    position: 'absolute',
    top: 0, left: 0, bottom: 0,
    width: '80%',
  },

  backBtn: {
    position: 'absolute',
    top: 28, left: 48,
    width: 36, height: 36, borderRadius: radius.full,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
    zIndex: 10,
  },

  titleBlock: {
    position: 'absolute',
    top: 110, left: 48,
    width: 580,
  },
  origBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: colors.accentSoft,
    borderWidth: 1, borderColor: colors.accent,
    marginBottom: 14,
  },
  origBadgeText: {
    fontSize: 11, fontWeight: '700', color: colors.accent, letterSpacing: 0.6,
  },
  title: {
    fontSize: 52, fontFamily: fontFamily.semiBold,
    color: colors.text1, letterSpacing: -1.3, lineHeight: 56,
  },
  metaRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 12,
  },
  metaAcc: { fontSize: 14, fontWeight: '600', color: colors.accent },
  ratingBadge: {
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4,
  },
  ratingText: { fontSize: 11, color: colors.text2 },
  synopsis: {
    fontSize: 14.5, color: colors.text1, opacity: 0.85,
    marginTop: 14, lineHeight: 22, maxWidth: 480,
  },

  seasonRow: {
    position: 'absolute',
    top: 370, left: 48,
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  seasonPill: {
    paddingHorizontal: 18, paddingVertical: 8, borderRadius: radius.full,
    backgroundColor: 'transparent',
    borderWidth: 1, borderColor: colors.border,
  },
  seasonPillActive: {
    backgroundColor: colors.text1,
    borderColor: colors.text1,
  },
  seasonPillText: {
    fontSize: 13, fontWeight: '500', color: colors.text2,
  },
  seasonPillTextActive: {
    color: '#0a0a0b', fontWeight: '600',
  },
  epCount: {
    fontSize: 11, color: colors.text3,
    letterSpacing: 0.4, marginLeft: 14,
    fontFamily: fontFamily.medium,
  },

  rail: {
    position: 'absolute',
    bottom: 60,
    left: 0, right: 0,
  },
  railContent: {
    paddingHorizontal: 48,
    gap: 18,
  },
  epCard: {
    width: 268,
  },
  epCardFocused: {
    transform: [{ translateY: -6 }],
  },
  epThumbWrap: {
    position: 'relative',
    borderRadius: 10,
    overflow: 'hidden',
    width: 268, height: 150,
  },
  epPlayOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center', justifyContent: 'center',
  },
  epPlayBtn: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center', justifyContent: 'center',
  },
  epMeta: {
    flexDirection: 'row', gap: 8, alignItems: 'baseline',
    marginTop: 12,
  },
  epCode: {
    fontSize: 11, color: colors.text3,
    fontFamily: fontFamily.medium, letterSpacing: 0.4,
  },
  epTitle: {
    fontSize: 14, fontWeight: '500', color: colors.text2,
    flex: 1, overflow: 'hidden',
  },
  epTitleFocused: {
    fontWeight: '600', color: colors.text1,
  },
  epSynopsis: {
    fontSize: 12, color: colors.text3,
    lineHeight: 17, marginTop: 6, maxWidth: 268,
  },
  epDur: {
    fontSize: 10, color: colors.text3, marginTop: 6, letterSpacing: 0.3,
    fontFamily: fontFamily.regular,
  },
});

// ── Mobile Styles ─────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg0 },
  content: {},

  hero: { height: 420, position: 'relative', backgroundColor: colors.bg3 },
  heroImg: { width: '100%', height: '100%' },
  heroFallback: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg2,
  },
  heroInitials: { fontSize: 64, fontFamily: fontFamily.bold, color: colors.accent, opacity: 0.15, letterSpacing: 6 },
  heroGradient: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '65%' },
  heroNav: {
    position: 'absolute', top: 48, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 18,
  },
  heroNavBtn: {
    width: 36, height: 36, borderRadius: radius.full,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  heroInfo: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 22, paddingBottom: 18 },
  origBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4,
    backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accent,
    marginBottom: 10,
  },
  origBadgeText: { fontSize: 9, fontWeight: '700', color: colors.accent, letterSpacing: 0.6 },
  heroTitle: {
    fontSize: 30, fontFamily: fontFamily.semiBold,
    color: colors.text1, letterSpacing: -0.8, lineHeight: 34,
  },
  heroMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  metaAcc: { fontSize: 12, fontWeight: '600', color: colors.accent },
  metaDim: { fontSize: 12, color: colors.text3 },
  ratingBadge: { borderWidth: 1, borderColor: colors.border, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3 },
  ratingText: { fontSize: 10, color: colors.text2 },

  actionWrap: { paddingHorizontal: 22, marginTop: -8 },
  continueBtn: {
    height: 50, borderRadius: 12, backgroundColor: colors.text1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18,
  },
  continueBtnLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  continueBtnText: { fontSize: 15, fontFamily: fontFamily.semiBold, color: '#0a0a0b' },
  progressTrack: {
    marginTop: 10, height: 3, backgroundColor: colors.borderSoft,
    borderRadius: 2, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: colors.accent },

  secondaryRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 22, marginTop: 14 },

  synopsisBlock: { padding: 22, paddingTop: 22, gap: 14 },
  synopsis: { fontSize: 13.5, color: colors.text1, lineHeight: 21 },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  metaKey: { width: 92, fontSize: 12, color: colors.text3, paddingVertical: 4 },
  metaVal: { flex: 1, fontSize: 12, color: colors.text1, paddingVertical: 4 },

  seasonTabsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 22, paddingTop: 22, paddingBottom: 0,
    gap: 12,
  },
  seasonTabsScroll: { flex: 1 },
  seasonTabsGroup: {
    flexDirection: 'row', gap: 4,
    backgroundColor: colors.bg1,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: 10, padding: 4,
  },
  seasonTab: {
    paddingHorizontal: 16, paddingVertical: 7, borderRadius: 7,
    backgroundColor: 'transparent',
    borderWidth: 1, borderColor: 'transparent',
  },
  seasonTabActive: {
    backgroundColor: colors.bg2,
    borderColor: colors.border,
  },
  seasonTabText: { fontSize: 12, fontWeight: '500', color: colors.text3 },
  seasonTabTextActive: { fontWeight: '600', color: colors.text1 },
  epCountLabel: {
    fontSize: 10, color: colors.text3, letterSpacing: 0.4,
    fontFamily: fontFamily.medium,
  },

  episodeList: { paddingHorizontal: 22, paddingTop: 14 },
  epRow: {
    flexDirection: 'row', gap: 12, paddingVertical: 12,
  },
  epRowBorder: {
    borderBottomWidth: 1, borderBottomColor: colors.borderSoft,
  },
  epThumbWrap: { width: 110, flexShrink: 0, position: 'relative' },
  epProgress: {
    position: 'absolute', bottom: 4, left: 4, right: 4,
    height: 3, backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2, overflow: 'hidden',
  },
  epProgressFill: { height: '100%', backgroundColor: colors.accent },
  epPlayHint: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  epMeta: { flex: 1 },
  epMetaTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  epCode: { fontSize: 11, color: colors.text3, fontFamily: fontFamily.medium, letterSpacing: 0.4 },
  watchingBadge: {
    paddingHorizontal: 6, paddingVertical: 1, borderRadius: 3,
    backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accent,
  },
  watchingText: { fontSize: 8, fontWeight: '700', color: colors.accent, letterSpacing: 0.4 },
  epTitle: { fontSize: 13, fontWeight: '500', color: colors.text1, lineHeight: 18 },
  epPlot: { fontSize: 11, color: colors.text3, lineHeight: 16, marginTop: 3 },
  epDur: { fontSize: 10, color: colors.text3, marginTop: 4 },
});
