// SeriesScreen.tsx — Detalhe da série com temporadas e episódios
// Xtream: busca episódios via get_series_info ao abrir
// M3U: usa episódios já agrupados passados por parâmetro
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  StatusBar, FlatList, ActivityIndicator, Share,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store/useStore';
import { useWatchProgress, progressFractionFor } from '../store/watchProgress';
import TVFocusable from '../components/TVFocusable';
import GlassButton from '../components/GlassButton';
import { colors, radius, fontFamily } from '../utils/theme';
import { Channel, RootStackParamList } from '../types';
import { getSeriesBaseName } from '../utils/channelUtils';
import { fetchSeriesInfo, parseSeriesCredentials } from '../utils/xtreamApi';
import { parseJellyfinSeriesUrl, fetchJellyfinEpisodes, parseJellyfinVideoUrl } from '../utils/jellyfinLoader';
import { IS_TV } from '../utils/tvDetect';
import * as ScreenOrientation from 'expo-screen-orientation';
import { fetchTmdbSeries, TmdbMeta } from '../utils/tmdbApi';
import JellyfinTrackSheet from '../components/JellyfinTrackSheet';
import ExpandableText from '../components/ExpandableText';

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

/** Mantém um valor responsivo dentro de limites legíveis (evita fontes minúsculas/gigantes). */
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(v)));

// ── Sub-components ────────────────────────────────────────────────────────────

function EpThumb({ logo, size }: { logo?: string; size: { w: number; h: number } }) {
  return (
    <View style={[thumbStyles.ph, { width: size.w, height: size.h }]}>
      {logo ? (
        <Image source={logo} style={StyleSheet.absoluteFill} contentFit="contain" transition={0} recyclingKey={logo} />
      ) : (
        <Ionicons name="play" size={size.w * 0.18} color="rgba(255,255,255,0.25)" />
      )}
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
  const { setCurrentChannel, toggleFavorite, favorites, recentChannels, settings, sources } = useStore();
  // Progresso de reprodução local (por dispositivo) — badges de assistido / em curso
  const watchEntries = useWatchProgress(s => s.entries);

  // Hook de dimensões — reage a rotação/redimensionamento em tempo real
  const { width: sw, height: sh } = useWindowDimensions();

  // Detecta se é série Xtream (uma entrada por série, sem episódios embutidos)
  const seriesChannel = routeChannels[0];
  const isXtreamSeries = routeChannels.length === 1 && seriesChannel?.streamType === 'series';

  const [allEpisodes, setAllEpisodes] = useState<Channel[]>(isXtreamSeries ? [] : routeChannels);
  const [loadingEpisodes, setLoadingEpisodes] = useState(isXtreamSeries);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [tmdb, setTmdb] = useState<TmdbMeta | null>(null);
  const [trackSheetUrl, setTrackSheetUrl] = useState<string | null>(null);
  const pendingEpRef = useRef<Channel | null>(null);
  const railRef = useRef<FlatList<Channel>>(null);

  const doFetchEpisodes = useCallback(() => {
    if (!isXtreamSeries) return;

    setFetchError(null);
    setLoadingEpisodes(true);

    // Jellyfin series — pseudo-URL path
    const jellyfinCreds = parseJellyfinSeriesUrl(seriesChannel.url);
    if (jellyfinCreds) {
      // Prefere o token ATUAL da fonte (a URL pode ter um token antigo/expirado)
      const src = sources.find(
        s => s.type === 'jellyfin' && s.host?.replace(/\/$/, '') === jellyfinCreds.host,
      );
      const apiKey = src?.apiKey || jellyfinCreds.apiKey;
      const userId = src?.userId || jellyfinCreds.userId;
      fetchJellyfinEpisodes(jellyfinCreds.host, apiKey, userId, jellyfinCreds.seriesId)
        .then(eps => {
          // seriesRef → "continuar assistindo" guarda a série, não o episódio.
          setAllEpisodes(eps.map(e => ({ ...e, seriesRef: seriesChannel })));
          setLoadingEpisodes(false);
        })
        .catch(e => {
          setFetchError(e.message || 'Erro ao carregar episódios');
          setLoadingEpisodes(false);
        });
      return;
    }

    // Xtream series
    const creds = parseSeriesCredentials(seriesChannel.url);
    if (!creds) {
      setFetchError('URL da série inválida');
      setLoadingEpisodes(false);
      return;
    }

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
        const episodeList: Channel[] = [];
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
              // seriesRef → "continuar assistindo" guarda a série, não o episódio solto.
              seriesRef: seriesChannel,
            });
          }
        }

        setAllEpisodes(episodeList);
        setLoadingEpisodes(false);
      })
      .catch(e => {
        setFetchError(e.message || 'Erro ao carregar episódios');
        setLoadingEpisodes(false);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { doFetchEpisodes(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // TMDB enrichment para séries sem metadados (M3U sem info)
  useEffect(() => {
    const key = settings.tmdbApiKey;
    if (!key || seriesChannel?.plot || seriesChannel?.backdrop) return;
    fetchTmdbSeries(seriesName, key).then(setTmdb);
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

  // Episódio a retomar, considerando TODAS as temporadas — define a temporada que abre
  // por padrão e o card que recebe foco. Prioriza: (1) em curso mais recente,
  // (2) próximo após o último assistido. Sem progresso → null (abre a 1ª temporada).
  const resumeEpisode = useMemo(() => {
    let inProgress: Channel | null = null;
    let inProgressTs = 0;
    let lastWatched: Channel | null = null;
    let lastWatchedTs = 0;
    allEpisodes.forEach(ep => {
      const e = watchEntries[ep.id];
      if (!e) return;
      if (!e.watched && progressFractionFor(e) > 0 && e.updatedAt > inProgressTs) {
        inProgressTs = e.updatedAt;
        inProgress = ep;
      }
      if (e.watched && e.updatedAt > lastWatchedTs) {
        lastWatchedTs = e.updatedAt;
        lastWatched = ep;
      }
    });
    if (inProgress) return inProgress;
    if (lastWatched) {
      const idx = allEpisodes.findIndex(ep => ep.id === (lastWatched as Channel).id);
      return allEpisodes[idx + 1] ?? lastWatched; // próximo episódio, ou o último se for o fim
    }
    return null;
  }, [allEpisodes, watchEntries]);

  // Atualiza temporada selecionada quando episódios são carregados — abre na temporada
  // do episódio a retomar (assistido/em curso), não sempre na primeira.
  const seasonInitialized = useRef(false);
  useEffect(() => {
    if (!seasonInitialized.current && seasonKeys.length > 0) {
      seasonInitialized.current = true;
      setSelectedSeason(resumeEpisode ? parseSeason(resumeEpisode.name) : seasonKeys[0]);
    }
  }, [seasonKeys.length, resumeEpisode]); // eslint-disable-line react-hooks/exhaustive-deps

  const episodes = seasons.get(selectedSeason) || [];

  const currentEpIdx = useMemo(() => {
    // 1) Episódio em curso (progresso salvo, ainda não assistido) — o mais recente
    let bestIdx = -1;
    let bestTs = 0;
    episodes.forEach((c, i) => {
      const e = watchEntries[c.id];
      if (e && !e.watched && progressFractionFor(e) > 0 && e.updatedAt > bestTs) {
        bestTs = e.updatedAt;
        bestIdx = i;
      }
    });
    if (bestIdx >= 0) return bestIdx;
    // 2) Primeiro episódio ainda não assistido
    const firstUnwatched = episodes.findIndex(c => !watchEntries[c.id]?.watched);
    if (firstUnwatched >= 0) return firstUnwatched;
    // 3) Fallback: último reproduzido (recentChannels)
    const recentIds = new Set(recentChannels.map(c => c.id));
    const idx = episodes.findIndex(c => recentIds.has(c.id));
    return idx >= 0 ? idx : 0;
  }, [episodes, recentChannels, watchEntries]);

  const currentEp = episodes[currentEpIdx];
  const currentEpLbl = currentEp ? epLabel(currentEp.name, currentEpIdx) : 'E01';
  const seasonNum = selectedSeason;

  // Ao abrir a série, foca/rola até o episódio a retomar (uma única vez). Só atua na
  // temporada que abriu automaticamente — trocas manuais de temporada começam do topo.
  const didFocusResume = useRef(false);
  useEffect(() => {
    if (didFocusResume.current || !seasonInitialized.current || episodes.length === 0) return;
    if (resumeEpisode && parseSeason(resumeEpisode.name) !== selectedSeason) return;
    didFocusResume.current = true;
    if (currentEpIdx > 0) {
      setFocusedEp(currentEpIdx);
      if (IS_TV) {
        requestAnimationFrame(() => {
          railRef.current?.scrollToIndex({ index: currentEpIdx, viewPosition: 0.5, animated: false });
        });
      }
    }
  }, [episodes, currentEpIdx, selectedSeason, resumeEpisode]);

  const lockAndNavigate = (
    ch: Channel,
    subtitleIndex: number | null = null,
    subtitleTracks: import('../types').SubtitleTrack[] = [],
    audioIndex: number | null = null,
    audioTracks: import('../types').AudioTrack[] = [],
  ) => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
    setCurrentChannel(ch);
    // Playlist = episódios da temporada exibida → habilita auto-play do próximo ep
    const playlistIndex = episodes.findIndex(e => e.id === ch.id);
    navigation.navigate('Player', {
      channel: ch,
      initialSubtitleIndex: subtitleIndex,
      initialSubtitleTracks: subtitleTracks,
      initialAudioIndex: audioIndex,
      initialAudioTracks: audioTracks,
      playlist: episodes,
      playlistIndex: playlistIndex >= 0 ? playlistIndex : 0,
    });
  };

  const handlePlay = (ch: Channel) => {
    if (parseJellyfinVideoUrl(ch.url)) {
      pendingEpRef.current = ch;
      setTrackSheetUrl(ch.url);
      return;
    }
    lockAndNavigate(ch);
  };

  const handleTrackConfirm = (
    _url: string,
    subtitleIndex: number | null,
    subtitleTracks: import('../types').SubtitleTrack[],
    audioIndex: number | null,
    audioTracks: import('../types').AudioTrack[],
  ) => {
    const ch = pendingEpRef.current;
    setTrackSheetUrl(null);
    pendingEpRef.current = null;
    if (!ch) return;
    lockAndNavigate(ch, subtitleIndex, subtitleTracks, audioIndex, audioTracks);
  };

  // ── Loading / Error ───────────────────────────────────────────────────────
  if (loadingEpisodes) {
    return (
      <View style={[styles.root, loadStyles.center]}>
        <StatusBar hidden />
        {heroChannel?.backdrop || heroChannel?.logo ? (
          <Image
            source={heroChannel.backdrop || heroChannel.logo}
            style={StyleSheet.absoluteFillObject}
            contentFit="cover"
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
        <TVFocusable onPress={doFetchEpisodes} style={loadStyles.retryBtn} hasTVPreferredFocus>
          <Ionicons name="refresh-outline" size={16} color={colors.white} />
          <Text style={loadStyles.retryBtnText}>Tentar novamente</Text>
        </TVFocusable>
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
        <TVFocusable onPress={doFetchEpisodes} style={loadStyles.retryBtn} hasTVPreferredFocus>
          <Ionicons name="refresh-outline" size={16} color={colors.white} />
          <Text style={loadStyles.retryBtnText}>Recarregar</Text>
        </TVFocusable>
        <TVFocusable onPress={() => navigation.goBack()} style={loadStyles.backBtn}>
          <Text style={loadStyles.backBtnText}>Voltar</Text>
        </TVFocusable>
      </View>
    );
  }

  // ── Metadados para exibição ───────────────────────────────────────────────
  const groupClean = heroChannel?.group?.replace(/[♦◆️\uFE0F]\s*/g, '').trim() || '';

  const displayPlot = seriesChannel?.plot || tmdb?.plot
    || (isXtreamSeries ? (seriesChannel?.genre || '') : groupClean);

  const displayGenre = seriesChannel?.genre || tmdb?.genre || groupClean || 'Drama';

  const backdropUri = seriesChannel?.backdrop || seriesChannel?.logo
    || tmdb?.backdrop || tmdb?.poster || heroChannel?.logo;

  const trackSheet = (
    <JellyfinTrackSheet
      visible={trackSheetUrl !== null}
      channelUrl={trackSheetUrl ?? ''}
      onConfirm={handleTrackConfirm}
      onCancel={() => { setTrackSheetUrl(null); pendingEpRef.current = null; }}
    />
  );

  // ── TV Layout ─────────────────────────────────────────────────────────────
  if (IS_TV) {
    // Valores responsivos calculados a partir da largura real da tela.
    // Em telas largas usa fração menor (mais cards visíveis); em telas estreitas,
    // garante um tamanho mínimo de card para não ficar grande demais.
    const cardW = clamp(sw * 0.195, 200, 360);  // ~220px em 1280 · ~268px em 1366 · 360px (cap) em 1920+
    const cardH = Math.round(cardW * (9 / 16)); // proporção 16:9 sempre
    const pH    = clamp(sw * 0.035, 24, 80);    // padding horizontal geral
    const gap   = clamp(sw * 0.013, 10, 28);    // espaço entre cards
    const stride = cardW + gap;                 // passo para getItemLayout/scroll

    // Tipografia responsiva com limites legíveis (evita micro-texto em 720p / exagero em 4K)
    const fTitle   = clamp(sw * 0.038, 26, 56);
    const fTitleLh = clamp(sw * 0.044, 30, 64);
    const fMeta    = clamp(sw * 0.010, 12, 20);
    const fBadge   = clamp(sw * 0.008, 10, 16);
    const fSyn     = clamp(sw * 0.011, 13, 22);
    const fSynLh   = clamp(sw * 0.016, 18, 30);
    const fPill    = clamp(sw * 0.009, 12, 19);
    const fEpCount = clamp(sw * 0.007,  9, 15);
    const fEpCode  = clamp(sw * 0.008, 10, 16);
    const fEpTitle = clamp(sw * 0.010, 12, 19);
    const fEpSyn   = clamp(sw * 0.008, 10, 15);
    const fEpDur   = clamp(sw * 0.007,  9, 14);
    const padTop   = clamp(sh * 0.07,  44, 110);

    // Mantém o card em foco visível e sincroniza o destaque (play + sinopse) com o D-pad
    const focusEpisode = (index: number) => {
      setFocusedEp(index);
      railRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
    };

    return (
      <View style={tvStyles.root}>
        <StatusBar hidden />
        {trackSheet}
        {backdropUri ? (
          <Image source={backdropUri} style={tvStyles.backdrop} contentFit="cover" />
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

        <TVFocusable
          onPress={() => navigation.goBack()}
          style={[tvStyles.backBtn, { top: Math.round(sh * 0.04), left: pH }]}
          hasTVPreferredFocus
        >
          <Ionicons name="chevron-back" size={Math.round(sw * 0.013)} color={colors.text1} />
        </TVFocusable>

        {/* Flex column: empurra título para cima e rail para baixo */}
        <View style={[tvStyles.content, { paddingTop: padTop }]}>
          {/* Título + meta */}
          <View style={[tvStyles.titleBlock, { paddingLeft: pH, width: clamp(sw * 0.42, 360, 900) }]}>
            <View style={tvStyles.origBadge}>
              <Text style={[tvStyles.origBadgeText, { fontSize: fBadge }]}>
                SÉRIE · {seasonKeys.length} TEMPORADA{seasonKeys.length !== 1 ? 'S' : ''}
              </Text>
            </View>
            <Text
              style={[tvStyles.title, { fontSize: fTitle, lineHeight: fTitleLh }]}
              numberOfLines={2}
            >
              {baseName}
            </Text>
            <View style={tvStyles.metaRow}>
              <Text style={[tvStyles.metaAcc, { fontSize: fMeta }]}>
                {allEpisodes.length} episódios
              </Text>
              {seriesChannel?.rating ? (
                <View style={tvStyles.ratingBadge}>
                  <Text style={[tvStyles.ratingText, { fontSize: fBadge }]}>
                    {seriesChannel.rating}
                  </Text>
                </View>
              ) : (
                <View style={tvStyles.ratingBadge}>
                  <Text style={[tvStyles.ratingText, { fontSize: fBadge }]}>TV-MA</Text>
                </View>
              )}
              {heroChannel?.quality && (
                <View style={tvStyles.ratingBadge}>
                  <Text style={[tvStyles.ratingText, { fontSize: fBadge }]}>
                    {heroChannel.quality}
                  </Text>
                </View>
              )}
            </View>
            <View style={{ maxWidth: clamp(sw * 0.34, 300, 720) }}>
              <ExpandableText
                style={[tvStyles.synopsis, { fontSize: fSyn, lineHeight: fSynLh }]}
                collapsedLines={2}
                title={baseName}
                text={displayPlot || displayGenre}
              />
            </View>
          </View>

          {/* Pills de temporada + rail de episódios */}
          <View style={tvStyles.bottom}>
            <View style={[tvStyles.seasonRow, { paddingLeft: pH }]}>
              {seasonKeys.map((s) => {
                const active = s === selectedSeason;
                return (
                  <TVFocusable
                    key={s}
                    onPress={() => {
                      setSelectedSeason(s);
                      setFocusedEp(0);
                      railRef.current?.scrollToOffset({ offset: 0, animated: false });
                    }}
                    style={[tvStyles.seasonPill, active && tvStyles.seasonPillActive]}
                  >
                    <Text
                      style={[
                        tvStyles.seasonPillText,
                        active && tvStyles.seasonPillTextActive,
                        { fontSize: fPill },
                      ]}
                    >
                      {seasonLabel(s)}
                    </Text>
                  </TVFocusable>
                );
              })}
              <Text style={[tvStyles.epCount, { fontSize: fEpCount }]}>
                {episodes.length} EPISÓDIOS
              </Text>
            </View>

            <FlatList
              ref={railRef}
              horizontal
              data={episodes}
              keyExtractor={item => item.id}
              style={tvStyles.rail}
              contentContainerStyle={[
                tvStyles.railContent,
                { paddingHorizontal: pH, gap },
              ]}
              showsHorizontalScrollIndicator={false}
              initialScrollIndex={Math.min(currentEpIdx, Math.max(0, episodes.length - 1))}
              getItemLayout={(_, index) => ({ length: stride, offset: stride * index + pH, index })}
              onScrollToIndexFailed={() => {}}
              renderItem={({ item, index }) => {
                const focused = index === focusedEp;
                const label = epLabel(item.name, index);
                const isResumeEp = index === currentEpIdx;
                const entry = watchEntries[item.id];
                const epWatched = !!entry?.watched;
                const epFrac = epWatched ? 0 : progressFractionFor(entry);
                const epName = item.name
                  .replace(/\s*[-–]?\s*S\d+\s*E\d+.*$/i, '')
                  .replace(baseName, '')
                  .trim() || item.name;
                return (
                  <TVFocusable
                    onFocus={() => focusEpisode(index)}
                    onPress={() => { setFocusedEp(index); handlePlay(item); }}
                    style={[tvStyles.epCard, { width: cardW }, focused && tvStyles.epCardFocused]}
                    hasTVPreferredFocus={isResumeEp}
                  >
                    <View style={[tvStyles.epThumbWrap, { width: cardW, height: cardH }]}>
                      <EpThumb logo={item.logo} size={{ w: cardW, h: cardH }} />
                      {epWatched && (
                        <View style={tvStyles.epWatchedBadge}>
                          <Ionicons name="checkmark" size={Math.round(cardW * 0.06)} color="#0a0a0b" />
                        </View>
                      )}
                      {epFrac > 0 && (
                        <View style={tvStyles.epProgress}>
                          <View style={[tvStyles.epProgressFill, { width: `${Math.round(epFrac * 100)}%` }]} />
                        </View>
                      )}
                      {focused && (
                        <View style={tvStyles.epPlayOverlay}>
                          <View
                            style={[
                              tvStyles.epPlayBtn,
                              {
                                width: Math.round(cardW * 0.22),
                                height: Math.round(cardW * 0.22),
                                borderRadius: Math.round(cardW * 0.11),
                              },
                            ]}
                          >
                            <Ionicons name="play" size={Math.round(cardW * 0.08)} color="#0a0a0b" />
                          </View>
                        </View>
                      )}
                    </View>
                    <View style={tvStyles.epMeta}>
                      <Text style={[tvStyles.epCode, { fontSize: fEpCode }]}>{label}</Text>
                      <Text
                        style={[
                          tvStyles.epTitle,
                          focused && tvStyles.epTitleFocused,
                          { fontSize: fEpTitle },
                        ]}
                        numberOfLines={1}
                      >
                        {epName}
                      </Text>
                    </View>
                    {focused ? (
                      <Text
                        style={[tvStyles.epSynopsis, { fontSize: fEpSyn, maxWidth: cardW }]}
                        numberOfLines={2}
                      >
                        {item.plot || displayGenre}
                      </Text>
                    ) : null}
                    <Text style={[tvStyles.epDur, { fontSize: fEpDur }]}>
                      {item.quality ? `${item.quality} · ` : ''}{item.name.match(/\d+\s*min/)?.[0] || '~50min'}
                    </Text>
                  </TVFocusable>
                );
              }}
            />
          </View>
        </View>
      </View>
    );
  }

  // ── Mobile Layout ─────────────────────────────────────────────────────────
  // Dimensões proporcionais à tela (responsivo entre telefones pequenos e tablets)
  const heroH      = clamp(sh * 0.48, 320, 560);
  const thumbW     = clamp(sw * 0.30, 96, 150);
  const thumbH     = Math.round(thumbW * (9 / 16));
  const fHeroTitle = clamp(sw * 0.078, 24, 40);
  return (
    <View style={styles.root}>
      <StatusBar hidden />
      {trackSheet}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        <View style={[styles.hero, { height: heroH }]}>
          {backdropUri ? (
            <Image source={backdropUri} style={styles.heroImg} contentFit="cover" />
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
            <Text style={[styles.heroTitle, { fontSize: fHeroTitle, lineHeight: Math.round(fHeroTitle * 1.12) }]} numberOfLines={2}>{baseName}</Text>
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
          <ExpandableText
            style={styles.synopsis}
            collapsedLines={4}
            text={displayPlot ? displayPlot : `Série do gênero ${displayGenre}.`}
          />
          <View style={styles.metaGrid}>
            <View style={styles.metaItem}>
              <Text style={styles.metaKey}>Gênero</Text>
              <Text style={styles.metaVal}>{displayGenre}</Text>
            </View>
            {isXtreamSeries && seriesChannel?.cast ? (
              <View style={styles.metaItem}>
                <Text style={styles.metaKey}>Elenco</Text>
                <Text style={styles.metaVal}>{seriesChannel.cast}</Text>
              </View>
            ) : null}
            {isXtreamSeries && seriesChannel?.director ? (
              <View style={styles.metaItem}>
                <Text style={styles.metaKey}>Direção</Text>
                <Text style={styles.metaVal}>{seriesChannel.director}</Text>
              </View>
            ) : null}
            <View style={styles.metaItem}>
              <Text style={styles.metaKey}>Temporadas</Text>
              <Text style={styles.metaVal}>{seasonKeys.length}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaKey}>Episódios</Text>
              <Text style={styles.metaVal}>{allEpisodes.length}</Text>
            </View>
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
            const entry = watchEntries[item.id];
            const watched = !!entry?.watched;
            const frac = watched ? 0 : progressFractionFor(entry);
            const inProgress = frac > 0;
            return (
              <TVFocusable
                key={item.id}
                onPress={() => handlePlay(item)}
                style={[styles.epRow, index < episodes.length - 1 && styles.epRowBorder]}
              >
                <View style={[styles.epThumbWrap, { width: thumbW }]}>
                  <EpThumb logo={item.logo} size={{ w: thumbW, h: thumbH }} />
                  {inProgress && (
                    <View style={styles.epProgress}>
                      <View style={[styles.epProgressFill, { width: `${Math.round(frac * 100)}%` }]} />
                    </View>
                  )}
                  {watched && (
                    <View style={styles.epWatchedBadge}>
                      <Ionicons name="checkmark" size={12} color="#0a0a0b" />
                    </View>
                  )}
                  {!inProgress && !watched && (
                    <View style={styles.epPlayHint}>
                      <Ionicons name="play-circle" size={26} color="rgba(255,255,255,0.7)" />
                    </View>
                  )}
                </View>

                <View style={styles.epMeta}>
                  <View style={styles.epMetaTop}>
                    <Text style={styles.epCode}>{label}</Text>
                    {inProgress && <View style={styles.watchingBadge}><Text style={styles.watchingText}>EM CURSO</Text></View>}
                    {watched && <View style={styles.watchedBadgePill}><Text style={styles.watchedText}>ASSISTIDO</Text></View>}
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
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 8,
    paddingHorizontal: 24, paddingVertical: 10,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
  },
  retryBtnText: { fontSize: 14, fontWeight: '600', color: colors.white },
  backBtn: {
    marginTop: 8,
    paddingHorizontal: 24, paddingVertical: 10,
    backgroundColor: colors.bg2,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
  },
  backBtnText: { fontSize: 14, fontWeight: '600', color: colors.text1 },
});

// ── TV Styles ─────────────────────────────────────────────────────────────────
// Apenas valores que NÃO dependem da resolução ficam aqui.
// Tudo que escala com a tela é calculado inline no JSX usando sw/sh/cardW/cardH.
const tvStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg0 },

  backdrop: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
  },

  content: {
    flex: 1,
    justifyContent: 'space-between',
    paddingTop: 80,
  },
  bottom: {
    paddingBottom: 40,
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
    width: 36, height: 36, borderRadius: radius.full,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
    zIndex: 10,
  },

  titleBlock: {
    // width e paddingLeft vêm do JSX (responsivos)
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
    // fontSize vem do JSX
    fontWeight: '700', color: colors.accent, letterSpacing: 0.6,
  },
  title: {
    // fontSize e lineHeight vêm do JSX
    fontFamily: fontFamily.semiBold,
    color: colors.text1, letterSpacing: -1.3,
  },
  metaRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 12,
  },
  metaAcc: {
    // fontSize vem do JSX
    fontWeight: '600', color: colors.accent,
  },
  ratingBadge: {
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4,
  },
  ratingText: {
    // fontSize vem do JSX
    color: colors.text2,
  },
  synopsis: {
    // fontSize, lineHeight e maxWidth vêm do JSX
    color: colors.text1, opacity: 0.85,
    marginTop: 14,
  },

  seasonRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    // paddingLeft vem do JSX
    paddingBottom: 16,
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
    // fontSize vem do JSX
    fontWeight: '500', color: colors.text2,
  },
  seasonPillTextActive: {
    color: '#0a0a0b', fontWeight: '600',
  },
  epCount: {
    // fontSize vem do JSX
    color: colors.text3,
    letterSpacing: 0.4, marginLeft: 14,
    fontFamily: fontFamily.medium,
  },

  rail: {
    flexShrink: 0,
  },
  railContent: {
    // paddingHorizontal e gap vêm do JSX
  },
  epCard: {
    // width vem do JSX
  },
  epCardFocused: {
    transform: [{ translateY: -6 }],
  },
  epThumbWrap: {
    // width e height vêm do JSX
    position: 'relative',
    borderRadius: 10,
    overflow: 'hidden',
  },
  epPlayOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center', justifyContent: 'center',
  },
  epWatchedBadge: {
    position: 'absolute', top: 8, right: 8,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
    zIndex: 2,
  },
  epProgress: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: 4, backgroundColor: 'rgba(255,255,255,0.25)',
    zIndex: 2,
  },
  epProgressFill: { height: '100%', backgroundColor: colors.accent },
  epPlayBtn: {
    // width, height e borderRadius vêm do JSX
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center', justifyContent: 'center',
  },
  epMeta: {
    flexDirection: 'row', gap: 8, alignItems: 'baseline',
    marginTop: 12,
  },
  epCode: {
    // fontSize vem do JSX
    color: colors.text3,
    fontFamily: fontFamily.medium, letterSpacing: 0.4,
  },
  epTitle: {
    // fontSize vem do JSX
    fontWeight: '500', color: colors.text2,
    flex: 1, overflow: 'hidden',
  },
  epTitleFocused: {
    fontWeight: '600', color: colors.text1,
  },
  epSynopsis: {
    // fontSize e maxWidth vêm do JSX
    color: colors.text3,
    lineHeight: 17, marginTop: 6,
  },
  epDur: {
    // fontSize vem do JSX
    color: colors.text3, marginTop: 6, letterSpacing: 0.3,
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
  metaGrid: { gap: 2 },
  metaItem: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingVertical: 7,
    borderBottomWidth: 1, borderBottomColor: colors.borderSoft,
  },
  metaKey: { width: 100, fontSize: 12, color: colors.text3 },
  metaVal: { flex: 1, fontSize: 12, color: colors.text1 },

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
  watchedBadgePill: {
    paddingHorizontal: 6, paddingVertical: 1, borderRadius: 3,
    backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.borderSoft,
  },
  watchedText: { fontSize: 8, fontWeight: '700', color: colors.text3, letterSpacing: 0.4 },
  epWatchedBadge: {
    position: 'absolute', top: 4, right: 4,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  epTitle: { fontSize: 13, fontWeight: '500', color: colors.text1, lineHeight: 18 },
  epPlot: { fontSize: 11, color: colors.text3, lineHeight: 16, marginTop: 3 },
  epDur: { fontSize: 10, color: colors.text3, marginTop: 4 },
});