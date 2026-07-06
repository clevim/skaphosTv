import React, { useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Channel } from '../types';
import TVFocusable from './TVFocusable';
import PulsingDot from './PulsingDot';
import { colors, spacing, fontSize, radius, fontFamily } from '../utils/theme';
import { getSeriesBaseName, isLaunchYear, LAUNCH_YEAR, cleanGroupName } from '../utils/channelUtils';
import { IS_TV } from '../utils/tvDetect';
import { useWatchProgress, progressFractionFor, resumePositionFor, watchStatusFor, WatchEntry } from '../store/watchProgress';
import { useNowNext } from '../store/epgStore';
import { useStore, resolveChannelType } from '../store/useStore';

interface Props {
  recentChannels: Channel[];
  favoriteChannels: Channel[];
  sourcesEmpty: boolean;
  renderCard: (item: Channel, index: number) => React.ReactNode;
  contentH: number;
  channels?: Channel[];
  /** Gêneros mais frequentes do catálogo (pré-computados em channelIndex.topGenres). */
  topGenres?: { genre: string; channels: Channel[] }[];
  onChannelPress?: (channel: Channel) => void;
  /** Hero "Assistir" — inicia a reprodução direto (filme/ao vivo → player). */
  onWatch?: (channel: Channel) => void;
  /** Hero "Detalhes" — abre a página de detalhes. */
  onDetails?: (channel: Channel) => void;
  onNavPress?: (key: string) => void;
}

const MAX = 20;

// ── Continue Watching Card ────────────────────────────────────
/** Minutos restantes formatados, ou null quando não há progresso útil. */
function remainingLabel(entry: WatchEntry | undefined): string | null {
  if (!entry || entry.watched || entry.durationSec <= 0) return null;
  const remainMin = Math.max(1, Math.round((entry.durationSec - entry.positionSec) / 60));
  return `Restam ${remainMin} min`;
}

/**
 * Se o pick (dedup por série) já está 100% assistido, troca por um episódio EM
 * CURSO da mesma série achado em recentChannels (lista pequena) — evita mostrar
 * na Home um episódio já concluído como se fosse novidade, sem varrer o
 * catálogo inteiro (caro em TV box com 10k+ canais) atrás de um substituto.
 */
function swapWatchedSeriesPick(
  pick: Channel,
  recentChannels: Channel[],
  watchEntries: Record<string, WatchEntry>,
): Channel {
  const entry = watchEntries[pick.id];
  if (!entry?.watched) return pick;
  const base = getSeriesBaseName(pick.name);
  const sibling = recentChannels.find(c =>
    c.id !== pick.id &&
    resolveChannelType(c) === 'series' &&
    getSeriesBaseName(c.name) === base &&
    resumePositionFor(watchEntries[c.id]) > 0,
  );
  return sibling ?? pick;
}

/**
 * Badge de card pra seções SEM o swap acima (Lançamentos, Recomendados por
 * gênero) — filme mapeia 1:1 pro watchProgress, mostra os dois estados; série
 * é só o pick arbitrário do catálogo, então só a barra de "em curso" (um check
 * de "assistido" aqui poderia ser um episódio errado, e enganar o usuário).
 */
function badgeFor(ch: Channel, watchEntries: Record<string, WatchEntry>): { watched: boolean; progress: number } {
  const status = watchStatusFor(watchEntries[ch.id]);
  return resolveChannelType(ch) === 'series' ? { watched: false, progress: status.progress } : status;
}

function ContinueCard({
  channel, progress, entry, onPress,
}: {
  channel: Channel;
  /** Fração real 0–1 do watchProgress; 0 esconde a barra (ex.: canal ao vivo). */
  progress: number;
  entry?: WatchEntry;
  onPress: () => void;
}) {
  const remaining = remainingLabel(entry);
  return (
    <TVFocusable onPress={onPress} style={cStyles.card}>
      <View style={cStyles.poster}>
        {channel.logo ? (
          <Image source={channel.logo} style={cStyles.posterImg} contentFit="cover" transition={0} cachePolicy="memory-disk" recyclingKey={channel.id} />
        ) : (
          <View style={cStyles.posterFallback}>
            <Text style={cStyles.posterInitials}>{channel.name.slice(0, 2).toUpperCase()}</Text>
          </View>
        )}
        {/* Play overlay */}
        <View style={cStyles.playOverlay}>
          <View style={cStyles.playCircle}>
            <Ionicons name="play" size={14} color={colors.white} />
          </View>
        </View>
        {/* Barra de progresso REAL (watchProgress) — sem progresso, sem barra */}
        {progress > 0 && (
          <View style={cStyles.progressTrack}>
            <View style={[cStyles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
        )}
      </View>
      <Text style={cStyles.title} numberOfLines={1}>{channel.name}</Text>
      <Text style={[cStyles.sub, remaining != null && cStyles.subProgress]} numberOfLines={1}>
        {remaining ?? (channel.group ? cleanGroupName(channel.group) : '')}
      </Text>
    </TVFocusable>
  );
}

const cStyles = StyleSheet.create({
  card: { width: IS_TV ? 160 : 116 },
  poster: {
    aspectRatio: 2 / 3,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: colors.bg3,
  },
  posterImg: { width: '100%', height: '100%' },
  posterFallback: {
    width: '100%', height: '100%',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.bg2,
  },
  posterInitials: { fontSize: 18, fontWeight: '800', color: colors.accent, letterSpacing: 2 },
  playOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  playCircle: {
    width: 36, height: 36, borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  progressTrack: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: 3, backgroundColor: 'rgba(255,255,255,0.15)',
  },
  progressFill: { height: '100%', backgroundColor: colors.accent },
  title: { fontSize: 12, fontWeight: '500', color: colors.text1, marginTop: 8 },
  sub: { fontSize: 10, color: colors.text3, marginTop: 2 },
  subProgress: { color: colors.accent },
});

// ── Live Card ─────────────────────────────────────────────────
function LiveCard({ channel, onPress, nowPlaying }: {
  channel: Channel; onPress: () => void;
  /** Programa no ar (EPG) — substitui o grupo no subtítulo. */
  nowPlaying?: string;
}) {
  const isJellyfin = channel.id?.startsWith('jf-');
  return (
    <TVFocusable onPress={onPress} style={lStyles.card}>
      <View style={lStyles.poster}>
        {channel.logo ? (
          <Image source={channel.logo} style={lStyles.posterImg} contentFit="cover" transition={0} cachePolicy="memory-disk" recyclingKey={channel.id} />
        ) : (
          <View style={lStyles.posterFallback}>
            <Text style={lStyles.posterInitials}>{channel.name.slice(0, 2).toUpperCase()}</Text>
          </View>
        )}
        {isJellyfin ? (
          <View style={[lStyles.badge, lStyles.jellyBadge]}>
            <View style={lStyles.jellyDot} />
            <Text style={lStyles.badgeText}>JELLY</Text>
          </View>
        ) : (
          <View style={lStyles.badge}>
            <PulsingDot size={6} color={colors.live} />
            <Text style={lStyles.badgeText}>LIVE</Text>
          </View>
        )}
      </View>
      <Text style={lStyles.title} numberOfLines={1}>{channel.name}</Text>
      <Text style={[lStyles.sub, nowPlaying != null && lStyles.subNow]} numberOfLines={1}>
        {nowPlaying ?? (channel.group ? cleanGroupName(channel.group) : '')}
      </Text>
    </TVFocusable>
  );
}

/** LiveCard com "agora no ar" do EPG no subtítulo (quando o guia está ativo). */
function LiveCardWithEpg({ channel, onPress }: { channel: Channel; onPress: () => void }) {
  const showEpg = useStore(s => s.settings.showEpg);
  const { now } = useNowNext(showEpg && !channel.id.startsWith('jf-') ? channel.id : undefined);
  return <LiveCard channel={channel} onPress={onPress} nowPlaying={now?.title} />;
}

const lStyles = StyleSheet.create({
  card: { width: IS_TV ? 160 : 116 },
  poster: {
    aspectRatio: 2 / 3,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: colors.bg3,
  },
  posterImg: { width: '100%', height: '100%' },
  posterFallback: {
    width: '100%', height: '100%',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.bg2,
  },
  posterInitials: { fontSize: 16, fontWeight: '800', color: colors.accent, letterSpacing: 2 },
  badge: {
    position: 'absolute', top: 8, left: 8,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.6)',
  },
  jellyBadge: {
    backgroundColor: 'rgba(167,139,250,0.18)',
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.4)',
  },
  jellyDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: colors.accent,
  },
  badgeText: { fontSize: 9, fontWeight: '600', color: colors.white },
  title: { fontSize: 12, fontWeight: '600', color: colors.text1, marginTop: 8 },
  sub: { fontSize: 11, color: colors.text2, marginTop: 2 },
  subNow: { color: colors.accent },
});

// ── Section header ────────────────────────────────────────────
function Section({ title, trailing, onTrailingPress, children }: {
  title: string; trailing?: string; onTrailingPress?: () => void; children: React.ReactNode;
}) {
  return (
    <View style={sStyles.section}>
      <View style={sStyles.header}>
        <Text style={sStyles.title}>{title}</Text>
        {trailing && (
          <TVFocusable onPress={onTrailingPress} style={sStyles.trailingWrap}>
            <Text style={sStyles.trailing}>{trailing}</Text>
            <Ionicons name="chevron-forward" size={12} color={colors.text2} />
          </TVFocusable>
        )}
      </View>
      {children}
    </View>
  );
}

const sStyles = StyleSheet.create({
  section: { marginTop: IS_TV ? 36 : 28 },
  header: {
    flexDirection: 'row', alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: IS_TV ? spacing.xxxl : 22,
    marginBottom: IS_TV ? 14 : 12,
  },
  title: {
    fontSize: IS_TV ? 18 : 16, fontWeight: '600',
    color: colors.text1, letterSpacing: -0.3,
  },
  trailingWrap: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  trailing: { fontSize: 12, color: colors.text2 },
});

// ── Horizontal Row ────────────────────────────────────────────
function Row({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      // paddingVertical dá espaço pro card ampliado (zoom de foco) não ser recortado.
      contentContainerStyle={{
        gap: IS_TV ? 14 : 12,
        paddingHorizontal: IS_TV ? spacing.xxxl : 22,
        paddingVertical: IS_TV ? 16 : 8,
      }}
    >
      {children}
    </ScrollView>
  );
}

// ── VOD Poster Card ───────────────────────────────────────────
function VodCard({ channel, onPress, displayName, isNew, progress, watched }: {
  channel: Channel; onPress: () => void; displayName?: string; isNew?: boolean;
  /** 0–1: mostra a barra de "assistindo" no rodapé do pôster. */
  progress?: number;
  /** Mostra o check de "assistido" no canto oposto ao de qualidade. */
  watched?: boolean;
}) {
  const name = displayName ?? channel.name;
  const groupClean = channel.group ? cleanGroupName(channel.group) : '';
  const quality = channel.quality;
  return (
    <TVFocusable onPress={onPress} style={vStyles.card}>
      <View style={vStyles.poster}>
        {channel.logo ? (
          <Image source={channel.logo} style={vStyles.posterImg} contentFit="cover" transition={0} cachePolicy="memory-disk" recyclingKey={channel.id} />
        ) : (
          <View style={vStyles.posterFallback}>
            <Text style={vStyles.posterInitials}>{name.slice(0, 3).toUpperCase()}</Text>
          </View>
        )}
        {/* "NOVO" badge — top left */}
        {isNew && (
          <View style={vStyles.newBadge}>
            <Text style={vStyles.newBadgeText}>NOVO</Text>
          </View>
        )}
        {/* Quality badge — top right */}
        {quality && (
          <View style={vStyles.qualBadge}>
            <Text style={vStyles.qualBadgeText}>{quality}</Text>
          </View>
        )}
        {/* "Assistido" — canto inferior direito */}
        {watched && (
          <View style={vStyles.watchedBadge}>
            <Ionicons name="checkmark" size={10} color={colors.white} />
          </View>
        )}
        {/* Barra de "assistindo" — rodapé do pôster */}
        {progress != null && progress > 0 && (
          <View style={vStyles.progressTrack}>
            <View style={[vStyles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
        )}
      </View>
      <Text style={vStyles.title} numberOfLines={2}>{name}</Text>
      {groupClean ? <Text style={vStyles.sub} numberOfLines={1}>{groupClean}</Text> : null}
    </TVFocusable>
  );
}

const vStyles = StyleSheet.create({
  card: { width: IS_TV ? 160 : 116 },
  poster: {
    aspectRatio: 2 / 3,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: colors.bg3,
  },
  posterImg: { width: '100%', height: '100%' },
  posterFallback: {
    width: '100%', height: '100%',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.bg2,
  },
  posterInitials: { fontSize: 14, fontWeight: '800', color: colors.accent, letterSpacing: 1, opacity: 0.5 },
  newBadge: {
    position: 'absolute', top: 6, left: 6,
    backgroundColor: colors.accent3,
    paddingHorizontal: 5, paddingVertical: 2,
    borderRadius: 3,
  },
  newBadgeText: { fontSize: 8, fontWeight: '800', color: colors.white, letterSpacing: 0.5 },
  qualBadge: {
    position: 'absolute', top: 6, right: 6,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 5, paddingVertical: 2,
    borderRadius: 3, borderWidth: 1, borderColor: colors.border,
  },
  qualBadgeText: { fontSize: 8, fontWeight: '700', color: colors.text2, letterSpacing: 0.3 },
  watchedBadge: {
    position: 'absolute', bottom: 5, right: 5,
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  progressTrack: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: 3, backgroundColor: 'rgba(255,255,255,0.15)',
  },
  progressFill: { height: '100%', backgroundColor: colors.accent },
  title: { fontSize: 12, fontWeight: '500', color: colors.text1, marginTop: 8, lineHeight: 16 },
  sub: { fontSize: 10, color: colors.text3, marginTop: 2 },
});

// ── Main HomeContent ──────────────────────────────────────────
export default function HomeContent({
  recentChannels, favoriteChannels, sourcesEmpty, renderCard, contentH,
  channels = [], topGenres = [], onChannelPress, onWatch, onDetails, onNavPress,
}: Props) {
  const navigation = useNavigation();
  const watchEntries = useWatchProgress(s => s.entries);
  const isEmpty = recentChannels.length === 0 && favoriteChannels.length === 0;

  // "Continue assistindo" com progresso REAL: itens em curso primeiro (mais
  // recentes antes), depois os demais recentes na ordem original. Séries usam
  // o progresso espelhado no id da série (gravado pelo player junto do episódio).
  const continueItems = useMemo(() => {
    const inProgress: Array<{ channel: Channel; progress: number; entry: WatchEntry }> = [];
    const rest: Channel[] = [];
    for (const ch of recentChannels) {
      const entry = watchEntries[ch.id];
      // Ao vivo nunca entra como "em curso" (entradas antigas podem existir de quando
      // streams live com duração reportada gravavam progresso indevidamente)
      const isLiveCh = resolveChannelType(ch) === 'live';
      if (!isLiveCh && entry && !entry.watched && resumePositionFor(entry) > 0) {
        inProgress.push({ channel: ch, progress: progressFractionFor(entry), entry });
      } else {
        rest.push(ch);
      }
    }
    inProgress.sort((a, b) => b.entry.updatedAt - a.entry.updatedAt);
    return [
      ...inProgress,
      ...rest.map(channel => ({ channel, progress: 0, entry: undefined as WatchEntry | undefined })),
    ].slice(0, MAX);
  }, [recentChannels, watchEntries]);

  const handlePress = (ch: Channel) => {
    if (onChannelPress) {
      onChannelPress(ch);
    } else {
      (navigation as any).navigate('Player', { channel: ch });
    }
  };

  // Pick hero: prefer recent, then favorite, then first live, then any channel
  const heroChannel = useMemo(() =>
    recentChannels[0] ||
    favoriteChannels[0] ||
    channels.find(c => resolveChannelType(c) === 'live') ||
    channels[0] ||
    null,
  [recentChannels, favoriteChannels, channels]);

  // "Porque você assistiu X": pega o gênero do último item não-ao-vivo assistido
  // (recentChannels já vem ordenado por recência) — sem isso não tem o que comparar.
  const seed = useMemo(() => {
    const ch = recentChannels.find(c => {
      const isLiveCh = resolveChannelType(c) === 'live';
      return !isLiveCh && !!c.genre;
    });
    if (!ch?.genre) return null;
    return { id: ch.id, name: getSeriesBaseName(ch.name), genre: ch.genre.split(',')[0].trim() };
  }, [recentChannels]);

  // Seções derivadas do catálogo completo — memoizadas E em UM passe com parada
  // antecipada. Antes rodavam a cada render (relógio de 30 s, qualquer estado)
  // varrendo a lista inteira 4× com regex — pesado em TV box com 10k+ canais.
  const { liveChannels, movieChannels, seriesChannels, yearChannels, becauseYouWatched } = useMemo(() => {
    const live: Channel[] = [], movies: Channel[] = [], series: Channel[] = [], year: Channel[] = [];
    const because: Channel[] = [];
    const seenSeries = new Set<string>();
    const seenBecauseSeries = new Set<string>();
    const becauseCap = seed ? 12 : 0;
    for (const c of channels) {
      const type = resolveChannelType(c);
      if (type === 'live') {
        if (live.length < 12) live.push(c);
      } else {
        if (movies.length < 12 && type === 'movies') movies.push(c);
        if (series.length < 12 && type === 'series') {
          const base = getSeriesBaseName(c.name);
          if (!seenSeries.has(base)) { seenSeries.add(base); series.push(c); }
        }
        if (year.length < 12 && isLaunchYear(c.name)) year.push(c);
        if (seed && because.length < becauseCap && c.id !== seed.id && c.genre?.includes(seed.genre)) {
          // Dedup por série — sem isso, várias episódios do mesmo show (M3U)
          // podiam poluir a fileira inteira com o mesmo título repetido.
          if (type === 'series') {
            const base = getSeriesBaseName(c.name);
            if (!seenBecauseSeries.has(base)) { seenBecauseSeries.add(base); because.push(c); }
          } else {
            because.push(c);
          }
        }
      }
      if (live.length >= 12 && movies.length >= 12 && series.length >= 12 && year.length >= 12 && because.length >= becauseCap) break;
    }
    return { liveChannels: live, movieChannels: movies, seriesChannels: series, yearChannels: year, becauseYouWatched: because };
  }, [channels, seed]);

  // Troca picks de série já 100% assistidos por um episódio em curso conhecido
  // (recentChannels) — ver swapWatchedSeriesPick. Baseado numa lista pequena,
  // seguro de rodar toda vez que watchEntries muda (a cada ~10s durante o play).
  const seriesChannelsDisplay = useMemo(
    () => seriesChannels.map(c => swapWatchedSeriesPick(c, recentChannels, watchEntries)),
    [seriesChannels, recentChannels, watchEntries],
  );
  const becauseYouWatchedDisplay = useMemo(
    () => becauseYouWatched.map(c => resolveChannelType(c) === 'series' ? swapWatchedSeriesPick(c, recentChannels, watchEntries) : c),
    [becauseYouWatched, recentChannels, watchEntries],
  );

  // streamType tem precedência sobre heurística — Jellyfin define isso explicitamente
  const heroType = heroChannel
    ? (heroChannel.streamType === 'movie'  ? 'movies'
       : heroChannel.streamType === 'series' ? 'series'
       : heroChannel.streamType === 'live'   ? 'live'
       : resolveChannelType(heroChannel))
    : 'live';

  const isHeroJellyfin = Boolean(heroChannel?.id?.startsWith('jf-'));

  const heroBadgeLabel = isHeroJellyfin ? 'JELLY'
    : heroType === 'movies' ? 'FILME'
    : heroType === 'series' ? 'SÉRIE'
    : 'AO VIVO';

  if (isEmpty && sourcesEmpty) {
    return (
      <View style={[styles.empty, { height: contentH }]}>
        <View style={styles.emptyIconWrap}>
          <Ionicons name="tv-outline" size={IS_TV ? 56 : 44} color={colors.text3} />
        </View>
        <Text style={styles.emptyTitle}>Bem-vindo ao SkaphosTV</Text>
        <Text style={styles.emptySubtitle}>
          Adicione uma lista IPTV para comecar a assistir
        </Text>
        <TVFocusable
          onPress={() => (navigation as any).navigate('Setup')}
          style={styles.addBtn}
          hasTVPreferredFocus
        >
          <Ionicons name="add-circle-outline" size={18} color={colors.white} />
          <Text style={styles.addBtnText}>Adicionar Lista IPTV</Text>
        </TVFocusable>
      </View>
    );
  }

  // Fallback live channels if filtering returns nothing (provider hasn't ♦ markers)
  const displayLive = liveChannels.length > 0
    ? liveChannels
    : (channels.length > 0 ? channels : [...recentChannels, ...favoriteChannels]).slice(0, 12);

  return (
    <ScrollView
      style={{ height: contentH }}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Featured Hero */}
      {heroChannel && (
        <View style={IS_TV ? styles.heroWrapTV : styles.heroWrap}>
          <View style={IS_TV ? styles.heroTV : styles.hero}>
            {heroChannel.logo ? (
              <Image source={heroChannel.logo} style={styles.heroImg} contentFit="cover" transition={150} />
            ) : (
              <View style={styles.heroFallback}>
                <Text style={styles.heroInitials}>{heroChannel.name.slice(0, 3).toUpperCase()}</Text>
              </View>
            )}
            {/* Gradient overlays */}
            {/* Horizontal: left→right (TV: strong cover, mobile: subtle vignette) */}
            <LinearGradient
              colors={
                IS_TV
                  ? ['rgba(10,8,16,0.96)', 'rgba(10,8,16,0.6)', 'transparent']
                  : ['rgba(10,8,16,0.55)', 'transparent']
              }
              start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
              style={IS_TV ? styles.heroGradientH : styles.heroGradientHMobile}
            />
            {/* Vertical: bottom overlay */}
            <LinearGradient
              colors={['transparent', 'rgba(10,8,16,0.85)', colors.bg0]}
              locations={[0.3, 0.8, 1]}
              style={styles.heroGradient}
            />
            {/* Type badge */}
            <View style={[
              styles.heroLiveBadge,
              isHeroJellyfin ? styles.heroJellyBadge : (heroType !== 'live' && styles.heroVodBadge),
            ]}>
              {isHeroJellyfin
                ? <View style={styles.heroJellyDot} />
                : heroType === 'live' ? <PulsingDot size={6} color={colors.live} /> : null}
              <Text style={styles.heroLiveText}>{heroBadgeLabel}</Text>
            </View>
            {/* Bottom content */}
            <View style={IS_TV ? styles.heroBottomTV : styles.heroBottom}>
              <Text style={styles.heroCategory}>
                EM DESTAQUE · {(heroChannel.group ? cleanGroupName(heroChannel.group).toUpperCase() : '') || 'CANAL'}
              </Text>
              <Text style={styles.heroTitle} numberOfLines={2}>{heroChannel.name}</Text>
              <Text style={styles.heroMeta}>
                {(heroChannel.group ? cleanGroupName(heroChannel.group) : '') || ''} · {heroChannel.quality || 'HD'}
              </Text>
              <View style={styles.heroActions}>
                <TVFocusable
                  onPress={() => (onWatch ? onWatch(heroChannel) : handlePress(heroChannel))}
                  style={styles.heroPlayBtn}
                  // O highlight padrão de foco (roxo translúcido) apagava o fundo
                  // branco e deixava o texto escuro ilegível — mantém fundo sólido.
                  focusStyle={{ backgroundColor: colors.accent2 }}
                  hasTVPreferredFocus={IS_TV}
                >
                  <Ionicons name="play" size={14} color={colors.textInverse} />
                  <Text style={styles.heroPlayText}>Assistir</Text>
                </TVFocusable>
                <TVFocusable onPress={() => {}} style={styles.heroPlusBtn}>
                  <Ionicons name="add" size={IS_TV ? 18 : 16} color={colors.text1} />
                  {IS_TV && <Text style={styles.heroPlusBtnText}>Lista</Text>}
                </TVFocusable>
                <TVFocusable
                  onPress={() => (onDetails ? onDetails(heroChannel) : handlePress(heroChannel))}
                  style={styles.heroPlusBtn}
                >
                  <Ionicons name="information-circle-outline" size={18} color={colors.text1} />
                  {IS_TV && <Text style={styles.heroPlusBtnText}>Detalhes</Text>}
                </TVFocusable>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* Continue assistindo */}
      {continueItems.length > 0 && (
        <Section title="Continue assistindo" trailing="Ver tudo" onTrailingPress={() => onNavPress?.('favorites')}>
          <Row>
            {continueItems.map(({ channel: ch, progress, entry }) => (
              <ContinueCard
                key={ch.id}
                channel={ch}
                progress={progress}
                entry={entry}
                // Em curso → retoma direto (player resume; série abre no episódio certo).
                // Sem progresso → fluxo normal (filme abre Detalhes etc.)
                onPress={() => (progress > 0 && onWatch ? onWatch(ch) : handlePress(ch))}
              />
            ))}
          </Row>
        </Section>
      )}

      {/* Favoritos — logo após o início (Continue assistindo), não no fim da página */}
      {favoriteChannels.length > 0 && (
        <Section title="Meus Favoritos" trailing="Ver tudo" onTrailingPress={() => onNavPress?.('favorites')}>
          <Row>
            {favoriteChannels.slice(0, MAX).map((ch, i) => (
              <View key={ch.id}>{renderCard(ch, i)}</View>
            ))}
          </Row>
        </Section>
      )}

      {/* Ao vivo agora */}
      {displayLive.length > 0 && (
        <Section title="Ao vivo agora" trailing="Ver tudo" onTrailingPress={() => onNavPress?.('live')}>
          <Row>
            {displayLive.map(ch => (
              <LiveCardWithEpg key={ch.id} channel={ch} onPress={() => handlePress(ch)} />
            ))}
          </Row>
        </Section>
      )}

      {/* Filmes */}
      {movieChannels.length > 0 && (
        <Section title="Filmes para você" trailing="Ver tudo" onTrailingPress={() => onNavPress?.('movies')}>
          <Row>
            {movieChannels.map(ch => {
              const status = watchStatusFor(watchEntries[ch.id]);
              return (
                <VodCard
                  key={ch.id}
                  channel={ch}
                  onPress={() => handlePress(ch)}
                  isNew={isLaunchYear(ch.name)}
                  watched={status.watched}
                  progress={status.progress}
                />
              );
            })}
          </Row>
        </Section>
      )}

      {/* Séries — pick já trocado (swapWatchedSeriesPick) por um episódio em
          curso quando o representante original estava 100% assistido. */}
      {seriesChannelsDisplay.length > 0 && (
        <Section title="Séries" trailing="Ver tudo" onTrailingPress={() => onNavPress?.('series')}>
          <Row>
            {seriesChannelsDisplay.map(ch => {
              const status = watchStatusFor(watchEntries[ch.id]);
              return (
                <VodCard
                  key={ch.id}
                  channel={ch}
                  onPress={() => handlePress(ch)}
                  displayName={getSeriesBaseName(ch.name)}
                  isNew={isLaunchYear(ch.name)}
                  watched={status.watched}
                  progress={status.progress}
                />
              );
            })}
          </Row>
        </Section>
      )}

      {/* 2026 — filmes e séries do ano */}
      {yearChannels.length > 0 && (
        <Section title={`Lançamentos ${LAUNCH_YEAR}`} trailing="Ver tudo" onTrailingPress={() => onNavPress?.('year')}>
          <Row>
            {yearChannels.map(ch => {
              const status = badgeFor(ch, watchEntries);
              return (
                <VodCard
                  key={ch.id}
                  channel={ch}
                  onPress={() => handlePress(ch)}
                  displayName={resolveChannelType(ch) === 'series' ? getSeriesBaseName(ch.name) : ch.name}
                  isNew
                  watched={status.watched}
                  progress={status.progress}
                />
              );
            })}
          </Row>
        </Section>
      )}

      {/* Porque você assistiu X — mesmo gênero do último item não-ao-vivo visto */}
      {seed && becauseYouWatchedDisplay.length > 0 && (
        <Section title={`Porque você assistiu ${seed.name}`}>
          <Row>
            {becauseYouWatchedDisplay.map(ch => {
              const status = watchStatusFor(watchEntries[ch.id]);
              return (
                <VodCard
                  key={ch.id}
                  channel={ch}
                  onPress={() => handlePress(ch)}
                  displayName={resolveChannelType(ch) === 'series' ? getSeriesBaseName(ch.name) : ch.name}
                  watched={status.watched}
                  progress={status.progress}
                />
              );
            })}
          </Row>
        </Section>
      )}

      {/* Recomendados por gênero — top gêneros pré-computados no channelIndex */}
      {topGenres.slice(0, 3).map(({ genre, channels: genreChannels }) => (
        <Section key={genre} title={`Recomendados: ${genre}`}>
          <Row>
            {genreChannels.slice(0, MAX).map(ch => {
              const status = badgeFor(ch, watchEntries);
              return (
                <VodCard
                  key={ch.id}
                  channel={ch}
                  onPress={() => handlePress(ch)}
                  displayName={resolveChannelType(ch) === 'series' ? getSeriesBaseName(ch.name) : ch.name}
                  watched={status.watched}
                  progress={status.progress}
                />
              );
            })}
          </Row>
        </Section>
      ))}

      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    // TV: push content below the absolutely-positioned top bar (24px padding + ~20px text + 24px padding ≈ 88px)
    paddingTop: IS_TV ? 72 : 6,
  },

  // Hero — mobile (rounded card)
  heroWrap: {
    paddingHorizontal: 22,
  },
  hero: {
    position: 'relative',
    borderRadius: 18,
    overflow: 'hidden',
    height: 380,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg3,
  },
  // Hero — TV (full-bleed, no card)
  heroWrapTV: {
    marginHorizontal: 0,
  },
  heroTV: {
    position: 'relative',
    height: 340,
    backgroundColor: colors.bg3,
    // overflow: 'hidden' removido — bloqueia TVFocusable buttons do FocusFinder
  },
  heroImg: { width: '100%', height: '100%' },
  heroFallback: {
    width: '100%', height: '100%',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.bg2,
  },
  heroInitials: { fontSize: 48, fontWeight: '800', color: colors.accent, letterSpacing: 4, opacity: 0.3 },
  heroGradient: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: '70%',
  },
  heroGradientH: {
    position: 'absolute', top: 0, bottom: 0, left: 0, width: '65%',
  },
  heroGradientHMobile: {
    position: 'absolute', top: 0, bottom: 0, left: 0, width: '50%',
  },
  heroLiveBadge: {
    position: 'absolute', top: 14, left: IS_TV ? spacing.xxxl : 14,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 9, paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(239,68,68,0.18)',
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)',
  },
  heroVodBadge: {
    backgroundColor: 'rgba(167,139,250,0.15)',
    borderColor: 'rgba(167,139,250,0.35)',
  },
  heroJellyBadge: {
    backgroundColor: 'rgba(167,139,250,0.18)',
    borderColor: 'rgba(167,139,250,0.45)',
  },
  heroJellyDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: colors.accent,
  },
  heroLiveText: { fontSize: 10, fontWeight: '700', color: colors.white, letterSpacing: 1 },
  heroBottom: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 18,
  },
  heroBottomTV: {
    position: 'absolute',
    top: 0, bottom: 0, left: 0,
    width: '52%',
    paddingLeft: spacing.xxxl,
    paddingRight: spacing.xl,
    paddingVertical: 24,
    justifyContent: 'flex-end',
  },
  heroCategory: {
    fontSize: 10, color: colors.text2, letterSpacing: 0.6,
    textTransform: 'uppercase', marginBottom: 4,
  },
  heroTitle: {
    fontSize: IS_TV ? 42 : 26, fontFamily: fontFamily.semiBold,
    color: colors.text1, letterSpacing: IS_TV ? -1.5 : -0.6,
    lineHeight: IS_TV ? 46 : 32,
  },
  heroMeta: { fontSize: 12, color: colors.text2, marginTop: 4 },
  heroActions: {
    flexDirection: 'row', gap: 8, marginTop: IS_TV ? 20 : 14,
  },
  heroPlayBtn: {
    // undefined = tamanho pelo conteúdo. `flex: 0` no react-native-web vira
    // flex-basis: 0% e o botão colapsa, cortando o texto ("Assistr").
    flex: IS_TV ? undefined : 1,
    height: IS_TV ? 46 : 42,
    paddingHorizontal: IS_TV ? 28 : 0,
    borderRadius: 12,
    backgroundColor: colors.text1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  heroPlayText: { fontSize: IS_TV ? 15 : 14, fontWeight: '600', color: colors.textInverse },
  heroPlusBtn: {
    height: IS_TV ? 46 : 42,
    paddingHorizontal: IS_TV ? 20 : 13,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1, borderColor: colors.border,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  heroPlusBtnText: {
    fontSize: 14, fontWeight: '500', color: colors.text1,
  },

  // Empty state
  empty: {
    alignItems: 'center', justifyContent: 'center',
    gap: spacing.md, padding: spacing.xl,
  },
  emptyIconWrap: {
    width: IS_TV ? 96 : 80, height: IS_TV ? 96 : 80,
    borderRadius: IS_TV ? 48 : 40, backgroundColor: colors.bg2,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  emptyTitle: {
    fontSize: IS_TV ? fontSize.xl : fontSize.lg,
    fontWeight: '600', color: colors.text1,
    textAlign: 'center', letterSpacing: -0.3,
  },
  emptySubtitle: {
    fontSize: IS_TV ? fontSize.sm : fontSize.xs,
    color: colors.text3, textAlign: 'center',
    maxWidth: 320, lineHeight: 20,
  },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.accent, borderRadius: radius.lg,
    paddingHorizontal: IS_TV ? 28 : 20,
    paddingVertical: IS_TV ? 14 : 10,
    marginTop: spacing.sm,
  },
  addBtnText: {
    color: colors.white, fontSize: IS_TV ? fontSize.md : fontSize.sm, fontWeight: '600',
  },
});
