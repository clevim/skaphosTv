// DetailScreen.tsx — Filme/VOD detail page
// Mobile: vertical scroll with hero top
// TV: palco em tela cheia (arte + coluna de info + ações) e "Mais como este" abaixo
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, FlatList,
  StatusBar, useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useStore, resolveChannelType } from '../store/useStore';
import { useWatchProgress, useWatchEntries, progressFractionFor, resumePositionFor } from '../store/watchProgress';
import TVFocusable from '../components/TVFocusable';
import { SkChip, SkDecodeText } from '../components/sk';
import PulsingDot from '../components/PulsingDot';
import GlassButton from '../components/GlassButton';
import JellyfinTrackSheet from '../components/JellyfinTrackSheet';
import ExpandableText from '../components/ExpandableText';
import { colors, fontSize, radius, fontFamily, spacing, shadow } from '../utils/theme';
import { useAccentColors } from '../hooks/useAccentColors';
import { RootStackParamList } from '../types';
import { getSeriesBaseName, cleanGroupName, cleanDisplayName } from '../utils/channelUtils';
import { IS_TV, IS_WEB } from '../utils/tvDetect';
import { fetchVodInfo, parseMovieCredentials, XtreamVodDetails } from '../utils/xtreamApi';
import { parseJellyfinVideoUrl } from '../utils/jellyfinLoader';
import { useTVFocusMemory } from '../utils/tvFocusMemory';

type DetailRoute = RouteProp<RootStackParamList, 'Detail'>;
type Nav = StackNavigationProp<RootStackParamList>;

const TABS = ['Sobre', 'Mais como este'] as const;
// TV: fileira "Mais como este" (fonte única p/ estilo e getItemLayout)
const TV_PAD = 48;
const REL_W = 120;
const REL_GAP = 16;
type Tab = typeof TABS[number];


export default function DetailScreen() {
  // Devolve o foco do D-pad pro item de onde o usuário saiu ao voltar pra cá
  useTVFocusMemory();

  const navigation = useNavigation<Nav>();
  const route = useRoute<DetailRoute>();
  const { channel, relatedChannels = [] } = route.params;
  const setCurrentChannel = useStore(s => s.setCurrentChannel);
  const toggleFavorite    = useStore(s => s.toggleFavorite);
  const favorites         = useStore(s => s.favorites);
  const [activeTab, setActiveTab] = useState<Tab>('Sobre');
  const [trackSheetUrl, setTrackSheetUrl] = useState<string | null>(null);
  const tvScrollRef = useRef<ScrollView>(null);
  const { height: winH } = useWindowDimensions();

  const acc = useAccentColors();
  const type = resolveChannelType(channel);
  const displayName = cleanDisplayName(type === 'series' ? getSeriesBaseName(channel.name) : channel.name);
  const groupClean = (channel.group ? cleanGroupName(channel.group) : '') || '';
  const isFav = favorites.includes(channel.id);
  const typeLabel = type === 'movies' ? 'Filme' : type === 'series' ? 'Série' : 'Canal';

  // Detalhes ricos do próprio painel Xtream (get_vod_info) — sinopse, elenco,
  // nota, backdrop. A lista de VOD raramente traz esses campos; o endpoint
  // por título traz quase sempre.
  const [vod, setVod] = useState<XtreamVodDetails | null>(null);
  useEffect(() => {
    if (type !== 'movies' || (channel.plot && channel.backdrop)) return;
    const creds = parseMovieCredentials(channel.url);
    if (!creds) return;
    let alive = true;
    fetchVodInfo(creds.host, creds.user, creds.pass, creds.vodId)
      .then(info => { if (alive && info) setVod(info); });
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Precedência: dados do canal (lista) → get_vod_info (painel). Backdrop de
  // verdade (paisagem) pode cobrir a área e recortar; na falta dele, caímos
  // pro logo (retrato/quadrado) — aí "cover" recorta esquisito e o banner
  // parece torto, então esse caso usa "contain" centralizado.
  const heroImage  = channel.backdrop ?? vod?.backdrop ?? channel.logo;
  const heroIsLogo = !channel.backdrop && !vod?.backdrop && !!channel.logo;
  const displayGenre  = channel.genre  || vod?.genre  || groupClean;
  const ratingValue   = channel.rating || vod?.rating;
  const displayRating = ratingValue ? `★ ${ratingValue}` : null;
  const displayYear   = (channel.releaseDate ?? vod?.releaseDate)?.slice(0, 4) ?? null;
  const displayPlot   = channel.plot   || vod?.plot;
  const displayCast   = channel.cast   || vod?.cast;
  const displayDir    = channel.director || vod?.director;

  const isJellyfin = !!parseJellyfinVideoUrl(channel.url);

  // "Assistido" manual (só VOD — ao vivo não tem noção de assistido).
  const watchEntry = useWatchEntries()[channel.id];
  const isWatched = !!watchEntry?.watched;
  const toggleWatched = () => {
    const wp = useWatchProgress.getState();
    isWatched ? wp.clear(channel.id) : wp.markWatched(channel.id);
  };

  // Retomada: com progresso salvo o CTA vira "Retomar" com barra + tempo restante.
  const resumeFrac = type !== 'live' && !isWatched && resumePositionFor(watchEntry) > 0
    ? progressFractionFor(watchEntry) : 0;
  const remainMin = watchEntry && resumeFrac > 0
    ? Math.max(1, Math.round((watchEntry.durationSec - watchEntry.positionSec) / 60)) : 0;
  const playLabel = resumeFrac > 0 ? 'Retomar' : 'Assistir agora';

  // Duração: painel (get_vod_info "HH:MM:SS"/minutos) → canal → o que o player já mediu.
  const durSecs = (() => {
    if (channel.durationSecs) return channel.durationSecs;
    const raw = vod?.duration;
    if (raw) {
      const p = String(raw).split(':').map(Number);
      if (p.every(n => !isNaN(n))) {
        const v = p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 60 + p[1] : p[0] * 60;
        if (v > 0) return v;
      }
    }
    return watchEntry?.durationSec || 0;
  })();
  const durMin = Math.round(durSecs / 60);
  const displayDuration = type === 'live' || durMin <= 0 ? null
    : durMin >= 60 ? `${Math.floor(durMin / 60)}h ${String(durMin % 60).padStart(2, '0')}min` : `${durMin}min`;
  const castShort = displayCast ? displayCast.split(',').slice(0, 4).map((x: string) => x.trim()).filter(Boolean).join(', ') : '';

  // "Começar do início": zera o progresso salvo (a retomada lê dele) e toca.
  const handleStartOver = () => {
    useWatchProgress.getState().clear(channel.id);
    handlePlay();
  };

  const handlePlay = () => {
    if (isJellyfin) {
      setTrackSheetUrl(channel.url);
      return;
    }
    setCurrentChannel(channel);
    navigation.navigate('Player', { channel });
  };

  const doPlay = (
    _url: string,
    subtitleIndex: number | null,
    subtitleTracks: import('../types').SubtitleTrack[],
    audioIndex: number | null,
    audioTracks: import('../types').AudioTrack[],
  ) => {
    setTrackSheetUrl(null);
    setCurrentChannel(channel);
    navigation.navigate('Player', {
      channel,
      initialSubtitleIndex: subtitleIndex,
      initialSubtitleTracks: subtitleTracks,
      initialAudioIndex: audioIndex,
      initialAudioTracks: audioTracks,
    });
  };

  // ── Shared: tab content (about + related grid) ──────────────────────────────
  const tabContent = (
    <>
      {/* Só mobile: a TV mostra tudo numa página só (palco + "Mais como este"). */}
      <View style={styles.tabBar}>
        {TABS.map(tab => {
          const on = tab === activeTab;
          return (
            <TVFocusable key={tab} onPress={() => setActiveTab(tab)} style={styles.tab}>
              <Text style={[styles.tabText, on && styles.tabTextActive]}>{tab}</Text>
              {on && <View style={[styles.tabIndicator, { backgroundColor: acc.accent }]} />}
            </TVFocusable>
          );
        })}
      </View>

      {activeTab === 'Sobre' ? (
        <View style={styles.about}>
          {/* Synopsis */}
          <ExpandableText
            style={styles.synopsis}
            collapsedLines={4}
            title={displayName}
            text={displayPlot ||
              (groupClean
                ? `Conteúdo ${typeLabel.toLowerCase()} do grupo ${groupClean}.`
                : `Conteúdo ${typeLabel.toLowerCase()}.`)}
          />

          {/* Metadata grid */}
          <View style={styles.metaGrid}>
            {displayGenre ? (
              <View style={styles.metaItem}>
                <Text style={styles.metaKey}>Gênero</Text>
                <Text style={styles.metaVal}>{displayGenre}</Text>
              </View>
            ) : null}
            {displayYear ? (
              <View style={styles.metaItem}>
                <Text style={styles.metaKey}>Ano</Text>
                <Text style={styles.metaVal}>{displayYear}</Text>
              </View>
            ) : null}
            {displayRating ? (
              <View style={styles.metaItem}>
                <Text style={styles.metaKey}>Avaliação</Text>
                <Text style={styles.metaVal}>{displayRating}</Text>
              </View>
            ) : null}
            {displayDir ? (
              <View style={styles.metaItem}>
                <Text style={styles.metaKey}>Diretor</Text>
                <Text style={styles.metaVal}>{displayDir}</Text>
              </View>
            ) : null}
            {displayCast ? (
              <View style={styles.metaItem}>
                <Text style={styles.metaKey}>Elenco</Text>
                <Text style={styles.metaVal}>{displayCast}</Text>
              </View>
            ) : null}
            {channel.quality ? (
              <View style={styles.metaItem}>
                <Text style={styles.metaKey}>Qualidade</Text>
                <Text style={styles.metaVal}>{channel.quality}</Text>
              </View>
            ) : null}
          </View>
        </View>
      ) : (
        <View style={styles.relatedGrid}>
          {relatedChannels.slice(0, 9).map(ch => {
            const rName = resolveChannelType(ch) === 'series'
              ? getSeriesBaseName(ch.name) : ch.name;
            return (
              <TVFocusable
                key={ch.id}
                onPress={() => navigation.replace('Detail', { channel: ch, relatedChannels })}
                style={styles.relCard}
              >
                <View style={styles.relPoster}>
                  {ch.logo ? (
                    <Image source={ch.logo} style={styles.relPosterImg} contentFit="cover" transition={0} cachePolicy="memory-disk" recyclingKey={ch.id} />
                  ) : (
                    <View style={styles.relPosterFallback}>
                      <Text style={[styles.relPosterInitials, { color: acc.accent }]}>{rName.slice(0, 2).toUpperCase()}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.relTitle} numberOfLines={2}>{rName}</Text>
              </TVFocusable>
            );
          })}
          {relatedChannels.length === 0 && (
            <Text style={styles.emptyRelated}>{'Nenhum conteúdo relacionado'}</Text>
          )}
        </View>
      )}
    </>
  );

  // ── TV Layout: palco + fileira ──────────────────────────────────────────────
  // Zonas: (1) palco = arte em tela cheia + coluna de informação à esquerda,
  // ações numa linha; (2) abaixo, "Mais como este" espiando no rodapé.
  // Foco: Assistir é o preferido; ↓ desce pra fileira (a tela rola), ↑ volta e
  // a tela retorna ao topo. Sem abas "Sobre/Mais como este" (parada de foco que
  // escondia metade do conteúdo) e sem Voltar na TV física (o controle tem).
  if (IS_TV) {
    const realBackdrop = !!heroImage && !heroIsLogo;
    const toTop = () => tvScrollRef.current?.scrollTo({ y: 0, animated: true });
    return (
      <View style={tv.root}>
        {trackSheetUrl !== null && (
          <JellyfinTrackSheet
            visible
            channelUrl={trackSheetUrl}
            onConfirm={doPlay}
            onCancel={() => setTrackSheetUrl(null)}
          />
        )}
        <StatusBar hidden />

        {/* Arte: backdrop de verdade cobre a tela; sem ele, o pôster entra inteiro
            num tile à direita (nunca ampliado/cortado). */}
        {realBackdrop ? (
          <Image source={heroImage} style={tv.fill} contentFit="cover" transition={150} cachePolicy="memory-disk" />
        ) : (
          <LinearGradient colors={[colors.bg2, '#15111f', colors.bg0]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={[tv.fill, tv.posterStage]}>
            {heroImage ? (
              <View style={tv.posterTile}>
                <Image source={heroImage} style={tv.fillRel} contentFit="cover" transition={150} cachePolicy="memory-disk" />
              </View>
            ) : null}
          </LinearGradient>
        )}
        <LinearGradient
          colors={['rgba(10,8,16,0.94)', 'rgba(10,8,16,0.6)', 'rgba(10,8,16,0)']}
          locations={[0, 0.5, 1]}
          start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
          style={tv.gradH}
        />
        <LinearGradient
          colors={['rgba(10,8,16,0)', colors.bg0]}
          style={tv.gradV}
        />

        <ScrollView ref={tvScrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={tv.scroll}>
          <View style={[tv.stage, { minHeight: Math.round(winH * 0.8) }]}>
            <Text style={tv.title} numberOfLines={2}>{displayName}</Text>
            <Text style={tv.meta} numberOfLines={1}>
              {[displayYear ? String(displayYear) : null,
                displayDuration ? String(displayDuration) : null,
                displayGenre || typeLabel,
                displayRating,
                channel.quality && channel.quality !== 'HD' ? channel.quality : null,
              ].filter(Boolean).join('  ·  ')}
            </Text>
            <View style={tv.synopsisWrap}>
              <ExpandableText
                style={tv.synopsis}
                collapsedLines={3}
                title={displayName}
                text={displayPlot || (groupClean ? `${typeLabel} · ${groupClean}` : typeLabel)}
              />
            </View>
            {castShort ? <Text style={tv.cast} numberOfLines={1}>{`Com ${castShort}`}</Text> : null}

            <View style={tv.actions}>
              <TVFocusable
                onPress={handlePlay}
                onFocus={toTop}
                style={[tv.playBtn, { backgroundColor: acc.accent }]}
                focusStyle={{ backgroundColor: acc.accent2 }}
                hasTVPreferredFocus
              >
                <Ionicons name="play" size={18} color={colors.textInverse} />
                <Text style={tv.playText}>{playLabel}</Text>
              </TVFocusable>
              {resumeFrac > 0 && (
                <TVFocusable onPress={handleStartOver} onFocus={toTop} style={tv.ghostBtn} accessibilityLabel="Começar do início">
                  <Ionicons name="refresh" size={17} color={colors.text1} />
                  <Text style={tv.ghostText}>Do início</Text>
                </TVFocusable>
              )}
              <TVFocusable onPress={() => toggleFavorite(channel.id)} onFocus={toTop} style={tv.ghostBtn}>
                <Ionicons name={isFav ? 'checkmark' : 'add'} size={18} color={colors.text1} />
                <Text style={tv.ghostText}>Minha lista</Text>
              </TVFocusable>
              {type !== 'live' && (
                <TVFocusable onPress={toggleWatched} onFocus={toTop} style={tv.ghostBtn}>
                  <Ionicons name={isWatched ? 'eye' : 'eye-outline'} size={17} color={colors.text1} />
                  <Text style={tv.ghostText}>{isWatched ? 'Assistido' : 'Marcar assistido'}</Text>
                </TVFocusable>
              )}
            </View>
            {resumeFrac > 0 && (
              <View style={tv.resume}>
                <View style={shared.resumeTrack}>
                  <View style={[shared.resumeFill, { width: `${Math.round(resumeFrac * 100)}%`, backgroundColor: acc.accent }]} />
                </View>
                <Text style={shared.resumeLabel}>Restam {remainMin} min</Text>
              </View>
            )}
          </View>

          {relatedChannels.length > 0 && (
            <View style={tv.related}>
              <Text style={tv.relatedTitle}>Mais como este</Text>
              <FlatList
                horizontal
                data={relatedChannels.slice(0, 20)}
                keyExtractor={ch => ch.id}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={tv.relatedRow}
                initialNumToRender={8}
                windowSize={3}
                removeClippedSubviews={false}
                getItemLayout={(_, i) => ({ length: REL_W + REL_GAP, offset: (REL_W + REL_GAP) * i + TV_PAD, index: i })}
                renderItem={({ item: ch }) => {
                  const rName = cleanDisplayName(resolveChannelType(ch) === 'series' ? getSeriesBaseName(ch.name) : ch.name);
                  return (
                    <TVFocusable
                      onPress={() => navigation.replace('Detail', { channel: ch, relatedChannels })}
                      style={tv.relCard}
                      accessibilityLabel={rName}
                    >
                      <View style={tv.relPoster}>
                        {ch.logo ? (
                          <Image source={ch.logo} style={tv.fillRel} contentFit="cover" transition={0} cachePolicy="memory-disk" recyclingKey={ch.id} />
                        ) : (
                          <Text style={[tv.relInitials, { color: acc.accent2 }]}>{rName.slice(0, 2).toUpperCase()}</Text>
                        )}
                      </View>
                      <Text style={tv.relName} numberOfLines={1}>{rName}</Text>
                    </TVFocusable>
                  );
                }}
              />
            </View>
          )}
        </ScrollView>

        {/* Voltar visível só no web (teclado/mouse); na TV é a tecla do controle. */}
        {IS_WEB && (
          <TVFocusable accessibilityLabel="Voltar" onPress={() => navigation.goBack()} style={tv.backBtn}>
            <Ionicons name="chevron-back" size={18} color={colors.text1} />
          </TVFocusable>
        )}
      </View>
    );
  }

  // ── Mobile Layout: vertical scroll ──────────────────────────────────────────
  return (
    <View style={styles.root}>
      <StatusBar hidden />
      {trackSheetUrl !== null && (
        <JellyfinTrackSheet
          visible
          channelUrl={trackSheetUrl}
          onConfirm={doPlay}
          onCancel={() => setTrackSheetUrl(null)}
        />
      )}
      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {/* Hero */}
        <View style={styles.hero}>
          {heroImage ? (
            <Image
              source={heroImage}
              style={styles.heroImg}
              contentFit={heroIsLogo ? 'contain' : 'cover'}
              contentPosition="center"
              transition={150}
              cachePolicy="memory-disk"
            />
          ) : (
            <View style={styles.heroFallback}>
              <Text style={[styles.heroInitials, { color: acc.accent }]}>{displayName.slice(0, 3).toUpperCase()}</Text>
            </View>
          )}
          <LinearGradient
            colors={['transparent', 'rgba(10,8,16,0.9)', colors.bg0]}
            locations={[0.35, 0.82, 1]}
            style={styles.heroGradient}
          />

          <TVFocusable accessibilityLabel="Voltar" onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={18} color={colors.text1} />
          </TVFocusable>

          <View style={styles.heroInfo}>
            <View style={styles.typeBadge}>
              {type === 'live' && <PulsingDot size={5} />}
              <Text style={styles.typeText}>
                {typeLabel.toUpperCase()}{groupClean ? ` · ${groupClean.toUpperCase()}` : ''}
              </Text>
            </View>
            <SkDecodeText text={displayName} style={styles.title} numberOfLines={3} />
            <View style={styles.metaRow}>
              {channel.quality ? <SkChip label={channel.quality} variant="ok" /> : null}
              {displayRating ? <SkChip label={String(displayRating)} dot={false} /> : null}
              {displayYear ? <SkChip label={String(displayYear)} dot={false} /> : null}
              {displayDuration ? <SkChip label={String(displayDuration)} dot={false} /> : null}
              <Text style={styles.metaText}>{displayGenre || typeLabel}</Text>
            </View>
            {castShort ? <Text style={styles.metaText} numberOfLines={2}>Elenco: {castShort}</Text> : null}
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <TVFocusable onPress={handlePlay} style={styles.playBtn} focusStyle={[styles.playBtnFocused, { backgroundColor: acc.accent2 }]}>
            <Ionicons name="play" size={16} color={colors.textInverse} />
            <Text style={styles.playText}>{playLabel}</Text>
          </TVFocusable>
          {resumeFrac > 0 && (
            <View style={shared.resumeRow}>
              <View style={shared.resumeTrack}>
                <View style={[shared.resumeFill, { width: `${Math.round(resumeFrac * 100)}%`, backgroundColor: acc.accent }]} />
              </View>
              <Text style={shared.resumeLabel}>Restam {remainMin} min</Text>
            </View>
          )}
          <View style={styles.secondaryActions}>
            {resumeFrac > 0 && (
              <GlassButton icon="refresh" label="Começar do início" onPress={handleStartOver} />
            )}
            <GlassButton
              icon={isFav ? 'heart' : 'heart-outline'}
              label="Minha lista"
              onPress={() => toggleFavorite(channel.id)}
            />
            {type !== 'live' && (
              <GlassButton
                icon={isWatched ? 'checkmark-circle' : 'checkmark-circle-outline'}
                label={isWatched ? 'Assistido' : 'Marcar assistido'}
                onPress={toggleWatched}
              />
            )}
          </View>
        </View>

        {tabContent}
        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

// ── Shared (TV + mobile): barra de retomada sob o CTA ────────────────────────
const shared = StyleSheet.create({
  resumeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginTop: spacing.md,
  },
  resumeTrack: {
    flex: 1, height: 3, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
  },
  resumeFill: { height: '100%', backgroundColor: colors.accent },
  resumeLabel: { fontSize: IS_TV ? 13 : 11, color: colors.text2, flexShrink: 0 },
});

// ── TV Styles ────────────────────────────────────────────────────────────────
const tv = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg0 },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  fillRel: { width: '100%', height: '100%' },
  posterStage: { alignItems: 'flex-end', justifyContent: 'center', paddingRight: '9%' },
  posterTile: {
    width: '19%', aspectRatio: 2 / 3, borderRadius: 14, overflow: 'hidden',
    backgroundColor: colors.bg3, ...shadow.floating,
  },
  gradH: { position: 'absolute', top: 0, left: 0, bottom: 0, width: '78%' },
  gradV: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '45%' },
  scroll: { paddingBottom: 40 },
  stage: {
    justifyContent: 'flex-end',
    paddingHorizontal: TV_PAD, paddingBottom: 8,
  },
  title: {
    maxWidth: '58%',
    fontFamily: fontFamily.bold, fontSize: 44, lineHeight: 48,
    color: colors.text1, letterSpacing: -1.4,
  },
  meta: {
    marginTop: 12, maxWidth: '58%',
    fontFamily: fontFamily.medium, fontSize: 15, color: colors.text2,
  },
  synopsisWrap: { maxWidth: '50%', marginTop: 14 },
  synopsis: { fontFamily: fontFamily.regular, fontSize: 16, lineHeight: 24, color: colors.text1, opacity: 0.88 },
  cast: { marginTop: 10, maxWidth: '50%', fontFamily: fontFamily.regular, fontSize: 14, color: colors.text3 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 24 },
  playBtn: {
    height: 48, paddingHorizontal: 28, borderRadius: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  playText: { fontFamily: fontFamily.semiBold, fontSize: 16, color: colors.textInverse },
  ghostBtn: {
    height: 48, paddingHorizontal: 20, borderRadius: 12,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  ghostText: { fontFamily: fontFamily.medium, fontSize: 15, color: colors.text1 },
  resume: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14, width: 320 },
  related: { marginTop: 28 },
  relatedTitle: {
    paddingHorizontal: TV_PAD,
    fontFamily: fontFamily.semiBold, fontSize: 19, color: colors.text1, letterSpacing: -0.3,
  },
  // Folga vertical/lateral: o card focado amplia 5% e o anel fica 5px fora.
  relatedRow: { paddingHorizontal: TV_PAD, paddingVertical: 16, gap: REL_GAP },
  relCard: { width: REL_W },
  relPoster: {
    width: REL_W, aspectRatio: 2 / 3, borderRadius: 10, overflow: 'hidden',
    backgroundColor: colors.bg2, alignItems: 'center', justifyContent: 'center',
  },
  relInitials: { fontFamily: fontFamily.bold, fontSize: 18, opacity: 0.6 },
  relName: { marginTop: 8, fontFamily: fontFamily.medium, fontSize: 13, color: colors.text2 },
  backBtn: {
    position: 'absolute', top: 28, left: 28,
    width: 40, height: 40, borderRadius: radius.full,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
});

// ── Mobile Styles ────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg0 },
  scroll: { flex: 1 },
  content: {},

  hero: {
    position: 'relative',
    height: 460,
    backgroundColor: colors.bg3,
  },
  heroImg: { width: '100%', height: '100%' },
  heroFallback: {
    width: '100%', height: '100%',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.bg2,
  },
  heroInitials: {
    fontSize: 64, fontWeight: '800', color: colors.accent,
    letterSpacing: 6, opacity: 0.2,
  },
  heroGradient: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: '65%',
  },
  backBtn: {
    position: 'absolute', top: 48, left: 18,
    width: 36, height: 36, borderRadius: radius.full,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  heroInfo: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 22, paddingBottom: 20,
  },
  typeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginBottom: 6,
  },
  typeText: {
    fontSize: 10, color: colors.text2,
    letterSpacing: 0.6, textTransform: 'uppercase',
  },
  title: {
    fontSize: 32, fontFamily: fontFamily.semiBold,
    color: colors.text1, letterSpacing: -0.8, lineHeight: 36,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 12,
  },
  metaBadge: {
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  metaBadgeText: { fontSize: 9, color: colors.text2, fontWeight: '600' },
  metaText: { fontSize: 12, color: colors.text2 },

  actions: { padding: 22, paddingTop: 4, gap: 10 },
  playBtn: {
    width: '100%', height: 48, borderRadius: 12,
    backgroundColor: colors.text1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  playBtnFocused: { backgroundColor: colors.accent2 },
  playText: { fontSize: 15, fontWeight: '600', color: colors.textInverse },
  secondaryActions: { flexDirection: 'row', gap: 8 },

  tabBar: {
    flexDirection: 'row', gap: 24,
    paddingHorizontal: 22, paddingTop: 8,
    borderBottomWidth: 1, borderBottomColor: colors.borderSoft,
  },
  tab: { paddingBottom: 10 },
  tabText: { fontSize: fontSize.sm, fontWeight: '500', color: colors.text3 },
  tabTextActive: { color: colors.text1, fontWeight: '600' },
  tabIndicator: {
    height: 2, backgroundColor: colors.accent,
    borderRadius: 1, marginTop: 2,
  },

  about: { padding: 22, gap: 16 },
  synopsis: { fontSize: IS_TV ? 16 : 14, color: colors.text1, lineHeight: IS_TV ? 25 : 22 },
  metaGrid: { gap: 2 },
  metaItem: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingVertical: 7,
    borderBottomWidth: 1, borderBottomColor: colors.borderSoft,
  },
  metaKey: { width: IS_TV ? 110 : 100, fontSize: IS_TV ? 14 : 12, color: colors.text3 },
  metaVal: { flex: 1, fontSize: IS_TV ? 14 : 12, color: colors.text1 },

  relatedGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: 22, gap: 10, paddingTop: 16,
  },
  relCard: { width: '30%' },
  relPoster: {
    aspectRatio: 2 / 3, borderRadius: 8,
    overflow: 'hidden', backgroundColor: colors.bg3,
  },
  relPosterImg: { width: '100%', height: '100%' },
  relPosterFallback: {
    width: '100%', height: '100%',
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg2,
  },
  relPosterInitials: { fontSize: 12, fontWeight: '700', color: colors.accent, opacity: 0.5 },
  relTitle: { fontSize: IS_TV ? 13 : 11, fontWeight: '500', color: colors.text1, marginTop: 6, lineHeight: IS_TV ? 18 : 15 },
  emptyRelated: { fontSize: 14, fontFamily: fontFamily.regular, color: colors.text2, padding: 22 },
});
