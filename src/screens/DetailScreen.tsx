// DetailScreen.tsx — Filme/VOD detail page
// Mobile: vertical scroll with hero top
// TV: landscape two-panel (backdrop left 60% + metadata right 40%)
import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  Platform, StatusBar, Share,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store/useStore';
import TVFocusable from '../components/TVFocusable';
import PulsingDot from '../components/PulsingDot';
import GlassButton from '../components/GlassButton';
import JellyfinTrackSheet from '../components/JellyfinTrackSheet';
import ExpandableText from '../components/ExpandableText';
import { colors, fontSize, radius, fontFamily } from '../utils/theme';
import { RootStackParamList } from '../types';
import { detectType, getSeriesBaseName } from '../utils/channelUtils';
import { IS_TV } from '../utils/tvDetect';
import { fetchTmdbMovie, fetchTmdbSeries, TmdbMeta } from '../utils/tmdbApi';
import { fetchVodInfo, parseMovieCredentials, XtreamVodDetails } from '../utils/xtreamApi';
import { parseJellyfinVideoUrl } from '../utils/jellyfinLoader';

type DetailRoute = RouteProp<RootStackParamList, 'Detail'>;
type Nav = StackNavigationProp<RootStackParamList>;

const TABS = ['Sobre', 'Mais como este'] as const;
type Tab = typeof TABS[number];


export default function DetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<DetailRoute>();
  const { channel, relatedChannels = [] } = route.params;
  const setCurrentChannel = useStore(s => s.setCurrentChannel);
  const toggleFavorite    = useStore(s => s.toggleFavorite);
  const favorites         = useStore(s => s.favorites);
  const settings          = useStore(s => s.settings);
  const [activeTab, setActiveTab] = useState<Tab>('Sobre');
  const [tmdb, setTmdb] = useState<TmdbMeta | null>(null);
  const [trackSheetUrl, setTrackSheetUrl] = useState<string | null>(null);

  const type = detectType(channel.group || '', channel.name);
  const displayName = type === 'series' ? getSeriesBaseName(channel.name) : channel.name;
  const groupClean = channel.group?.replace(/[♦◆️\uFE0F]\s*/g, '').trim() || '';
  const isFav = favorites.includes(channel.id);
  const typeLabel = type === 'movies' ? 'Filme' : type === 'series' ? 'Série' : 'Canal';

  // Detalhes ricos do próprio painel Xtream (get_vod_info) — sinopse, elenco,
  // nota, backdrop — sem depender de chave TMDB. A lista de VOD raramente traz
  // esses campos; o endpoint por título traz quase sempre.
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

  // TMDB enrichment para canais sem metadados (M3U / Xtream sem info)
  useEffect(() => {
    const key = settings.tmdbApiKey;
    if (!key || channel.plot || channel.backdrop) return;
    if (type === 'movies') {
      fetchTmdbMovie(displayName, key, channel.releaseDate?.slice(0, 4)).then(setTmdb);
    } else if (type === 'series') {
      fetchTmdbSeries(displayName, key).then(setTmdb);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Precedência: dados do canal (lista) → get_vod_info (painel) → TMDB
  const heroImage  = channel.backdrop ?? vod?.backdrop ?? tmdb?.backdrop ?? tmdb?.poster ?? channel.logo;
  const displayGenre  = channel.genre  || vod?.genre  || tmdb?.genre  || groupClean;
  const ratingValue   = channel.rating || vod?.rating || tmdb?.rating;
  const displayRating = ratingValue ? `⭐ ${ratingValue}` : null;
  const displayYear   = (channel.releaseDate ?? vod?.releaseDate)?.slice(0, 4) ?? tmdb?.year ?? null;
  const displayPlot   = channel.plot   || vod?.plot   || tmdb?.plot;
  const displayCast   = channel.cast   || vod?.cast   || tmdb?.cast;
  const displayDir    = channel.director || vod?.director || tmdb?.director;

  const isJellyfin = !!parseJellyfinVideoUrl(channel.url);

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

  const handleShare = async () => {
    const id = channel.tvgId || channel.id;
    const contentType = type === 'movies' ? 'movie' : type === 'series' ? 'series' : 'live';
    const link = `com.skaphostv.app://open?type=${contentType}&id=${encodeURIComponent(id)}&name=${encodeURIComponent(displayName)}`;
    try {
      await Share.share({
        message: `${displayName}\n\nAbrir no SkaphosTV:\n${link}`,
        title: displayName,
      });
    } catch (_) {}
  };

  // ── Shared: tab content (about + related grid) ──────────────────────────────
  const tabContent = (
    <>
      <View style={IS_TV ? tvStyles.tabBar : styles.tabBar}>
        {TABS.map(tab => {
          const on = tab === activeTab;
          return IS_TV ? (
            <TVFocusable
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={[tvStyles.tabPill, on && tvStyles.tabPillActive]}
              borderRadius={99}
            >
              <Text style={[tvStyles.tabText, on && tvStyles.tabTextActive]}>{tab}</Text>
            </TVFocusable>
          ) : (
            <TVFocusable key={tab} onPress={() => setActiveTab(tab)} style={styles.tab}>
              <Text style={[styles.tabText, on && styles.tabTextActive]}>{tab}</Text>
              {on && <View style={styles.tabIndicator} />}
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
            <View style={styles.metaItem}>
              <Text style={styles.metaKey}>Qualidade</Text>
              <Text style={styles.metaVal}>{channel.quality || 'HD'}</Text>
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.relatedGrid}>
          {relatedChannels.slice(0, 9).map(ch => {
            const rName = detectType(ch.group || '', ch.name) === 'series'
              ? getSeriesBaseName(ch.name) : ch.name;
            return (
              <TVFocusable
                key={ch.id}
                onPress={() => navigation.replace('Detail', { channel: ch, relatedChannels })}
                style={styles.relCard}
              >
                <View style={styles.relPoster}>
                  {ch.logo ? (
                    <Image source={ch.logo} style={styles.relPosterImg} contentFit="cover" transition={0} recyclingKey={ch.id} />
                  ) : (
                    <View style={styles.relPosterFallback}>
                      <Text style={styles.relPosterInitials}>{rName.slice(0, 2).toUpperCase()}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.relTitle} numberOfLines={2}>{rName}</Text>
              </TVFocusable>
            );
          })}
          {relatedChannels.length === 0 && (
            <Text style={styles.emptyRelated}>Nenhum conteúdo relacionado</Text>
          )}
        </View>
      )}
    </>
  );

  // ── TV Layout: two-panel horizontal ─────────────────────────────────────────
  if (IS_TV) {
    return (
      <View style={tvStyles.root}>
        {trackSheetUrl !== null && (
          <JellyfinTrackSheet
            visible
            channelUrl={trackSheetUrl}
            onConfirm={doPlay}
            onCancel={() => setTrackSheetUrl(null)}
          />
        )}
        <StatusBar hidden />

        {/* Left panel — backdrop (60%) */}
        <View style={tvStyles.leftPanel}>
          {heroImage ? (
            <Image source={heroImage} style={tvStyles.backdrop} contentFit="cover" transition={150} />
          ) : (
            <View style={[tvStyles.backdrop, tvStyles.backdropFallback]}>
              <Text style={tvStyles.backdropInitials}>{displayName.slice(0, 3).toUpperCase()}</Text>
            </View>
          )}

          {/* Right-edge gradient blending into right panel */}
          <LinearGradient
            colors={['transparent', colors.bg0]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={tvStyles.backdropGradientRight}
          />
          {/* Bottom gradient */}
          <LinearGradient
            colors={['transparent', 'rgba(10,8,16,0.85)']}
            style={tvStyles.backdropGradientBottom}
          />

          {/* Back button */}
          <TVFocusable onPress={() => navigation.goBack()} style={tvStyles.backBtn}>
            <Ionicons name="chevron-back" size={18} color={colors.text1} />
          </TVFocusable>

          {/* Type badge bottom-left */}
          <View style={tvStyles.typeBadgeWrap}>
            <View style={tvStyles.typeBadge}>
              {type === 'live' && <PulsingDot size={5} />}
              <Text style={tvStyles.typeBadgeText}>
                {typeLabel.toUpperCase()}{groupClean ? ` · ${groupClean.toUpperCase()}` : ''}
              </Text>
            </View>
          </View>
        </View>

        {/* Right panel — metadata (40%) */}
        <ScrollView
          style={tvStyles.rightPanel}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={tvStyles.rightContent}
        >
          {/* Title block */}
          <Text style={tvStyles.title} numberOfLines={3}>{displayName}</Text>
          <View style={tvStyles.metaRow}>
            {channel.quality && (
              <View style={tvStyles.qualBadge}>
                <Text style={tvStyles.qualBadgeText}>{channel.quality}</Text>
              </View>
            )}
            {displayRating && <Text style={tvStyles.metaText}>{displayRating}</Text>}
            {displayYear && <Text style={tvStyles.metaText}>{displayYear}</Text>}
            <Text style={tvStyles.metaText}>{displayGenre || typeLabel}</Text>
          </View>

          {/* Play button */}
          <TVFocusable onPress={handlePlay} style={tvStyles.playBtn} hasTVPreferredFocus>
            <Ionicons name="play" size={18} color={colors.textInverse} />
            <Text style={tvStyles.playText}>Assistir agora</Text>
          </TVFocusable>

          {/* Secondary actions */}
          <View style={tvStyles.secondaryRow}>
            <GlassButton
              icon={isFav ? 'heart' : 'heart-outline'}
              label="Minha lista"
              onPress={() => toggleFavorite(channel.id)}
            />
            {/* "Indicar" (compartilhar) não faz sentido na TV — fica só no layout mobile */}
          </View>

          {/* Tabs + content */}
          {tabContent}
        </ScrollView>
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
            <Image source={heroImage} style={styles.heroImg} contentFit="cover" transition={150} />
          ) : (
            <View style={styles.heroFallback}>
              <Text style={styles.heroInitials}>{displayName.slice(0, 3).toUpperCase()}</Text>
            </View>
          )}
          <LinearGradient
            colors={['transparent', 'rgba(10,8,16,0.9)', colors.bg0]}
            locations={[0.35, 0.82, 1]}
            style={styles.heroGradient}
          />

          <TVFocusable onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={18} color={colors.text1} />
          </TVFocusable>

          <View style={styles.heroInfo}>
            <View style={styles.typeBadge}>
              {type === 'live' && <PulsingDot size={5} />}
              <Text style={styles.typeText}>
                {typeLabel.toUpperCase()}{groupClean ? ` · ${groupClean.toUpperCase()}` : ''}
              </Text>
            </View>
            <Text style={styles.title} numberOfLines={3}>{displayName}</Text>
            <View style={styles.metaRow}>
              {channel.quality && (
                <View style={styles.metaBadge}>
                  <Text style={styles.metaBadgeText}>{channel.quality}</Text>
                </View>
              )}
              {displayRating && <Text style={styles.metaText}>{displayRating}</Text>}
              {displayYear && <Text style={styles.metaText}>{displayYear}</Text>}
              <Text style={styles.metaText}>{displayGenre || typeLabel}</Text>
            </View>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <TVFocusable onPress={handlePlay} style={styles.playBtn}>
            <Ionicons name="play" size={16} color={colors.textInverse} />
            <Text style={styles.playText}>Assistir agora</Text>
          </TVFocusable>
          <View style={styles.secondaryActions}>
            <GlassButton
              icon={isFav ? 'heart' : 'heart-outline'}
              label="Minha lista"
              onPress={() => toggleFavorite(channel.id)}
            />
            <GlassButton icon="share-outline" label="Indicar" onPress={handleShare} />
          </View>
        </View>

        {tabContent}
        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

// ── TV Styles ────────────────────────────────────────────────────────────────
const tvStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg0,
    flexDirection: 'row',
  },

  // Left backdrop panel
  leftPanel: {
    width: '60%',
    position: 'relative',
    overflow: 'hidden',
  },
  backdrop: {
    width: '100%',
    height: '100%',
  },
  backdropFallback: {
    backgroundColor: colors.bg2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdropInitials: {
    fontSize: 80,
    fontWeight: '800',
    color: colors.accent,
    opacity: 0.15,
    letterSpacing: 6,
  },
  backdropGradientRight: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: '35%',
  },
  backdropGradientBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '30%',
  },
  backBtn: {
    position: 'absolute',
    top: 32,
    left: 32,
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeBadgeWrap: {
    position: 'absolute',
    bottom: 32,
    left: 32,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
  },
  typeBadgeText: {
    fontSize: 10,
    color: colors.text2,
    letterSpacing: 0.8,
    fontWeight: '600',
  },

  // Right metadata panel
  rightPanel: {
    flex: 1,
    backgroundColor: colors.bg0,
  },
  rightContent: {
    padding: 40,
    paddingTop: 56,
    gap: 16,
  },
  title: {
    fontSize: 36,
    fontFamily: fontFamily.bold,
    color: colors.text1,
    letterSpacing: -0.8,
    lineHeight: 42,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  qualBadge: {
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  qualBadgeText: {
    fontSize: 10,
    color: colors.text2,
    fontWeight: '600',
  },
  metaText: {
    fontSize: 13,
    color: colors.text3,
  },
  playBtn: {
    height: 52,
    borderRadius: 12,
    backgroundColor: colors.text1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  playText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textInverse,
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: 8,
  },

  tabBar: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 16,
  },
  tabPill: {
    paddingHorizontal: 20,
    paddingVertical: 9,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'transparent',
  },
  tabPillActive: {
    backgroundColor: colors.text1,
    borderColor: colors.text1,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text2,
  },
  tabTextActive: {
    color: colors.textInverse,
    fontWeight: '600',
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
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12,
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
  synopsis: { fontSize: 14, color: colors.text1, lineHeight: 22 },
  metaGrid: { gap: 2 },
  metaItem: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingVertical: 7,
    borderBottomWidth: 1, borderBottomColor: colors.borderSoft,
  },
  metaKey: { width: 100, fontSize: 12, color: colors.text3 },
  metaVal: { flex: 1, fontSize: 12, color: colors.text1 },

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
  relTitle: { fontSize: 11, fontWeight: '500', color: colors.text1, marginTop: 6, lineHeight: 15 },
  emptyRelated: { fontSize: 13, color: colors.text3, padding: 22 },
});
