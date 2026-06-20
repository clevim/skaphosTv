import React from 'react';
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
import { detectType, getSeriesBaseName, isLaunchYear, LAUNCH_YEAR } from '../utils/channelUtils';
import { IS_TV } from '../utils/tvDetect';

// Stable progress % from channel id (avoids random re-renders)
function stableProgress(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xfffff;
  return 20 + (h % 60);
}

interface Props {
  recentChannels: Channel[];
  favoriteChannels: Channel[];
  sourcesEmpty: boolean;
  renderCard: (item: Channel, index: number) => React.ReactNode;
  contentH: number;
  channels?: Channel[];
  onChannelPress?: (channel: Channel) => void;
  onNavPress?: (key: string) => void;
}

const MAX = 20;

// ── Continue Watching Card ────────────────────────────────────
function ContinueCard({ channel, onPress }: { channel: Channel; onPress: () => void }) {
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
            <Ionicons name="play" size={14} color="#fff" />
          </View>
        </View>
        {/* Progress bar */}
        <View style={cStyles.progressTrack}>
          <View style={[cStyles.progressFill, { width: `${stableProgress(channel.id)}%` }]} />
        </View>
      </View>
      <Text style={cStyles.title} numberOfLines={1}>{channel.name}</Text>
      <Text style={cStyles.sub} numberOfLines={1}>
        {channel.group ? channel.group.replace(/[♦◆️]\s*/g, '').trim() : ''}
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
});

// ── Live Card ─────────────────────────────────────────────────
function LiveCard({ channel, onPress }: { channel: Channel; onPress: () => void }) {
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
      <Text style={lStyles.sub} numberOfLines={1}>
        {channel.group ? channel.group.replace(/[♦◆️]\s*/g, '').trim() : ''}
      </Text>
    </TVFocusable>
  );
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
  badgeText: { fontSize: 9, fontWeight: '600', color: '#fff' },
  title: { fontSize: 12, fontWeight: '600', color: colors.text1, marginTop: 8 },
  sub: { fontSize: 11, color: colors.text2, marginTop: 2 },
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
function VodCard({ channel, onPress, displayName, isNew }: {
  channel: Channel; onPress: () => void; displayName?: string; isNew?: boolean;
}) {
  const name = displayName ?? channel.name;
  const groupClean = channel.group ? channel.group.replace(/[♦◆️\uFE0F]\s*/g, '').trim() : '';
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
  newBadgeText: { fontSize: 8, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  qualBadge: {
    position: 'absolute', top: 6, right: 6,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 5, paddingVertical: 2,
    borderRadius: 3, borderWidth: 1, borderColor: colors.border,
  },
  qualBadgeText: { fontSize: 8, fontWeight: '700', color: colors.text2, letterSpacing: 0.3 },
  title: { fontSize: 12, fontWeight: '500', color: colors.text1, marginTop: 8, lineHeight: 16 },
  sub: { fontSize: 10, color: colors.text3, marginTop: 2 },
});

// ── Main HomeContent ──────────────────────────────────────────
export default function HomeContent({
  recentChannels, favoriteChannels, sourcesEmpty, renderCard, contentH,
  channels = [], onChannelPress, onNavPress,
}: Props) {
  const navigation = useNavigation();
  const isEmpty = recentChannels.length === 0 && favoriteChannels.length === 0;

  const handlePress = (ch: Channel) => {
    if (onChannelPress) {
      onChannelPress(ch);
    } else {
      (navigation as any).navigate('Player', { channel: ch });
    }
  };

  // Pick hero: prefer recent, then favorite, then first live, then any channel
  const heroChannel =
    recentChannels[0] ||
    favoriteChannels[0] ||
    channels.find(c => detectType(c.group || '', c.name) === 'live') ||
    channels[0] ||
    null;

  // streamType tem precedência sobre heurística — Jellyfin define isso explicitamente
  const heroType = heroChannel
    ? (heroChannel.streamType === 'movie'  ? 'movies'
       : heroChannel.streamType === 'series' ? 'series'
       : heroChannel.streamType === 'live'   ? 'live'
       : detectType(heroChannel.group || '', heroChannel.name))
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
          <Ionicons name="add-circle-outline" size={18} color="#fff" />
          <Text style={styles.addBtnText}>Adicionar Lista IPTV</Text>
        </TVFocusable>
      </View>
    );
  }

  // Separate content by type
  const liveChannels = channels.filter(c => detectType(c.group || '', c.name) === 'live').slice(0, 12);
  const movieChannels = channels.filter(c => detectType(c.group || '', c.name) === 'movies').slice(0, 12);
  const seriesChannels = (() => {
    const seen = new Set<string>();
    return channels.filter(c => {
      if (detectType(c.group || '', c.name) !== 'series') return false;
      const base = getSeriesBaseName(c.name);
      if (seen.has(base)) return false;
      seen.add(base);
      return true;
    }).slice(0, 12);
  })();
  const yearChannels = channels.filter(c => {
    const type = detectType(c.group || '', c.name);
    return type !== 'live' && isLaunchYear(c.name);
  }).slice(0, 12);

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
                EM DESTAQUE · {heroChannel.group?.replace(/[♦◆️\uFE0F]\s*/g, '').trim().toUpperCase() || 'CANAL'}
              </Text>
              <Text style={styles.heroTitle} numberOfLines={2}>{heroChannel.name}</Text>
              <Text style={styles.heroMeta}>
                {heroChannel.group?.replace(/[♦◆️\uFE0F]\s*/g, '').trim() || ''} · {heroChannel.quality || 'HD'}
              </Text>
              <View style={styles.heroActions}>
                <TVFocusable
                  onPress={() => handlePress(heroChannel)}
                  style={styles.heroPlayBtn}
                  hasTVPreferredFocus={IS_TV}
                >
                  <Ionicons name="play" size={14} color="#0a0a0b" />
                  <Text style={styles.heroPlayText}>Assistir</Text>
                </TVFocusable>
                <TVFocusable onPress={() => {}} style={styles.heroPlusBtn}>
                  <Ionicons name="add" size={IS_TV ? 18 : 16} color={colors.text1} />
                  {IS_TV && <Text style={styles.heroPlusBtnText}>Lista</Text>}
                </TVFocusable>
                {IS_TV && (
                  <TVFocusable onPress={() => {}} style={styles.heroPlusBtn}>
                    <Ionicons name="information-circle-outline" size={18} color={colors.text1} />
                    <Text style={styles.heroPlusBtnText}>Detalhes</Text>
                  </TVFocusable>
                )}
              </View>
            </View>
          </View>
        </View>
      )}

      {/* Continue assistindo */}
      {recentChannels.length > 0 && (
        <Section title="Continue assistindo" trailing="Ver tudo" onTrailingPress={() => onNavPress?.('favorites')}>
          <Row>
            {recentChannels.slice(0, MAX).map(ch => (
              <ContinueCard key={ch.id} channel={ch} onPress={() => handlePress(ch)} />
            ))}
          </Row>
        </Section>
      )}

      {/* Ao vivo agora */}
      {displayLive.length > 0 && (
        <Section title="Ao vivo agora" trailing="Ver tudo" onTrailingPress={() => onNavPress?.('live')}>
          <Row>
            {displayLive.map(ch => (
              <LiveCard key={ch.id} channel={ch} onPress={() => handlePress(ch)} />
            ))}
          </Row>
        </Section>
      )}

      {/* Filmes */}
      {movieChannels.length > 0 && (
        <Section title="Filmes para você" trailing="Ver tudo" onTrailingPress={() => onNavPress?.('movies')}>
          <Row>
            {movieChannels.map(ch => (
              <VodCard
                key={ch.id}
                channel={ch}
                onPress={() => handlePress(ch)}
                isNew={isLaunchYear(ch.name)}
              />
            ))}
          </Row>
        </Section>
      )}

      {/* Séries */}
      {seriesChannels.length > 0 && (
        <Section title="Séries" trailing="Ver tudo" onTrailingPress={() => onNavPress?.('series')}>
          <Row>
            {seriesChannels.map(ch => (
              <VodCard
                key={ch.id}
                channel={ch}
                onPress={() => handlePress(ch)}
                displayName={getSeriesBaseName(ch.name)}
                isNew={isLaunchYear(ch.name)}
              />
            ))}
          </Row>
        </Section>
      )}

      {/* 2026 — filmes e séries do ano */}
      {yearChannels.length > 0 && (
        <Section title={`Lançamentos ${LAUNCH_YEAR}`} trailing="Ver tudo" onTrailingPress={() => onNavPress?.('year')}>
          <Row>
            {yearChannels.map(ch => (
              <VodCard
                key={ch.id}
                channel={ch}
                onPress={() => handlePress(ch)}
                displayName={detectType(ch.group || '', ch.name) === 'series' ? getSeriesBaseName(ch.name) : ch.name}
                isNew
              />
            ))}
          </Row>
        </Section>
      )}

      {/* Favoritos */}
      {favoriteChannels.length > 0 && (
        <Section title="Meus Favoritos" trailing="Ver tudo" onTrailingPress={() => onNavPress?.('favorites')}>
          <Row>
            {favoriteChannels.slice(0, MAX).map((ch, i) => (
              <View key={ch.id}>{renderCard(ch, i)}</View>
            ))}
          </Row>
        </Section>
      )}

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
  heroLiveText: { fontSize: 10, fontWeight: '700', color: '#fff', letterSpacing: 1 },
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
    flex: IS_TV ? 0 : 1,
    height: IS_TV ? 46 : 42,
    paddingHorizontal: IS_TV ? 28 : 0,
    borderRadius: 12,
    backgroundColor: colors.text1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  heroPlayText: { fontSize: IS_TV ? 15 : 14, fontWeight: '600', color: '#0a0a0b' },
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
    color: '#fff', fontSize: IS_TV ? fontSize.md : fontSize.sm, fontWeight: '600',
  },
});
