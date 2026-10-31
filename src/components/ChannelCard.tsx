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
  /** Posição na lista (1-based) — o "número do canal" que o usuário memoriza. */
  number?: number;
  isPlaying?: boolean;
  isFavorite?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  hasTVPreferredFocus?: boolean;
}

const fmtHM = (ms: number) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

// Linha de guia: nº · logo · nome | agora (título + horário + progresso) | a seguir.
// Sem caixa por linha nem grupo repetido: a categoria já está na sidebar.
function LiveChannelRowBase({
  channel, width, number, isPlaying, isFavorite, onPress, onLongPress, hasTVPreferredFocus,
}: LiveChannelRowProps) {
  const { accent, accent2 } = useAccentColors();
  const showEpg = useStore(s => s.settings.showEpg);
  const { now, next } = useNowNext(showEpg && !channel.id.startsWith('jf-') ? channel.id : undefined);
  const pct = now && now.end > now.start
    ? Math.max(0, Math.min(1, (Date.now() - now.start) / (now.end - now.start)))
    : 0;
  // dp, não px: a TV 1080p tem ~960dp de largura; a lista ocupa ~690.
  const wide = width >= 560;
  return (
    <TVFocusable
      onPress={onPress}
      onLongPress={onLongPress}
      hasTVPreferredFocus={hasTVPreferredFocus}
      accessibilityLabel={channel.name}
      // Sem zoom: linha de largura cheia ampliada invadia a sidebar e as vizinhas.
      focusScale={1}
      style={[rStyles.row, { width, height: LIVE_ROW_H }]}
    >
      {number != null && <Text style={rStyles.num}>{number}</Text>}
      <View style={[rStyles.logoBox, isPlaying && { borderColor: accent, borderWidth: 2 }]}>
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
      <View style={[rStyles.nameCol, !wide && { flex: 1 }]}>
        <Text style={rStyles.name} numberOfLines={1}>{cleanDisplayName(channel.name)}</Text>
        {!wide && now && <Text style={rStyles.sub} numberOfLines={1}>{now.title}</Text>}
        {isFavorite && <Ionicons name="heart" size={11} color={colors.text3} style={{ marginTop: 3 }} />}
      </View>
      {wide && (
        <View style={rStyles.nowCol}>
          {now ? (
            <>
              <Text style={rStyles.nowTitle} numberOfLines={1}>
                {now.title}<Text style={rStyles.time}>{`   ${fmtHM(now.start)}–${fmtHM(now.end)}`}</Text>
              </Text>
              <View style={rStyles.nowFoot}>
                <View style={rStyles.track}>
                  <View style={[rStyles.fill, { width: `${Math.round(pct * 100)}%`, backgroundColor: accent }]} />
                </View>
                {next && <Text style={rStyles.next} numberOfLines={1}>{`A seguir  ${fmtHM(next.start)}  ${next.title}`}</Text>}
              </View>
            </>
          ) : null /* sem EPG: vazio (um "Sem programação" em cada linha só fazia ruído) */}
        </View>
      )}
    </TVFocusable>
  );
}
export const LiveChannelRow = memo(LiveChannelRowBase, (a, b) =>
  a.channel === b.channel && a.width === b.width && a.number === b.number && a.isPlaying === b.isPlaying &&
  a.isFavorite === b.isFavorite && a.hasTVPreferredFocus === b.hasTVPreferredFocus);

const rStyles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    margin: LIVE_ROW_MARGIN, paddingHorizontal: 10,
    // Sem fundo/borda por linha e SEM overflow:'hidden' (cortaria o anel de foco).
    borderRadius: radius.md,
  },
  num: {
    width: 32, textAlign: 'right',
    fontFamily: fontFamily.medium, fontSize: IS_TV ? 15 : 12, color: colors.text3,
    fontVariant: ['tabular-nums'],
  },
  logoBox: {
    width: IS_TV ? 80 : 64, height: IS_TV ? 46 : 38, borderRadius: 8,
    backgroundColor: colors.bg2, padding: 5,
    alignItems: 'center', justifyContent: 'center',
  },
  logo: { width: '100%', height: '100%' },
  initials: { fontSize: 14, fontFamily: fontFamily.bold, letterSpacing: 1 },
  nameCol: { width: 210, justifyContent: 'center' },
  name: { color: colors.text1, fontSize: IS_TV ? 16 : 13, fontFamily: fontFamily.semiBold },
  sub: { color: colors.text2, fontSize: IS_TV ? 13 : 11, fontFamily: fontFamily.regular, marginTop: 2 },
  nowCol: { flex: 1, justifyContent: 'center', gap: 8 },
  nowFoot: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  nowTitle: { color: colors.text1, fontSize: IS_TV ? 15 : 13, fontFamily: fontFamily.medium },
  time: { color: colors.text3, fontFamily: fontFamily.regular, fontVariant: ['tabular-nums'] },
  track: { width: 96, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden' },
  fill: { height: '100%' },
  next: { flex: 1, color: colors.text3, fontSize: IS_TV ? 13 : 11, fontFamily: fontFamily.regular },
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