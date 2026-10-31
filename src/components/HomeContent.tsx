import React, { useMemo, useState, useEffect, useCallback, useRef, memo } from 'react';
import {
  View, Text, StyleSheet, FlatList, useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeImage } from './ChannelCard';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Channel } from '../types';
import TVFocusable from './TVFocusable';
import PulsingDot from './PulsingDot';
import { colors, spacing, fontSize, radius, fontFamily, shadow } from '../utils/theme';
import { getSeriesBaseName, isLaunchYear, LAUNCH_YEAR, cleanGroupName, cleanDisplayName } from '../utils/channelUtils';
import { IS_TV } from '../utils/tvDetect';
import { afterInteractions } from '../utils/afterInteractions';
import { useWatchEntries, progressFractionFor, resumePositionFor, watchStatusFor, computeContinueWatching, WatchEntry } from '../store/watchProgress';
import { useNowNext } from '../store/epgStore';
import { useStore, resolveChannelType } from '../store/useStore';
import { useAccentColors } from '../hooks/useAccentColors';

interface Props {
  recentChannels: Channel[];
  favoriteChannels: Channel[];
  sourcesEmpty: boolean;
  renderCard: (item: Channel, index: number) => React.ReactNode;
  /** Largura do ChannelCard usado por renderCard — a fileira precisa dela pra virtualizar. */
  cardWidth: number;
  contentH: number;
  channels?: Channel[];
  /** Gêneros mais frequentes do catálogo (pré-computados em channelIndex.topGenres). */
  topGenres?: { genre: string; channels: Channel[] }[];
  /** Entrou no catálogo do provedor nos últimos dias (channelIndex.recentlyAdded). */
  recentlyAdded?: Channel[];
  onChannelPress?: (channel: Channel) => void;
  /** Hero "Assistir" — inicia a reprodução direto (filme/ao vivo → player). */
  onWatch?: (channel: Channel) => void;
  /** Hero "Detalhes" — abre a página de detalhes. */
  onDetails?: (channel: Channel) => void;
  onNavPress?: (key: string) => void;
}

const MAX = 20;

// Fora do componente: identidade fixa. Uma arrow inline aqui faria a FlatList
// tratar todas as células como novas a cada render.
const renderSection = ({ item }: { item: { node: React.ReactNode } }) => <>{item.node}</>;
const sectionKey = (s: { key: string }) => s.key;
// Folga final: a barra de dicas (RemoteHints) flutua sobre o rodapé da TV.
// Fontes carregadas mas sem nenhuma fileira para mostrar: a Home não fica muda.
const emptyRows = (
  <View style={{ paddingHorizontal: IS_TV ? spacing.xxxl : 22, paddingTop: spacing.xl }}>
    <Text style={{ fontFamily: fontFamily.regular, fontSize: IS_TV ? 14 : 12, color: colors.text2 }}>
      {'Nada por aqui ainda — abra Ao vivo, Filmes ou Séries na barra acima'}
    </Text>
  </View>
);
const listFooter = <View style={{ height: IS_TV ? 110 : 60 }} />;

// Larguras dos cards — fonte única: o estilo do card E o getItemLayout da fileira
// leem daqui. Divergir os dois desalinha a virtualização do layout real.
const CONTINUE_W = IS_TV ? 240 : 176;
const LIVE_W     = IS_TV ? 200 : 148;
const VOD_W      = IS_TV ? 160 : 116;
/** Altura da TVTopBar (absoluta, por cima): a fileira focada para logo abaixo dela. */
const TOPBAR_H = 64;

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

const ContinueCard = memo(function ContinueCard({
  channel, progress, entry, onPress, onFocus,
}: {
  channel: Channel;
  /** Fração real 0–1 do watchProgress; 0 esconde a barra (ex.: canal ao vivo). */
  progress: number;
  entry?: WatchEntry;
  onPress: () => void;
  onFocus?: () => void;
}) {
  const remaining = remainingLabel(entry);
  const { accent } = useAccentColors();
  return (
    <TVFocusable onPress={onPress} onFocus={onFocus} style={cStyles.card}>
      {/* Paisagem 16:9 — "continuar" é reconhecimento de cena, não capa; o formato
          largo diferencia a fileira do resto do catálogo (tudo era 2:3 igual). */}
      <View style={cStyles.poster}>
        <SafeImage uri={channel.logo} style={cStyles.posterImg} contentFit="cover" recyclingKey={channel.id} fallback={
          <View style={cStyles.posterFallback}>
            <Text style={[cStyles.posterInitials, { color: accent }]}>{channel.name.slice(0, 2).toUpperCase()}</Text>
          </View>
}/>
        {/* Sombra inferior: legibilidade do "Restam X min" sobre qualquer arte */}
        <LinearGradient
          colors={['transparent', 'rgba(10,8,16,0.85)']}
          style={cStyles.posterShade}
        />
        {remaining != null && (
          <Text style={cStyles.remaining} numberOfLines={1}>{remaining}</Text>
        )}
        {/* Barra de progresso REAL (watchProgress) — sem progresso, sem barra */}
        {progress > 0 && (
          <View style={cStyles.progressTrack}>
            <View style={[cStyles.progressFill, { width: `${Math.round(progress * 100)}%`, backgroundColor: accent }]} />
          </View>
        )}
      </View>
      <Text style={cStyles.title} numberOfLines={1}>{cleanDisplayName(channel.name)}</Text>
      <Text style={cStyles.sub} numberOfLines={1}>
        {channel.group ? cleanGroupName(channel.group) : ''}
      </Text>
    </TVFocusable>
  );
}, (a, b) =>
  a.channel === b.channel && a.progress === b.progress && a.entry === b.entry,
);

const cStyles = StyleSheet.create({
  card: { width: CONTINUE_W },
  poster: {
    aspectRatio: 16 / 9,
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
  posterShade: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: '55%',
  },
  remaining: {
    position: 'absolute', bottom: 8, left: 10, right: 10,
    fontSize: IS_TV ? 12 : 10, fontWeight: '600', color: colors.text1,
  },
  progressTrack: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: 3, backgroundColor: 'rgba(255,255,255,0.15)',
  },
  progressFill: { height: '100%', backgroundColor: colors.accent },
  title: { fontSize: IS_TV ? 14 : 12, fontWeight: '600', color: colors.text1, marginTop: 8 },
  sub: { fontSize: IS_TV ? 12 : 10, color: colors.text2, marginTop: 2 },
});

// ── Live Card ─────────────────────────────────────────────────
const LiveCard = memo(function LiveCard({ channel, onPress, onFocus, nowPlaying }: {
  channel: Channel; onPress: () => void; onFocus?: () => void;
  /** Programa no ar (EPG) — substitui o grupo no subtítulo. */
  nowPlaying?: string;
}) {
  // Sem selo AO VIVO por card: a fileira inteira já se chama "Ao vivo agora".
  const { accent } = useAccentColors();
  return (
    <TVFocusable onPress={onPress} onFocus={onFocus} style={lStyles.card}>
      {/* Tile paisagem com o logo CONTIDO: logos de canal são paisagem/quadrados
          e o pôster 2:3 com "cover" cortava todos — aqui o logo aparece inteiro. */}
      <View style={lStyles.poster}>
        <SafeImage uri={channel.logo} style={lStyles.posterImg} contentFit="contain" recyclingKey={channel.id} fallback={
          <View style={lStyles.posterFallback}>
            <Text style={[lStyles.posterInitials, { color: accent }]}>{channel.name.slice(0, 2).toUpperCase()}</Text>
          </View>
}/>
      </View>
      <Text style={lStyles.title} numberOfLines={1}>{cleanDisplayName(channel.name)}</Text>
      <Text style={lStyles.sub} numberOfLines={1}>
        {nowPlaying ?? (channel.group ? cleanGroupName(channel.group) : '')}
      </Text>
    </TVFocusable>
  );
}, (a, b) => a.channel === b.channel && a.nowPlaying === b.nowPlaying);

/** LiveCard com "agora no ar" do EPG no subtítulo (quando o guia está ativo). */
const LiveCardWithEpg = memo(function LiveCardWithEpg({ channel, onPress, onFocus }: { channel: Channel; onPress: () => void; onFocus?: () => void }) {
  const showEpg = useStore(s => s.settings.showEpg);
  const { now } = useNowNext(showEpg && !channel.id.startsWith('jf-') ? channel.id : undefined);
  return <LiveCard channel={channel} onPress={onPress} onFocus={onFocus} nowPlaying={now?.title} />;
}, (a, b) => a.channel === b.channel);

const lStyles = StyleSheet.create({
  card: { width: LIVE_W },
  poster: {
    aspectRatio: 16 / 9,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: colors.bg2,
    borderWidth: 1, borderColor: colors.border,
    padding: 14,
  },
  posterImg: { width: '100%', height: '100%' },
  posterFallback: {
    width: '100%', height: '100%',
    alignItems: 'center', justifyContent: 'center',
  },
  posterInitials: { fontSize: 16, fontWeight: '800', color: colors.accent, letterSpacing: 2 },
  title: { fontSize: IS_TV ? 14 : 12, fontWeight: '600', color: colors.text1, marginTop: 8 },
  sub: { fontSize: IS_TV ? 12 : 11, color: colors.text2, marginTop: 2 },
});

// ── Section header ────────────────────────────────────────────
// TV/web: só o título — "Ver tudo" era uma parada de foco extra fora do caminho
// do D-pad, e a barra do topo já leva a Filmes/Séries/Favoritos.
// Smartphone: "Ver tudo" fica (atalho de toque padrão, alvo de 44dp).
function Section({ title, onSeeAll, children }: { title: string; onSeeAll?: () => void; children: React.ReactNode }) {
  return (
    <View style={sStyles.section}>
      <View style={sStyles.header}>
        <Text style={sStyles.title} numberOfLines={1}>{title}</Text>
        {!IS_TV && onSeeAll && (
          <TVFocusable onPress={onSeeAll} style={sStyles.seeAll} hitSlop={8} accessibilityLabel={`Ver tudo: ${title}`}>
            <Text style={sStyles.seeAllText}>Ver tudo</Text>
            <Ionicons name="chevron-forward" size={13} color={colors.text2} />
          </TVFocusable>
        )}
      </View>
      {children}
    </View>
  );
}

const sStyles = StyleSheet.create({
  // Título colado na própria fileira; o respiro grande fica ENTRE fileiras.
  section: { marginTop: IS_TV ? 18 : 24 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: IS_TV ? spacing.xxxl : 22,
  },
  title: {
    flexShrink: 1,
    fontFamily: fontFamily.semiBold,
    fontSize: IS_TV ? 19 : 16,
    color: colors.text1, letterSpacing: -0.3,
  },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 44, paddingLeft: 12 },
  seeAllText: { fontFamily: fontFamily.medium, fontSize: 13, color: colors.text2 },
});

// ── Horizontal Row ────────────────────────────────────────────
const ROW_GAP  = IS_TV ? 14 : 12;
const ROW_PAD  = IS_TV ? spacing.xxxl : 22;
// paddingVertical dá espaço pro card ampliado (zoom de foco) não ser recortado.
const ROW_PAD_V = IS_TV ? 20 : 8;

/**
 * Fileira horizontal virtualizada.
 *
 * Era um ScrollView com TODOS os cards montados — 9 fileiras × 12–20 cards
 * saíam ~160 views nativas vivas ao mesmo tempo, cada uma com listener de foco
 * e imagem. Agora só a janela visível (+ uma de folga) existe.
 *
 * Três ajustes são obrigatórios pro D-pad e não devem ser "simplificados":
 * - `removeClippedSubviews` FALSO: clipar destrói a view nativa do card focado
 *   e o foco vai junto (o Android cai numa busca a partir da raiz).
 * - `windowSize` ≥ 3: garante uma tela renderizada à frente, senão a próxima
 *   tecla para a direita encontra o vazio e o foco trava na borda.
 * - `getItemLayout`: sem ele a FlatList precisa medir para virtualizar, e a
 *   janela erra durante o movimento rápido.
 */
function Row<T>({ data, renderItem, keyExtractor, itemWidth, sectionIndex, onSectionFocus }: {
  data: readonly T[];
  /** `onFocus` leva o card focado à margem da fileira (overscan) — ligar no TVFocusable. */
  renderItem: (item: T, index: number, onFocus: () => void) => React.ReactElement;
  keyExtractor: (item: T, index: number) => string;
  /** Largura EXTERNA do card (inclui margem própria) — base do getItemLayout. */
  itemWidth: number;
  /** Posição da seção na lista vertical + callback estável: a fileira focada sobe pro topo. */
  sectionIndex?: number;
  onSectionFocus?: (index: number) => void;
}) {
  const { width } = useWindowDimensions();
  const stride = itemWidth + ROW_GAP;
  const listRef = useRef<FlatList<T>>(null);
  // O scroll nativo de foco revela o card no mínimo: o focado encostava na borda
  // esquerda (cortado pelo overscan). Alinha ao padding da fileira. TV apenas.
  const focusItem = useCallback((index: number) => {
    if (!IS_TV) return;
    listRef.current?.scrollToIndex({ index, viewOffset: ROW_PAD, animated: true });
    if (sectionIndex != null) onSectionFocus?.(sectionIndex);
  }, [sectionIndex, onSectionFocus]);
  return (
    <FlatList
      ref={listRef}
      horizontal
      data={data as T[]}
      renderItem={({ item, index }) => renderItem(item, index, () => focusItem(index))}
      keyExtractor={keyExtractor}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{
        gap: ROW_GAP,
        paddingHorizontal: ROW_PAD,
        paddingVertical: ROW_PAD_V,
      }}
      // Preenche a viewport + 2 de folga: o primeiro frame já nasce completo,
      // sem buraco visível na borda direita.
      initialNumToRender={Math.ceil(width / stride) + 2}
      maxToRenderPerBatch={4}
      updateCellsBatchingPeriod={50}
      windowSize={3}
      removeClippedSubviews={false}
      getItemLayout={(_, index) => ({ length: stride, offset: stride * index + ROW_PAD, index })}
    />
  );
}

// ── VOD Poster Card ───────────────────────────────────────────
const VodCard = memo(function VodCard({ channel, onPress, onFocus, displayName, isNew, progress, watched }: {
  channel: Channel; onPress: () => void; onFocus?: () => void; displayName?: string; isNew?: boolean;
  /** 0–1: mostra a barra de "assistindo" no rodapé do pôster. */
  progress?: number;
  /** Mostra o check de "assistido" no canto oposto ao de qualidade. */
  watched?: boolean;
}) {
  const name = cleanDisplayName(displayName ?? channel.name);
  const groupClean = channel.group ? cleanGroupName(channel.group) : '';
  const { accent } = useAccentColors();
  return (
    <TVFocusable onPress={onPress} onFocus={onFocus} style={vStyles.card}>
      <View style={vStyles.poster}>
        <SafeImage uri={channel.logo} style={vStyles.posterImg} contentFit="cover" recyclingKey={channel.id} fallback={
          <View style={vStyles.posterFallback}>
            <Text style={[vStyles.posterInitials, { color: accent }]}>{name.slice(0, 3).toUpperCase()}</Text>
          </View>
}/>
        {/* Sem selos NOVO/HD: a fileira já diz (Lançamentos, Adicionados) e HD é o padrão. */}
        {/* "Assistido" — canto inferior direito */}
        {watched && (
          <View style={vStyles.watchedBadge}>
            <Ionicons name="checkmark" size={10} color={colors.white} />
          </View>
        )}
        {/* Barra de "assistindo" — rodapé do pôster */}
        {progress != null && progress > 0 && (
          <View style={vStyles.progressTrack}>
            <View style={[vStyles.progressFill, { width: `${Math.round(progress * 100)}%`, backgroundColor: accent }]} />
          </View>
        )}
      </View>
      <Text style={vStyles.title} numberOfLines={2}>{name}</Text>
      {groupClean ? <Text style={vStyles.sub} numberOfLines={1}>{groupClean}</Text> : null}
    </TVFocusable>
  );
}, (a, b) =>
  a.channel === b.channel && a.displayName === b.displayName && a.isNew === b.isNew &&
  a.progress === b.progress && a.watched === b.watched,
);

const vStyles = StyleSheet.create({
  card: { width: VOD_W },
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
  title: { fontSize: IS_TV ? 14 : 12, fontWeight: '600', color: colors.text1, marginTop: 8, lineHeight: IS_TV ? 18 : 16 },
  sub: { fontSize: IS_TV ? 12 : 10, color: colors.text2, marginTop: 2 },
});

/** "Agora: programa" do EPG no hero de canal ao vivo (some sem guia/dados). */
const HeroNow = memo(function HeroNow({ channelId }: { channelId: string }) {
  const showEpg = useStore(s => s.settings.showEpg);
  const { now } = useNowNext(showEpg && !channelId.startsWith('jf-') ? channelId : undefined);
  if (!now) return null;
  return <Text style={styles.heroNow} numberOfLines={1}>{`Agora: ${now.title}`}</Text>;
});

// ── Main HomeContent ──────────────────────────────────────────
export default function HomeContent({
  recentChannels, favoriteChannels, sourcesEmpty, contentH,
  channels = [], topGenres = [], recentlyAdded = [], onChannelPress, onWatch, onDetails, onNavPress,
}: Props) {
  const { height: winH } = useWindowDimensions();
  const navigation = useNavigation();
  const watchEntries = useWatchEntries();
  const favorites = useStore(s => s.favorites);
  const toggleFavorite = useStore(s => s.toggleFavorite);
  const { accent, accent2 } = useAccentColors();
  const isEmpty = recentChannels.length === 0 && favoriteChannels.length === 0;

  // A lista de seções abaixo só monta depois que a transição de navegação
  // assenta — sem isso os primeiros cards competem com a animação de entrada e
  // ela engasga. O hero (header da lista) aparece na hora, então a tela nunca
  // fica em branco.
  //
  // O escalonamento manual que existia aqui (uma seção a cada 120ms) saiu: a
  // FlatList vertical já faz isso melhor via initialNumToRender +
  // maxToRenderPerBatch, e o timer ainda atrasava seções que estavam VISÍVEIS.
  //
  // Com PRAZO (afterInteractions): a fila do InteractionManager pode ficar presa
  // para sempre por um handle vazado em qualquer canto do app, e aí este `ready`
  // nunca virava true — a Home ficava só com o hero, sem nenhuma fileira, até
  // reabrir o app. Era isso o "às vezes a home não é gerada".
  const [ready, setReady] = useState(false);
  useEffect(() => afterInteractions(() => setReady(true)), []);

  // "Continue assistindo" com progresso REAL: itens em curso primeiro (mais
  // recentes antes), depois os demais recentes na ordem original. Séries usam
  // o progresso espelhado no id da série (gravado pelo player junto do episódio).
  const continueItems = useMemo(
    () => computeContinueWatching(recentChannels, watchEntries, MAX)
      // Canal ao vivo não tem o que "continuar" (e o logo ampliado vira arte quebrada).
      .filter(it => resolveChannelType(it.channel) !== 'live')
      // Uma entrada por série: dois episódios do mesmo show viravam dois cards iguais.
      .filter((it, i, arr) => {
        if (resolveChannelType(it.channel) !== 'series') return true;
        const base = getSeriesBaseName(it.channel.name);
        return arr.findIndex(o => resolveChannelType(o.channel) === 'series' && getSeriesBaseName(o.channel.name) === base) === i;
      }),
    [recentChannels, watchEntries],
  );

  // ── Rolagem guiada pelo foco (TV) ──────────────────────────────────────────
  // O scroll nativo do Android revela o item no MÍNIMO — o card focado ficava
  // por baixo da TVTopBar (absoluta) e o título da fileira sumia. Aqui: hero
  // focado → topo; card focado → a fileira encaixa logo abaixo da barra.
  // Estável (sem deps): vai dentro das seções memoizadas.
  const listRef = useRef<FlatList<{ key: string; node: React.ReactNode }>>(null);
  const lastSection = useRef(-1);
  const focusSection = useCallback((index: number) => {
    if (lastSection.current === index) return;
    lastSection.current = index;
    listRef.current?.scrollToIndex({ index, viewOffset: TOPBAR_H, animated: true });
  }, []);
  const focusHero = useCallback(() => {
    if (!IS_TV || lastSection.current === -1) return;
    lastSection.current = -1;
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  // Estável: é capturado por TODA seção memoizada abaixo — uma função nova por
  // render invalidaria todas elas.
  const handlePress = useCallback((ch: Channel) => {
    if (onChannelPress) {
      onChannelPress(ch);
    } else {
      (navigation as any).navigate('Player', { channel: ch });
    }
  }, [onChannelPress, navigation]);

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

  // Tipo entra na linha de meta (sentence case), não num selo/eyebrow à parte.
  const heroTypeLabel = isHeroJellyfin ? 'Jellyfin'
    : heroType === 'movies' ? 'Filme'
    : heroType === 'series' ? 'Série'
    : 'Ao vivo';
  const heroIsLive = heroType === 'live' && !isHeroJellyfin;

  // Fallback live channels if filtering returns nothing (provider hasn't ♦ markers)
  const displayLive = useMemo(() => (liveChannels.length > 0
    ? liveChannels
    : (channels.length > 0 ? channels : [...recentChannels, ...favoriteChannels]).slice(0, 12)),
    [liveChannels, channels, recentChannels, favoriteChannels]);

  // Hero em destaque — vira o ListHeaderComponent da lista abaixo. Memoizado: um
  // elemento novo a cada render remontaria o header da FlatList sem parar.
  const heroNode = useMemo(() => !heroChannel ? null : (
    <View style={IS_TV ? styles.heroWrapTV : styles.heroWrap}>
      {/* TV: palco de ~72% da tela começando no y=0 (sobe por trás da barra) —
          a primeira fileira espia por baixo e convida a descer. */}
      <View style={IS_TV ? [styles.heroTV, { height: Math.round(winH * 0.72) }] : styles.hero}>
        {heroType !== 'live' && heroChannel.logo ? (
          // Filme/série: logo é arte de verdade (pôster/backdrop) → cobre o hero.
          <Image source={heroChannel.logo} style={styles.heroImg} contentFit="cover" transition={150} cachePolicy="memory-disk" />
        ) : (
          // Canal ao vivo: logo é um PNG pequeno — nunca ampliar (pixelava e
          // mostrava o xadrez de transparência). Fundo abissal em gradiente +
          // logo em tamanho natural, contido num tile à direita.
          <LinearGradient
            colors={[colors.bg2, '#1b1433', colors.bg0]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.heroFallback}
          >
            {heroType === 'live' && (
              <View style={IS_TV ? styles.heroLogoTileTV : styles.heroLogoTile}>
                <SafeImage uri={heroChannel.logo} style={styles.heroLogoImg} contentFit="contain" transition={150}
                  fallback={<Text style={[styles.heroInitials, { color: accent }]}>{cleanDisplayName(heroChannel.name).slice(0, 3).toUpperCase()}</Text>} />
              </View>
            )}
          </LinearGradient>
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
        {/* Bottom content: título manda; uma linha de meta; ações. Sem eyebrow/selo. */}
        <View style={IS_TV ? styles.heroBottomTV : styles.heroBottom}>
          <Text style={styles.heroTitle} numberOfLines={2}>{cleanDisplayName(heroChannel.name)}</Text>
          <View style={styles.heroMetaRow}>
            {heroIsLive && <PulsingDot size={6} color={colors.live} />}
            <Text style={styles.heroMeta} numberOfLines={1}>
              {[heroTypeLabel, heroChannel.group ? cleanGroupName(heroChannel.group) : null, heroChannel.quality !== 'HD' ? heroChannel.quality : null]
                .filter(Boolean).join('  ·  ')}
            </Text>
          </View>
          {heroIsLive && <HeroNow channelId={heroChannel.id} />}
          <View style={styles.heroActions}>
            <TVFocusable
              onPress={() => (onWatch ? onWatch(heroChannel) : handlePress(heroChannel))}
              onFocus={focusHero}
              style={[styles.heroPlayBtn, { backgroundColor: accent }]}
              // O highlight padrão de foco (roxo translúcido) apagava o fundo
              // branco e deixava o texto escuro ilegível — mantém fundo sólido.
              focusStyle={{ backgroundColor: accent2 }}
              hasTVPreferredFocus={IS_TV}
            >
              <Ionicons name="play" size={14} color={colors.textInverse} />
              <Text style={styles.heroPlayText}>Assistir</Text>
            </TVFocusable>
            <TVFocusable
              accessibilityLabel={favorites.includes(heroChannel.id) ? 'Remover da lista' : 'Adicionar à lista'}
              onPress={() => toggleFavorite(heroChannel.id)}
              onFocus={focusHero}
              style={styles.heroPlusBtn}
            >
              <Ionicons
                name={favorites.includes(heroChannel.id) ? 'checkmark' : 'add'}
                size={IS_TV ? 18 : 16}
                color={colors.text1}
              />
              {IS_TV && <Text style={styles.heroPlusBtnText}>Minha lista</Text>}
            </TVFocusable>
            <TVFocusable
              onPress={() => (onDetails ? onDetails(heroChannel) : handlePress(heroChannel))}
              onFocus={focusHero}
              style={styles.heroPlusBtn}
            >
              <Ionicons name="information-circle-outline" size={18} color={colors.text1} />
              {IS_TV && <Text style={styles.heroPlusBtnText}>Detalhes</Text>}
            </TVFocusable>
          </View>
        </View>
      </View>
    </View>
  ), [heroChannel, heroType, heroIsLive, heroTypeLabel, favorites, toggleFavorite, onWatch, onDetails, handlePress, focusHero, winH, accent, accent2]);

  // ── Seções da página, em ordem ────────────────────────────────────────────
  // Construir estes elementos é barato: a Row recebe `data` e só cria o
  // descritor da fileira — nenhum card é criado aqui. Quem decide o que
  // MONTA é a FlatList lá embaixo, que só instancia as seções na janela.
  //
  // MEMOIZADO, e isso não é micro-otimização: sem o useMemo, cada render do
  // HomeContent (tique de progresso, favoritar, qualquer mudança de store) cria
  // elementos NOVOS para as 9 seções. O React perde a identidade e re-renderiza
  // todas elas e as 8 listas horizontais aninhadas — trabalho suficiente para
  // saturar a thread JS, deixando o toque sem resposta e a lista vertical
  // recalculando a janela (cards sumindo). Com identidade estável o React
  // simplesmente pula as seções que não mudaram.
  const sections = useMemo(() => {
  const sections: { key: string; node: React.ReactNode }[] = [];
  const pushSection = (key: string, node: React.ReactNode) => sections.push({ key, node });

  if (ready && continueItems.length > 0) pushSection('continue', (
    <Section title="Continue assistindo" onSeeAll={() => onNavPress?.('favorites')}>
      <Row
        sectionIndex={sections.length}
        onSectionFocus={focusSection}
        data={continueItems}
        itemWidth={CONTINUE_W}
        keyExtractor={it => it.channel.id}
        renderItem={({ channel: ch, progress, entry }, _i, onFocus) => (
          <ContinueCard
            onFocus={onFocus}
            channel={ch}
            progress={progress}
            entry={entry}
            // Em curso → retoma direto (player resume; série abre no episódio certo).
            // Sem progresso → fluxo normal (filme abre Detalhes etc.)
            onPress={() => (progress > 0 && onWatch ? onWatch(ch) : handlePress(ch))}
          />
        )}
      />
    </Section>
  ));

  // Favoritos — logo após o início (Continue assistindo), não no fim da página
  if (ready && favoriteChannels.length > 0) pushSection('favorites', (
    <Section title="Minha lista" onSeeAll={() => onNavPress?.('favorites')}>
      <Row
        sectionIndex={sections.length}
        onSectionFocus={focusSection}
        data={favoriteChannels.slice(0, MAX)}
        // Mesmo pôster das outras fileiras (antes era o ChannelCard do catálogo, com caixa e selos)
        itemWidth={VOD_W}
        keyExtractor={ch => ch.id}
        renderItem={(ch, _i, onFocus) => {
          const status = badgeFor(ch, watchEntries);
          return (
            <VodCard
              onFocus={onFocus}
              channel={ch}
              onPress={() => handlePress(ch)}
              displayName={resolveChannelType(ch) === 'series' ? getSeriesBaseName(ch.name) : ch.name}
              watched={status.watched}
              progress={status.progress}
            />
          );
        }}
      />
    </Section>
  ));

  if (ready && displayLive.length > 0) pushSection('live', (
    <Section title="Ao vivo agora" onSeeAll={() => onNavPress?.('live')}>
      <Row
        sectionIndex={sections.length}
        onSectionFocus={focusSection}
        data={displayLive}
        itemWidth={LIVE_W}
        keyExtractor={ch => ch.id}
        renderItem={(ch, _i, onFocus) => <LiveCardWithEpg channel={ch} onPress={() => handlePress(ch)} onFocus={onFocus} />}
      />
    </Section>
  ));

  if (ready && movieChannels.length > 0) pushSection('movies', (
    <Section title="Filmes para você" onSeeAll={() => onNavPress?.('movies')}>
      <Row
        sectionIndex={sections.length}
        onSectionFocus={focusSection}
        data={movieChannels}
        itemWidth={VOD_W}
        keyExtractor={ch => ch.id}
        renderItem={(ch, _i, onFocus) => {
          const status = watchStatusFor(watchEntries[ch.id]);
          return (
            <VodCard
              onFocus={onFocus}
              channel={ch}
              onPress={() => handlePress(ch)}
              isNew={isLaunchYear(ch.name)}
              watched={status.watched}
              progress={status.progress}
            />
          );
        }}
      />
    </Section>
  ));

  // Séries — pick já trocado (swapWatchedSeriesPick) por um episódio em curso
  // quando o representante original estava 100% assistido.
  if (ready && seriesChannelsDisplay.length > 0) pushSection('series', (
    <Section title="Séries" onSeeAll={() => onNavPress?.('series')}>
      <Row
        sectionIndex={sections.length}
        onSectionFocus={focusSection}
        data={seriesChannelsDisplay}
        itemWidth={VOD_W}
        keyExtractor={ch => ch.id}
        renderItem={(ch, _i, onFocus) => {
          const status = watchStatusFor(watchEntries[ch.id]);
          return (
            <VodCard
              onFocus={onFocus}
              channel={ch}
              onPress={() => handlePress(ch)}
              displayName={getSeriesBaseName(ch.name)}
              isNew={isLaunchYear(ch.name)}
              watched={status.watched}
              progress={status.progress}
            />
          );
        }}
      />
    </Section>
  ));

  // Adicionados recentemente — o que ENTROU no catálogo, pela data do provedor.
  // Não é a mesma coisa que "Lançamentos" logo abaixo: lá é o ano da obra, aqui
  // é quando ela apareceu na lista. Só existe se o provedor informar as datas.
  if (ready && recentlyAdded.length > 0) pushSection('recent', (
    <Section title="Adicionados recentemente">
      <Row
        sectionIndex={sections.length}
        onSectionFocus={focusSection}
        data={recentlyAdded}
        itemWidth={VOD_W}
        keyExtractor={ch => ch.id}
        renderItem={(ch, _i, onFocus) => {
          const status = badgeFor(ch, watchEntries);
          return (
            <VodCard
              onFocus={onFocus}
              channel={ch}
              onPress={() => handlePress(ch)}
              displayName={resolveChannelType(ch) === 'series' ? getSeriesBaseName(ch.name) : ch.name}
              isNew
              watched={status.watched}
              progress={status.progress}
            />
          );
        }}
      />
    </Section>
  ));

  // Lançamentos — filmes e séries do ano corrente
  if (ready && yearChannels.length > 0) pushSection('year', (
    <Section title={`Lançamentos ${LAUNCH_YEAR}`} onSeeAll={() => onNavPress?.('year')}>
      <Row
        sectionIndex={sections.length}
        onSectionFocus={focusSection}
        data={yearChannels}
        itemWidth={VOD_W}
        keyExtractor={ch => ch.id}
        renderItem={(ch, _i, onFocus) => {
          const status = badgeFor(ch, watchEntries);
          return (
            <VodCard
              onFocus={onFocus}
              channel={ch}
              onPress={() => handlePress(ch)}
              displayName={resolveChannelType(ch) === 'series' ? getSeriesBaseName(ch.name) : ch.name}
              isNew
              watched={status.watched}
              progress={status.progress}
            />
          );
        }}
      />
    </Section>
  ));

  // Porque você assistiu X — mesmo gênero do último item não-ao-vivo visto
  if (ready && seed && becauseYouWatchedDisplay.length > 0) pushSection('because', (
    <Section title={`Porque você assistiu ${seed.name}`}>
      <Row
        sectionIndex={sections.length}
        onSectionFocus={focusSection}
        data={becauseYouWatchedDisplay}
        itemWidth={VOD_W}
        keyExtractor={ch => ch.id}
        renderItem={(ch, _i, onFocus) => {
          const status = watchStatusFor(watchEntries[ch.id]);
          return (
            <VodCard
              onFocus={onFocus}
              channel={ch}
              onPress={() => handlePress(ch)}
              displayName={resolveChannelType(ch) === 'series' ? getSeriesBaseName(ch.name) : ch.name}
              watched={status.watched}
              progress={status.progress}
            />
          );
        }}
      />
    </Section>
  ));

  // Recomendados por gênero — top gêneros pré-computados no channelIndex
  if (ready) topGenres.slice(0, 3).forEach(({ genre, channels: genreChannels }) => {
    pushSection(`genre-${genre}`, (
      <Section title={`Recomendados: ${genre}`}>
        <Row
          sectionIndex={sections.length}
          onSectionFocus={focusSection}
          data={genreChannels.slice(0, MAX)}
          itemWidth={VOD_W}
          keyExtractor={ch => ch.id}
          renderItem={(ch, _i, onFocus) => {
            const status = badgeFor(ch, watchEntries);
            return (
              <VodCard
                onFocus={onFocus}
                channel={ch}
                onPress={() => handlePress(ch)}
                displayName={resolveChannelType(ch) === 'series' ? getSeriesBaseName(ch.name) : ch.name}
                watched={status.watched}
                progress={status.progress}
              />
            );
          }}
        />
      </Section>
    ));
  });

    return sections;
  }, [
    ready, continueItems, favoriteChannels, displayLive, movieChannels,
    seriesChannelsDisplay, yearChannels, recentlyAdded, seed, becauseYouWatchedDisplay, topGenres,
    watchEntries, handlePress, onWatch, focusSection, onNavPress,
  ]);

  // Estado vazio DEPOIS de todos os hooks: um return antecipado acima deles
  // pularia os useMemo abaixo, e a ordem dos hooks mudaria entre um render sem
  // fontes e um render com fontes — o React quebra nesse caso.
  if (isEmpty && sourcesEmpty) {
    return (
      <View style={[styles.empty, { height: contentH }]}>
        <View style={styles.emptyIconWrap}>
          <Ionicons name="tv-outline" size={IS_TV ? 56 : 44} color={colors.text3} />
        </View>
        <Text style={styles.emptyTitle}>Bem-vindo ao SkaphosTV</Text>
        <Text style={styles.emptySubtitle}>
          Adicione uma lista IPTV para começar a assistir
        </Text>
        <TVFocusable
          onPress={() => (navigation as any).navigate('Setup')}
          style={[styles.addBtn, { backgroundColor: accent }]}
          focusStyle={{ backgroundColor: accent2 }}
          hasTVPreferredFocus
        >
          <Ionicons name="add-circle-outline" size={18} color={colors.textInverse} />
          <Text style={styles.addBtnText}>Adicionar Lista IPTV</Text>
        </TVFocusable>
      </View>
    );
  }

  return (
    <FlatList
      ref={listRef}
      style={{ height: contentH }}
      data={sections}
      onScrollToIndexFailed={() => { lastSection.current = -1; }}
      keyExtractor={sectionKey}
      renderItem={renderSection}
      // Hero fica no header: rola junto, mas nunca é desmontado — é ele que
      // recebe o foco inicial da TV (hasTVPreferredFocus).
      ListHeaderComponent={heroNode}
      ListEmptyComponent={ready ? emptyRows : null}
      ListFooterComponent={listFooter}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      // Sem getItemLayout de propósito: a altura varia por tipo de seção (hero,
      // fileira 2:3, fileira 16:9) e uma tabela de alturas fixas sairia errada
      // no primeiro ajuste de card. Com ~9 itens, medir é barato e é exato.
      //
      // windowSize 3 = uma tela renderizada acima e outra abaixo (~1,5 seção de
      // folga). Menos que isso e segurar "baixo" alcança o fim do renderizado
      // antes do RN reagir; o pior caso é uma travada de um frame, não um beco
      // sem saída — a trava nativa de foco não consome direcionais verticais.
      windowSize={3}
      initialNumToRender={2}
      maxToRenderPerBatch={2}
      updateCellsBatchingPeriod={50}
      // Clipar destruiria a view nativa do card focado, e o foco vai junto.
      removeClippedSubviews={false}
    />
  );
}

const styles = StyleSheet.create({
  content: {
    // TV: push content below the absolutely-positioned top bar (24px padding + ~20px text + 24px padding ≈ 88px)
    paddingTop: IS_TV ? 0 : 6,
  },

  // Hero — mobile (rounded card)
  heroWrap: {
    paddingHorizontal: 22,
  },
  hero: {
    position: 'relative',
    ...shadow.ambient,
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
    backgroundColor: colors.bg3,
    // overflow: 'hidden' removido — bloqueia TVFocusable buttons do FocusFinder
  },
  heroImg: { width: '100%', height: '100%' },
  heroFallback: {
    width: '100%', height: '100%',
    alignItems: IS_TV ? 'flex-end' : 'center', justifyContent: 'center',
    backgroundColor: colors.bg2,
  },
  // Tile do logo de canal: tamanho fixo (nunca esticado), à direita na TV.
  heroLogoTileTV: {
    width: 280, height: 160, marginRight: 120, borderRadius: 20, padding: 24,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  heroLogoTile: {
    width: 180, height: 100, marginBottom: 120, borderRadius: 16, padding: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  heroLogoImg: { width: '100%', height: '100%' },
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
  heroBottom: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 18,
  },
  heroBottomTV: {
    position: 'absolute',
    top: 0, bottom: 0, left: 0,
    width: '55%',
    paddingLeft: spacing.xxxl,
    paddingRight: spacing.xl,
    paddingBottom: 28,
    justifyContent: 'flex-end',
  },
  heroTitle: {
    fontSize: IS_TV ? 46 : 28, fontFamily: fontFamily.bold,
    color: colors.text1, letterSpacing: IS_TV ? -1.6 : -0.8,
    lineHeight: IS_TV ? 50 : 33,
  },
  heroMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: IS_TV ? 10 : 6 },
  heroMeta: { flexShrink: 1, fontFamily: fontFamily.medium, fontSize: IS_TV ? 15 : 12, color: colors.text2 },
  heroNow: { fontFamily: fontFamily.medium, fontSize: IS_TV ? 15 : 12, color: colors.text1, marginTop: 4 },
  heroActions: {
    flexDirection: 'row', gap: IS_TV ? 12 : 8, marginTop: IS_TV ? 22 : 14,
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
  heroPlayText: { fontSize: IS_TV ? 16 : 14, fontWeight: '700', color: colors.textInverse },
  heroPlusBtn: {
    height: IS_TV ? 46 : 42,
    paddingHorizontal: IS_TV ? 20 : 13,
    borderRadius: 12,
    // Secundário = vidro neutro sem contorno: o primário (acento) é o único que chama.
    backgroundColor: 'rgba(255,255,255,0.14)',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  heroPlusBtnText: {
    fontSize: IS_TV ? 15 : 14, fontWeight: '500', color: colors.text1,
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
  // Foco CLAREIA o botão accent — o FOCUS_BG translúcido padrão o escurecia
  addBtnFocused: { backgroundColor: colors.accent2 },
  addBtnText: {
    color: colors.textInverse, fontSize: IS_TV ? fontSize.md : fontSize.sm, fontWeight: '600',
  },
});
