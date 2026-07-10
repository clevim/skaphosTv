import React, { memo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import TVFocusable from './TVFocusable';
import { colors, radius, fontSize } from '../utils/theme';
import { useThemeStore } from '../store/useThemeStore';
import { Channel } from '../types';
import { IS_TV, IS_WEB } from '../utils/tvDetect';
import { cleanGroupName } from '../utils/channelUtils';

interface ChannelCardProps {
  channel: Channel;
  displayName?: string;
  isPlaying?: boolean;
  isFavorite?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  /** Alterna favorito. No web (sem long-press de mouse) vira um botão de estrela no card. */
  onToggleFavorite?: () => void;
  hasTVPreferredFocus?: boolean;
  episodeCount?: number;
  contentType?: 'live' | 'movies' | 'series';
  progress?: number; // 0-1 for "continue watching" cards
  /** Já assistido (≥90%) — mostra um check no lugar da barra de progresso. */
  watched?: boolean;
  cardWidth?: number;
  cardHeight?: number;
}

// Formato portrait (poster 2:3) — melhor enquadramento para filmes/séries
const CARD_W = IS_TV ? 160 : 110;
const CARD_H = IS_TV ? 224 : 154;
// Altura da seção de info — deve casar com INFO_H do HomeScreen (getItemLayout)
const INFO_H = IS_TV ? 72 : 56;

const TYPE_CONFIG = {
  live:   { label: 'AO VIVO', color: colors.red },
  movies: { label: 'FILME',   color: colors.blue },
  series: { label: 'SÉRIE',   color: colors.accent },
};

const QUALITY_COLORS: Record<string, string> = {
  '4K': colors.accent, 'FHD': colors.blue, 'HD': colors.green, 'SD': colors.text3,
};

function ChannelCard({
  channel, displayName, isPlaying, isFavorite, onPress, onLongPress, onToggleFavorite,
  hasTVPreferredFocus, episodeCount, contentType = 'live', progress, watched,
  cardWidth, cardHeight,
}: ChannelCardProps) {
  // Seletor pontual: sem ele, TODO card montado re-renderizava em qualquer
  // mudança da theme store (destructure assina a store inteira).
  const preset = useThemeStore(s => s.preset);
  const name = displayName ?? channel.name;
  const type = TYPE_CONFIG[contentType] ?? TYPE_CONFIG.live;
  const qColor = QUALITY_COLORS[channel.quality || 'HD'] ?? QUALITY_COLORS.HD;
  const quality = channel.quality || 'HD';

  const W = cardWidth ?? CARD_W;
  const H = cardHeight ?? Math.round(W * CARD_H / CARD_W);

  return (
    <TVFocusable
      onPress={onPress}
      onLongPress={onLongPress}
      hasTVPreferredFocus={hasTVPreferredFocus}
      accessibilityLabel={channel.name}
      style={[
        styles.card,
        // Altura EXPLÍCITA (box-sizing inclui a borda): sem ela, a borda de 1px
        // somava 2px à altura real de cada linha e o getItemLayout do grid ia
        // acumulando o erro — a virtualização errava a janela e os cards "pulavam".
        { width: W, height: H + INFO_H },
        isPlaying && { borderColor: preset.primary, borderWidth: 2 },
      ]}
    >
      {/* Poster */}
      <View style={[styles.poster, { height: H }, contentType === 'live' && styles.posterLive]}>
        {channel.logo ? (
          <Image
            source={channel.logo}
            style={styles.posterImg}
            // Live = logo largo/transparente → "contain" (não corta); VOD/série = pôster "cover"
            contentFit={contentType === 'live' ? 'contain' : 'cover'}
            transition={0}
            cachePolicy="memory-disk"
            recyclingKey={channel.id}
          />
        ) : (
          <View style={[styles.posterFallback, { backgroundColor: preset.primary + '18' }]}>
            <Text style={[styles.posterInitials, { color: preset.accent }]}>
              {name.slice(0, 2).toUpperCase()}
            </Text>
          </View>
        )}

        {/* Gradiente inferior */}
        <View style={styles.posterGradient} />

        {/* Badge tipo — canto superior esquerdo */}
        <View style={[styles.typeBadge, { backgroundColor: type.color }]}>
          <Text style={styles.badgeText}>{type.label}</Text>
        </View>

        {/* Badge qualidade — canto superior direito */}
        <View style={[styles.qualityBadge, { backgroundColor: qColor }]}>
          <Text style={styles.badgeText}>{quality}</Text>
        </View>

        {/* Indicador playing — pulso no canto inferior direito */}
        {isPlaying && (
          <View style={[styles.playingDot, { backgroundColor: preset.primary }]} />
        )}

        {/* Favorito — indicador estático (mobile/TV; no web o botão abaixo já mostra o estado) */}
        {isFavorite && !IS_WEB && (
          <View style={styles.favBadge}>
            <Ionicons name="star" size={9} color={colors.favorite} />
          </View>
        )}

        {/* Favorito — botão clicável no web (não há long-press de mouse). stopPropagation
            evita que o clique abra o card. */}
        {IS_WEB && onToggleFavorite && (
          <Pressable
            onPress={(e: any) => { e?.stopPropagation?.(); onToggleFavorite(); }}
            style={styles.favToggle}
            accessibilityLabel={isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
          >
            <Ionicons
              name={isFavorite ? 'star' : 'star-outline'}
              size={14}
              color={isFavorite ? colors.favorite : colors.white}
            />
          </Pressable>
        )}

        {/* Play overlay for continue-watching */}
        {progress != null && progress > 0 && (
          <View style={styles.playOverlay}>
            <View style={styles.playOverlayCircle}>
              <Ionicons name="play" size={14} color={colors.white} />
            </View>
          </View>
        )}

        {/* Progress bar — "assistindo" */}
        {progress != null && progress > 0 && (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.min(progress, 1) * 100}%`, backgroundColor: preset.accent }]} />
          </View>
        )}

        {/* "Assistido" — canto oposto ao favorito, some enquanto isPlaying */}
        {watched && !isPlaying && (
          <View style={styles.watchedBadge}>
            <Ionicons name="checkmark" size={10} color={colors.white} />
          </View>
        )}
      </View>

      {/* Info */}
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={2}>{name}</Text>
        {episodeCount && episodeCount > 1 ? (
          <Text style={[styles.epCount, { color: preset.accent }]}>{episodeCount} episódios</Text>
        ) : channel.group ? (
          <Text style={styles.group} numberOfLines={1}>
            {cleanGroupName(channel.group)}
          </Text>
        ) : null}
      </View>
    </TVFocusable>
  );
}

export default memo(ChannelCard);

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bg1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    margin: IS_TV ? 6 : 4,
    width: CARD_W,
    overflow: 'hidden',
  },
  poster: {
    width: '100%',
    height: CARD_H,
    backgroundColor: colors.bg3,
  },
  // Live: respiro ao redor + fundo neutro p/ o logo contido ficar uniforme
  posterLive: {
    padding: IS_TV ? 18 : 12,
    backgroundColor: colors.bg2,
  },
  posterImg: {
    width: '100%',
    height: '100%',
  },
  posterFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  posterInitials: {
    fontSize: IS_TV ? 32 : 22,
    fontWeight: '800',
    letterSpacing: 2,
  },
  posterGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 36,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  typeBadge: {
    position: 'absolute',
    top: 5,
    left: 5,
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  qualityBadge: {
    position: 'absolute',
    top: 5,
    right: 5,
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  badgeText: {
    color: colors.white,
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  playingDot: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  favBadge: {
    position: 'absolute',
    bottom: 5,
    left: 5,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  watchedBadge: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Botão de favorito no web — canto inferior direito do pôster
  favToggle: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
    // @ts-ignore — cursor é válido no react-native-web
    cursor: 'pointer',
  },
  info: {
    padding: IS_TV ? 10 : 7,
    gap: 2,
    // Fixed height so getItemLayout works reliably (all rows uniform)
    minHeight: IS_TV ? 72 : 56,
  },
  name: {
    color: colors.text1,
    fontSize: IS_TV ? fontSize.sm : 10,
    fontWeight: '600',
    lineHeight: IS_TV ? 18 : 14,
  },
  group: {
    color: colors.text3,
    fontSize: 9,
  },
  epCount: {
    fontSize: 9,
    fontWeight: '700',
  },
  playOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playOverlayCircle: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTrack: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
});