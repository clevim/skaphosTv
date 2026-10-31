import React, { memo, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import TVFocusable from './TVFocusable';
import { useAccentColors, withAlpha } from '../hooks/useAccentColors';
import { colors, radius, fontSize, fontFamily } from '../utils/theme';
import { Channel } from '../types';
import { IS_TV, IS_WEB } from '../utils/tvDetect';
import { cleanGroupName, cleanDisplayName } from '../utils/channelUtils';
import { useStore } from '../store/useStore';
import { useNowNext } from '../store/epgStore';

/**
 * Image com recuperação: expo-image descarrega bitmaps sob pressão de memória (player) e
 * às vezes não recarrega — vira quadrado vazio. Aqui: onError => remonta (key) com backoff
 * até 3x; esgotado, mostra `fallback` (iniciais/ícone) em vez do vazio. Também remonta
 * quando o app volta a "active". `fallback` deve preencher o pai.
 */
export function SafeImage({ uri, style, contentFit = 'cover', fallback, recyclingKey, transition = 0 }: {
  uri?: string; style: any; contentFit?: 'cover' | 'contain'; fallback: React.ReactNode;
  recyclingKey?: string; transition?: number;
}) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => { setAttempt(0); setFailed(false); }, [uri]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  if (!uri || failed) return <>{fallback}</>;
  return (
    <Image
      key={attempt}
      source={uri}
      style={style}
      contentFit={contentFit}
      transition={transition}
      cachePolicy="memory-disk"
      recyclingKey={recyclingKey}
      onError={() => {
        if (attempt >= 3) { setFailed(true); return; }
        timer.current = setTimeout(() => setAttempt(a => a + 1), 600 * (attempt + 1));
      }}
    />
  );
}

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

function ChannelCard({
  channel, displayName, isPlaying, isFavorite, onPress, onLongPress, onToggleFavorite,
  hasTVPreferredFocus, episodeCount, contentType = 'live', progress, watched,
  cardWidth, cardHeight,
}: ChannelCardProps) {
  // Seletor pontual: sem ele, TODO card montado re-renderizava em qualquer
  // mudança da theme store (destructure assina a store inteira).
  const { accent, accent2 } = useAccentColors();
  const name = cleanDisplayName(displayName ?? channel.name);

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
      ]}
    >
      {/* Poster — o card É o pôster + legenda; sem caixa/borda em volta. */}
      <View style={[styles.poster, { height: H }, contentType === 'live' && styles.posterLive, isPlaying && { borderColor: accent, borderWidth: 2 }]}>
        <SafeImage
          uri={channel.logo}
          style={styles.posterImg}
          // Live = logo largo/transparente → "contain" (não corta); VOD/série = pôster "cover"
          contentFit={contentType === 'live' ? 'contain' : 'cover'}
          recyclingKey={channel.id}
          fallback={
            <View style={[styles.posterFallback, { backgroundColor: withAlpha(accent, 0.09) }]}>
              <Text style={[styles.posterInitials, { color: accent2 }]}>
                {name.slice(0, 2).toUpperCase()}
              </Text>
            </View>
          }
        />

        {/* Sem selos de tipo/qualidade: a aba já diz o que é e HD é o padrão. */}
        {/* Indicador playing — pulso no canto inferior direito */}
        {isPlaying && (
          <View style={[styles.playingDot, { backgroundColor: accent }]} />
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

        {/* Progress bar — "assistindo" */}
        {progress != null && progress > 0 && (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.min(progress, 1) * 100}%`, backgroundColor: accent }]} />
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
        {/* Grupo saiu: dentro da categoria ele só repetia o nome dela em todo card. */}
        {episodeCount && episodeCount > 1 ? (
          <Text style={styles.group}>{episodeCount} episódios</Text>
        ) : null}
      </View>
    </TVFocusable>
  );
}

export default memo(ChannelCard);

// ── Linha densa de canal (Ao vivo) ──────────────────────────────────────────
// Lista tipo guia: logo pequeno + nome + "Agora: programa" + barra de progresso.
// Substitui o card-pôster 2:3 (≈8 canais/tela) por ~14 linhas × 2 colunas.
export const LIVE_ROW_H = IS_TV ? 64 : 56;
const LIVE_ROW_MARGIN = IS_TV ? 4 : 3;
/** Altura total de uma linha (para getItemLayout). */
export const LIVE_ROW_STRIDE = LIVE_ROW_H + LIVE_ROW_MARGIN * 2;

interface LiveChannelRowProps {
  channel: Channel;
  width: number;
  isPlaying?: boolean;
  isFavorite?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  hasTVPreferredFocus?: boolean;
}

function LiveChannelRowBase({
  channel, width, isPlaying, isFavorite, onPress, onLongPress, hasTVPreferredFocus,
}: LiveChannelRowProps) {
  const { accent, accent2 } = useAccentColors();
  const showEpg = useStore(s => s.settings.showEpg);
  const { now } = useNowNext(showEpg && !channel.id.startsWith('jf-') ? channel.id : undefined);
  const pct = now && now.end > now.start
    ? Math.max(0, Math.min(1, (Date.now() - now.start) / (now.end - now.start)))
    : 0;
  const group = channel.group ? cleanGroupName(channel.group) : '';
  return (
    <TVFocusable
      onPress={onPress}
      onLongPress={onLongPress}
      hasTVPreferredFocus={hasTVPreferredFocus}
      accessibilityLabel={channel.name}
      style={[
        rStyles.row, { width, height: LIVE_ROW_H },
        isPlaying && { borderColor: accent, borderWidth: 2 },
      ]}
    >
      <View style={rStyles.logoBox}>
        <SafeImage
          uri={channel.logo}
          style={rStyles.logo}
          contentFit="contain"
          recyclingKey={channel.id}
          fallback={
            <Text style={[rStyles.initials, { color: accent2 }]}>
              {cleanDisplayName(channel.name).slice(0, 2).toUpperCase()}
            </Text>
          }
        />
      </View>
      <View style={rStyles.text}>
        <Text style={rStyles.name} numberOfLines={1}>{cleanDisplayName(channel.name)}</Text>
        <Text style={rStyles.sub} numberOfLines={1}>
          {now ? `Agora: ${now.title}` : group}
        </Text>
        {pct > 0 && (
          <View style={rStyles.track}>
            <View style={[rStyles.fill, { width: `${Math.round(pct * 100)}%`, backgroundColor: accent }]} />
          </View>
        )}
      </View>
      {isFavorite && <Ionicons name="heart" size={12} color={colors.favorite} />}
      {channel.quality && channel.quality !== 'HD' ? <Text style={rStyles.quality}>{channel.quality}</Text> : null}
    </TVFocusable>
  );
}
export const LiveChannelRow = memo(LiveChannelRowBase, (a, b) =>
  a.channel === b.channel && a.width === b.width && a.isPlaying === b.isPlaying &&
  a.isFavorite === b.isFavorite && a.hasTVPreferredFocus === b.hasTVPreferredFocus);

const rStyles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    margin: LIVE_ROW_MARGIN, paddingHorizontal: 10,
    // Sem borda e SEM overflow:'hidden' (cortaria o anel de foco, que fica fora).
    backgroundColor: 'rgba(255,255,255,0.035)', borderRadius: radius.md,
  },
  logoBox: {
    width: IS_TV ? 76 : 64, height: IS_TV ? 44 : 38, borderRadius: 6,
    backgroundColor: colors.bg2, padding: 4,
    alignItems: 'center', justifyContent: 'center',
  },
  logo: { width: '100%', height: '100%' },
  initials: { fontSize: 14, fontWeight: '800', letterSpacing: 1 },
  text: { flex: 1, gap: 2 },
  name: { color: colors.text1, fontSize: IS_TV ? fontSize.sm : 12, fontWeight: '600' },
  sub: { color: colors.text2, fontSize: IS_TV ? 12 : 10 },
  track: { height: 2, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginTop: 2 },
  fill: { height: '100%', borderRadius: 1 },
  quality: { color: colors.text2, fontSize: IS_TV ? 11 : 9, fontWeight: '700' },
});

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    margin: IS_TV ? 6 : 4,
    width: CARD_W,
    // Sem overflow aqui: cortaria o anel de foco, que fica FORA do card. O recorte
    // do raio fica no pôster (único filho que encosta nas bordas de cima).
  },
  poster: {
    width: '100%',
    height: CARD_H,
    backgroundColor: colors.bg2,
    borderRadius: radius.md,
    overflow: 'hidden',
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
    paddingTop: IS_TV ? 10 : 7,
    paddingHorizontal: 2,
    gap: 2,
    // Fixed height so getItemLayout works reliably (all rows uniform)
    minHeight: IS_TV ? 72 : 56,
  },
  name: {
    color: colors.text1,
    fontFamily: fontFamily.medium,
    fontSize: IS_TV ? 14 : 11,
    lineHeight: IS_TV ? 18 : 14,
  },
  group: {
    color: colors.text3,
    fontFamily: fontFamily.regular,
    fontSize: IS_TV ? 12 : 10,
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