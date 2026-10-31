// TVEPGScreen.tsx — TV Electronic Program Guide
// Canais × horários com dados REAIS de XMLTV (epgStore: Xtream xmltv.php /
// url-tvg do M3U). Blocos posicionados pelo horário verdadeiro dos programas.
import React, { useRef, useState, useMemo, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, FlatList, TextInput,
} from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useStore } from '../store/useStore';
import { useEpgStore } from '../store/epgStore';
import { EpgProgram, nowNextFor } from '../utils/epg';
import { fold } from '../utils/search';
import TVFocusable from '../components/TVFocusable';
import { SkChip } from '../components/sk';
import { colors, spacing, fontSize, radius, fontFamily, UI_FONT_SCALE } from '../utils/theme';
import { useAccentColors } from '../hooks/useAccentColors';
import { RootStackParamList, Channel } from '../types';
import { IS_MOBILE, IS_WEB } from '../utils/tvDetect';
import { useTVFocusMemory } from '../utils/tvFocusMemory';

type Nav = StackNavigationProp<RootStackParamList>;

const SLOT_WIDTH = 200;   // px per 30-min slot
const SLOT_MS = 30 * 60 * 1000;
const PX_PER_MS = SLOT_WIDTH / SLOT_MS;
const CHANNEL_COL = 220; // px for left channel column
const ROW_HEIGHT = 64;
const SLOT_COUNT = 14;

/** Início da janela: meia hora "cheia" anterior à atual, menos 1 slot de contexto. */
function windowStartMs(): number {
  const now = new Date();
  now.setMinutes(now.getMinutes() < 30 ? 0 : 30, 0, 0);
  return now.getTime() - SLOT_MS;
}

/** Blocos visuais de uma linha: programas reais + preenchimento de lacunas. */
interface RowBlock {
  key: string;
  width: number;
  program?: EpgProgram;   // ausente = lacuna sem informação
}

function buildRowBlocks(programs: EpgProgram[] | undefined, winStart: number, winEnd: number): RowBlock[] {
  const blocks: RowBlock[] = [];
  let cursor = winStart;
  for (const p of programs ?? []) {
    const start = Math.max(p.start, winStart);
    const end = Math.min(p.end, winEnd);
    if (end <= cursor) continue;
    if (start > cursor) {
      blocks.push({ key: `gap-${cursor}`, width: (start - cursor) * PX_PER_MS });
    }
    blocks.push({ key: `${p.start}`, width: (end - Math.max(start, cursor)) * PX_PER_MS, program: p });
    cursor = end;
    if (cursor >= winEnd) break;
  }
  if (cursor < winEnd) blocks.push({ key: `gap-${cursor}`, width: (winEnd - cursor) * PX_PER_MS });
  return blocks;
}

const fmtTime = (ms: number) =>
  new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** Linha do guia no CELULAR: logo + agora (com progresso) + a seguir. */
function MobileEpgRow({ ch, programs, onPress }: {
  ch: Channel; programs?: EpgProgram[]; onPress: () => void;
}) {
  const ac = useAccentColors();
  const scale = useStore(s => UI_FONT_SCALE[s.settings.uiFontScale]);
  const { now, next } = nowNextFor(programs);
  const progress = now ? Math.min(1, Math.max(0, (Date.now() - now.start) / (now.end - now.start))) : 0;
  return (
    <TVFocusable onPress={onPress} style={mStyles.row}>
      {ch.logo ? (
        <Image source={ch.logo} style={mStyles.logo} contentFit="contain" transition={0} cachePolicy="memory-disk" recyclingKey={ch.id} />
      ) : (
        <View style={mStyles.logoPlaceholder}>
          <Text style={mStyles.logoText}>{ch.name.slice(0, 2).toUpperCase()}</Text>
        </View>
      )}
      <View style={mStyles.info}>
        <Text style={[mStyles.channelName, { fontSize: 13 * scale }]} numberOfLines={1}>{ch.name}</Text>
        {now ? (
          <>
            <Text style={[mStyles.nowTitle, { fontSize: 12 * scale, color: ac.accent2 }]} numberOfLines={1}>
              {now.title}
              <Text style={mStyles.nowTime}>  {fmtTime(now.start)}–{fmtTime(now.end)}</Text>
            </Text>
            <View style={mStyles.progressBg}>
              <View style={[mStyles.progressFill, { backgroundColor: ac.accent, width: `${Math.round(progress * 100)}%` }]} />
            </View>
            {next && (
              <Text style={[mStyles.nextTitle, { fontSize: 11 * scale }]} numberOfLines={1}>A seguir: {next.title}</Text>
            )}
          </>
        ) : (
          <Text style={mStyles.noInfo}>Sem informação de programação</Text>
        )}
      </View>
      <Ionicons name="play-circle-outline" size={22} color={colors.text3} />
    </TVFocusable>
  );
}

type FocusedProgram = { channel: string; program: EpgProgram };

/** Rodapé com o programa focado. O estado vive AQUI: focar uma célula re-renderiza
 *  só este componente, nunca a tela nem as duas listas (era a cascata do D-pad). */
const DetailBar = React.memo(function DetailBar({ setterRef }: {
  setterRef: React.MutableRefObject<(f: FocusedProgram) => void>;
}) {
  const [focused, setFocused] = useState<FocusedProgram | null>(null);
  const scale = useStore(s => UI_FONT_SCALE[s.settings.uiFontScale]);
  setterRef.current = setFocused;
  const p = focused?.program;
  const live = !!p && p.start <= Date.now() && Date.now() < p.end;
  return (
    <View style={styles.detailBar}>
      {focused && p ? (
        <>
          <View style={styles.detailHead}>
            {live && <SkChip label="NO AR" variant="live" />}
            <Text style={[styles.detailTitle, { fontSize: 16 * scale }]} numberOfLines={1}>{p.title}</Text>
          </View>
          <Text style={[styles.detailMeta, { fontSize: 12 * scale }]} numberOfLines={1}>
            {focused.channel} · {fmtTime(p.start)}–{fmtTime(p.end)} · {Math.round((p.end - p.start) / 60000)} min
          </Text>
          {!!p.desc && (
            <Text style={[styles.detailDesc, { fontSize: 13 * scale, lineHeight: 18 * scale }]} numberOfLines={2}>{p.desc}</Text>
          )}
        </>
      ) : (
        <Text style={styles.detailHint}>{'Use as setas para explorar a grade · OK para assistir'}</Text>
      )}
    </View>
  );
});

const ChannelCell = React.memo(function ChannelCell({ ch, scale, preferred, onPlay }: {
  ch: Channel; scale: number; preferred: boolean; onPlay: (ch: Channel) => void;
}) {
  return (
    <TVFocusable onPress={() => onPlay(ch)} style={styles.channelCell} hasTVPreferredFocus={preferred}>
      {ch.logo ? (
        <Image source={ch.logo} style={styles.channelLogo} contentFit="contain" transition={0} cachePolicy="memory-disk" recyclingKey={ch.id} />
      ) : (
        <View style={styles.channelLogoPlaceholder}>
          <Text style={styles.channelLogoText}>{ch.name.slice(0, 2).toUpperCase()}</Text>
        </View>
      )}
      <Text style={[styles.channelName, { fontSize: 13 * scale, lineHeight: 17 * scale }]} numberOfLines={2}>{ch.name}</Text>
    </TVFocusable>
  );
});

const ProgramRow = React.memo(function ProgramRow({ ch, programs, winStart, winEnd, gridNow, scale, nowStyle, nowColor, nowBar, onPlay, onFocusProgram }: {
  ch: Channel; programs?: EpgProgram[]; winStart: number; winEnd: number; gridNow: number; scale: number;
  nowStyle: object; nowColor: string; nowBar: string;
  onPlay: (ch: Channel) => void; onFocusProgram: (f: FocusedProgram) => void;
}) {
  const blocks = useMemo(() => buildRowBlocks(programs, winStart, winEnd), [programs, winStart, winEnd]);
  return (
    <View style={styles.programsLine}>
      {blocks.map(block => {
        if (!block.program) {
          return (
            <View key={block.key} style={[styles.programBlock, styles.programBlockEmpty, { width: block.width - 2 }]}>
              {block.width > 90 && (
                <Text style={[styles.programEmptyText, { fontSize: 12 * scale }]} numberOfLines={1}>Sem informação</Text>
              )}
            </View>
          );
        }
        const p = block.program;
        const isNow = p.start <= gridNow && gridNow < p.end;
        const isPast = p.end <= gridNow;
        return (
          <TVFocusable
            key={block.key}
            onPress={() => onPlay(ch)}
            onFocus={() => onFocusProgram({ channel: ch.name, program: p })}
            borderRadius={radius.sm}
            // Sem zoom: bloco largo ampliado invadia os vizinhos da grade.
            focusScale={1}
            style={[styles.programBlock, { width: block.width - 2 }, isNow && nowStyle]}
          >
            <Text
              style={[styles.programTitle, { fontSize: 14 * scale }, isPast && styles.programTitlePast, isNow && styles.programTitleNow, isNow && { color: nowColor }]}
              numberOfLines={1}
            >
              {p.title}
            </Text>
            {/* Bloco estreito: só o título — o horário espremido virava ruído */}
            {block.width > 76 && (
              <Text style={[styles.programTime, { fontSize: 11 * scale }]} numberOfLines={1}>
                {fmtTime(p.start)} — {fmtTime(p.end)}
              </Text>
            )}
            {/* Progresso do "no ar": barra estática (sem timer/animação) */}
            {isNow && block.width > 76 && (
              <View
                pointerEvents="none"
                style={[styles.nowProgress, {
                  backgroundColor: nowBar,
                  width: Math.max(4, Math.min(1, (gridNow - p.start) / (p.end - p.start)) * (block.width - 24)),
                }]}
              />
            )}
          </TVFocusable>
        );
      })}
    </View>
  );
});

/** Campo "Onde passa": o foco vive aqui dentro (anel de acento) — focar/desfocar
 *  re-renderiza só este componente, não a tela nem a grade. */
const EpgSearch = React.memo(function EpgSearch({ value, onChange, accent, children }: {
  value: string; onChange: (t: string) => void; accent: string; children?: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.searchWrap, focused && { borderColor: accent, borderWidth: 2 }]}>
      <Ionicons name="search-outline" size={16} color={focused ? accent : colors.text3} />
      <TextInput
        value={value}
        onChangeText={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="Onde passa…"
        placeholderTextColor={colors.text3}
        style={styles.searchInput}
      />
      {children}
    </View>
  );
});

export default function TVEPGScreen() {
  // Devolve o foco do D-pad pro item de onde o usuário saiu ao voltar pra cá
  useTVFocusMemory();

  const navigation = useNavigation<Nav>();
  const channelIndex      = useStore(s => s.channelIndex);
  const scale             = useStore(s => UI_FONT_SCALE[s.settings.uiFontScale]);
  const setCurrentChannel = useStore(s => s.setCurrentChannel);
  const epgByChannel = useEpgStore(s => s.byChannelId);
  const epgLoading   = useEpgStore(s => s.loading);
  const epgError     = useEpgStore(s => s.error);
  const ac = useAccentColors();
  const loadEpg      = useEpgStore(s => s.load);

  // Programa focado no D-pad — sinopse no rodapé
  const detailSetRef = useRef<(f: FocusedProgram) => void>(() => {});
  const onFocusProgram = useCallback((f: FocusedProgram) => detailSetRef.current(f), []);

  // Busca por nome de programa — varre TODOS os canais ao vivo com guia (não só
  // os 60 exibidos na grade), tolerante a acento. Um resultado por canal.
  const [programQuery, setProgramQuery] = useState('');
  const programMatches = useMemo(() => {
    const q = fold(programQuery);
    if (!q) return [];
    const results: { channel: Channel; program: EpgProgram }[] = [];
    for (const ch of channelIndex?.live ?? []) {
      const progs = epgByChannel[ch.id];
      if (!progs) continue;
      const hit = progs.find(p => fold(p.title).includes(q));
      if (hit) results.push({ channel: ch, program: hit });
      if (results.length >= 30) break;
    }
    return results;
  }, [programQuery, channelIndex, epgByChannel]);

  const winStart = useMemo(() => windowStartMs(), []);
  const winEnd = winStart + SLOT_COUNT * SLOT_MS;
  const timeSlots = useMemo(
    () => Array.from({ length: SLOT_COUNT }, (_, i) => fmtTime(winStart + i * SLOT_MS)),
    [winStart],
  );
  const nowOffset = Math.min(SLOT_COUNT - 1, Math.max(0, Math.floor((Date.now() - winStart) / SLOT_MS)));

  useEffect(() => { loadEpg(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Only live channels for EPG — com programação primeiro (canais com guia sobem).
  // channelIndex.live já vem classificado (O(1)) do carregamento — reaproveita
  // em vez de re-escanear o catálogo inteiro com resolveContentType aqui.
  const liveChannels = useMemo(() => {
    const live = channelIndex?.live ?? [];
    const withEpg = live.filter(c => epgByChannel[c.id]?.length);
    const without = live.filter(c => !epgByChannel[c.id]?.length);
    return [...withEpg, ...without].slice(0, 60);
  }, [channelIndex, epgByChannel]);

  const isEmpty = liveChannels.length === 0;

  // Estável: entra nas dependências dos memos da grade abaixo.
  const handlePlay = useCallback((ch: Channel) => {
    setCurrentChannel(ch);
    navigation.navigate('Player', { channel: ch });
  }, [setCurrentChannel, navigation]);

  // A grade é o conteúdo mais pesado do app: 60 canais × ~10 blocos ≈ 600 views
  // focáveis. Duas defesas, e as duas precisam continuar de pé:
  //
  //  1. renderItem memoizado — cada movimento do D-pad só atualiza o rodapé de
  //     detalhes (setFocused); sem isto a grade inteira era reconstruída e
  //     buildRowBlocks rodava por canal a cada tecla.
  //  2. as duas listas são VIRTUALIZADAS (FlatList, não ScrollView): abrir o
  //     Guia montava as 600 views de uma vez, e era isso a travada ao entrar.
  //     Agora nasce com uma tela cheia e o resto entra em lotes.
  //
  // removeClippedSubviews FALSO nas duas: clipar destrói a view nativa focada e
  // o foco vai junto (mesma regra das fileiras da Home).
  // O foco inicial da tela é o primeiro canal da grade — o conteúdo, não o
  // cabeçalho. Concedido UMA vez por visita: a célula 0 vive numa lista
  // virtualizada e remonta ao rolar longe e voltar, o que puxaria o foco de
  // volta ao topo do nada (mesmo padrão do preferredGrantedRef da Home).
  const epgFocusGrantedRef = useRef(false);
  const renderChannelCell = useCallback(({ item: ch, index }: { item: Channel; index: number }) => {
    let preferred = false;
    if (index === 0 && !epgFocusGrantedRef.current) {
      epgFocusGrantedRef.current = true;
      preferred = true;
    }
    return <ChannelCell ch={ch} scale={scale} preferred={preferred} onPlay={handlePlay} />;
  }, [scale, handlePlay]);

  // Uma leitura do relógio para a grade toda (mesma frescura de antes).
  const gridNow = useMemo(() => Date.now(), [liveChannels, epgByChannel, winStart, winEnd]);

  // Estilo do "no ar" a partir do tema: objeto estável (muda só com o tema),
  // repassado às linhas como prop — nenhuma assinatura de store por célula.
  // Neutro: com a coluna "agora" inteira tingida, o acento passava de longe dos ~10%
  // da tela. O "no ar" se lê pelo fundo um tom mais claro + título forte + a barrinha
  // de progresso (essa sim no acento).
  const nowStyle = useMemo(() => ({ backgroundColor: 'rgba(255,255,255,0.075)' }), []);
  const nowSlotStyle = useMemo(() => ({}), []);
  const nowX = (gridNow - winStart) * PX_PER_MS;

  const renderProgramRow = useCallback(({ item: ch }: { item: Channel }) => (
    <ProgramRow
      ch={ch} programs={epgByChannel[ch.id]} winStart={winStart} winEnd={winEnd}
      gridNow={gridNow} scale={scale} nowStyle={nowStyle} nowColor={colors.text1} nowBar={ac.accent}
      onPlay={handlePlay} onFocusProgram={onFocusProgram}
    />
  ), [gridNow, epgByChannel, winStart, winEnd, scale, nowStyle, ac, handlePlay, onFocusProgram]);

  const epgKeyExtractor = useCallback((ch: Channel) => ch.id, []);
  // Altura fixa por linha → a lista sabe posicionar sem medir, o que mantém a
  // sincronia dos dois eixos exata mesmo com as linhas entrando aos poucos.
  const epgItemLayout = useCallback(
    (_: any, index: number) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index }),
    [],
  );

  const scrollRef = useRef<ScrollView>(null);       // eixo X — timeline única
  const leftColRef = useRef<FlatList<Channel>>(null); // eixo Y — coluna de canais
  const rowsRef = useRef<FlatList<Channel>>(null);    // eixo Y — linhas de programas

  // Colunas de canais e linhas de programas rolam JUNTAS no eixo Y.
  // Rolar para o mesmo offset não re-emite evento → converge sem loop.
  // Roda do mouse: vertical rola os canais (webWheel global deixa o navegador
  // agir); Shift+roda/trackpad horizontal move o TEMPO — sempre em bloco,
  // porque a timeline inteira vive num único ScrollView horizontal.
  //
  // Anti-loop: as duas listas se seguem via scrollToOffset, e cada scroll
  // programático volta como onScroll na outra. Com arredondamento dp/px o offset
  // oscila ±1 e o ping-pong nunca para (CPU 100% + GC contínuo = o hang do Guia).
  // Guardamos o offset conhecido de cada lista e só repassamos se divergir.
  const offs = useRef({ left: 0, rows: 0 }).current;
  const onLeftScroll = useCallback((e: any) => {
    const y = e.nativeEvent.contentOffset.y;
    offs.left = y;
    if (Math.abs(offs.rows - y) <= 1.5) return;
    offs.rows = y;
    rowsRef.current?.scrollToOffset({ offset: y, animated: false });
  }, [offs]);
  const onRowsScroll = useCallback((e: any) => {
    const y = e.nativeEvent.contentOffset.y;
    offs.rows = y;
    if (Math.abs(offs.left - y) <= 1.5) return;
    offs.left = y;
    leftColRef.current?.scrollToOffset({ offset: y, animated: false });
  }, [offs]);

  // ── Celular: lista vertical (agora/a seguir) — a grade de timeline não cabe
  // numa tela estreita e, sem virtualização, travava. FlatList resolve os dois.
  if (IS_MOBILE) {
    return (
      <View style={styles.root}>
        <View style={mStyles.header}>
          <TVFocusable accessibilityLabel="Voltar" onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={18} color={colors.text1} />
          </TVFocusable>
          <Text style={styles.headerTitle}>Guia</Text>
          <View style={{ flex: 1 }} />
          {epgLoading ? (
            <ActivityIndicator size="small" color={ac.accent} />
          ) : (
            <TVFocusable accessibilityLabel="Atualizar guia" onPress={() => loadEpg(true)} style={styles.nowBtn}>
              <Ionicons name="refresh-outline" size={14} color={colors.text2} />
            </TVFocusable>
          )}
        </View>
        <View style={mStyles.searchWrap}>
          <Ionicons name="search-outline" size={14} color={colors.text3} />
          <TextInput
            value={programQuery}
            onChangeText={setProgramQuery}
            placeholder="Onde passa..."
            placeholderTextColor={colors.text3}
            style={mStyles.searchInput}
          />
        </View>
        {!epgLoading && epgError && (
          <Text style={mStyles.error} numberOfLines={2}>{epgError}</Text>
        )}
        {programQuery ? (
          <FlatList
            data={programMatches}
            keyExtractor={m => m.channel.id}
            renderItem={({ item }) => (
              <TVFocusable onPress={() => { setProgramQuery(''); handlePlay(item.channel); }} style={mStyles.searchResultRow}>
                <Text style={mStyles.searchResultTitle} numberOfLines={1}>{item.program.title}</Text>
                <Text style={mStyles.searchResultMeta} numberOfLines={1}>
                  {item.channel.name} · {fmtTime(item.program.start)}–{fmtTime(item.program.end)}
                </Text>
              </TVFocusable>
            )}
            contentContainerStyle={mStyles.listContent}
            ListEmptyComponent={<Text style={mStyles.error}>Nenhum programa encontrado</Text>}
          />
        ) : isEmpty ? (
          <View style={styles.empty}>
            <Ionicons name="calendar-outline" size={64} color={colors.text3} />
            <Text style={styles.emptyTitle}>Nenhum canal ao vivo</Text>
            <Text style={styles.emptySubtitle}>Configure uma fonte M3U ou Xtream para ver a programação</Text>
          </View>
        ) : (
          <FlatList
            data={liveChannels}
            keyExtractor={ch => ch.id}
            renderItem={({ item }) => (
              <MobileEpgRow ch={item} programs={epgByChannel[item.id]} onPress={() => handlePlay(item)} />
            )}
            contentContainerStyle={mStyles.listContent}
            initialNumToRender={12}
            windowSize={7}
          />
        )}
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        {/* Sem hasTVPreferredFocus: abrir o guia e cair no botão Voltar significa
            que o primeiro OK — o reflexo natural de quem acabou de entrar numa
            tela — joga o usuário para fora dela. O foco inicial vai para a
            primeira linha da grade (ver renderChannelCell); daqui se chega
            subindo. */}
        {/* Voltar só no web; na TV física é a tecla do controle. */}
        {IS_WEB && (
          <TVFocusable accessibilityLabel="Voltar" onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={18} color={colors.text1} />
          </TVFocusable>
        )}
        <Text style={styles.headerTitle}>Guia</Text>
        <Text style={styles.headerSub}>
          {(() => { const d = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }); return d[0].toUpperCase() + d.slice(1); })()}
        </Text>

        <EpgSearch value={programQuery} onChange={setProgramQuery} accent={ac.accent}>
          {programMatches.length > 0 && (
            <View style={styles.searchResults}>
              {programMatches.map(({ channel, program }) => (
                <TVFocusable
                  key={channel.id}
                  onPress={() => { setProgramQuery(''); handlePlay(channel); }}
                  style={styles.searchResultRow}
                >
                  <Text style={styles.searchResultTitle} numberOfLines={1}>{program.title}</Text>
                  <Text style={styles.searchResultMeta} numberOfLines={1}>
                    {channel.name} · {fmtTime(program.start)}–{fmtTime(program.end)}
                  </Text>
                </TVFocusable>
              ))}
            </View>
          )}
          {programQuery.length > 0 && programMatches.length === 0 && (
            <View style={styles.searchResults}>
              <Text style={styles.searchEmpty}>{'Nenhum programa encontrado'}</Text>
            </View>
          )}
        </EpgSearch>

        <View style={{ flex: 1 }} />
        {/* Estado do guia + atualizar */}
        {epgLoading && (
          <View style={styles.epgStatus}>
            <ActivityIndicator size="small" color={ac.accent} />
            <Text style={styles.epgStatusText}>{'Baixando guia…'}</Text>
          </View>
        )}
        {!epgLoading && epgError && (
          <Text style={[styles.epgStatusText, { color: colors.yellow }]} numberOfLines={1}>
            {epgError}
          </Text>
        )}
        {!epgLoading && (
          <TVFocusable onPress={() => loadEpg(true)} style={styles.nowBtn}>
            <Ionicons name="refresh-outline" size={15} color={colors.text2} />
            <Text style={styles.nowBtnText}>Atualizar</Text>
          </TVFocusable>
        )}
        {/* Jump to now */}
        <TVFocusable
          onPress={() => scrollRef.current?.scrollTo({ x: 0, animated: true })}
          accessibilityLabel="Voltar para agora"
          style={styles.nowBtn}
        >
          <Ionicons name="time-outline" size={15} color={colors.text2} />
          <Text style={styles.nowBtnText}>Agora</Text>
        </TVFocusable>
      </View>

      {isEmpty ? (
        <View style={styles.empty}>
          <Ionicons name="calendar-outline" size={64} color={colors.text3} />
          <Text style={styles.emptyTitle}>Nenhum canal ao vivo</Text>
          <Text style={styles.emptySubtitle}>Configure uma fonte M3U ou Xtream para ver a programação</Text>
          <TVFocusable onPress={() => (navigation as any).navigate('Setup')} style={[styles.emptyBtn, { backgroundColor: ac.accent }]}>
            <Text style={styles.emptyBtnText}>Configurar fonte</Text>
          </TVFocusable>
        </View>
      ) : (
        <View style={styles.grid}>
          <View style={styles.gridBody}>
            {/* Coluna FIXA de canais — rola no eixo Y em sincronia com as linhas */}
            <View style={styles.channelCol}>
              <View style={styles.cornerCell}><Text style={styles.cornerText}>Canais</Text></View>
              <FlatList
                ref={leftColRef}
                // Altura limitada: sem isso a lista mede a si mesma pelo CONTEÚDO e
                // virtualização nenhuma acontece (e no web o painel estica).
                style={styles.vList}
                data={liveChannels}
                keyExtractor={epgKeyExtractor}
                renderItem={renderChannelCell}
                getItemLayout={epgItemLayout}
                showsVerticalScrollIndicator={false}
                onScroll={onLeftScroll}
                scrollEventThrottle={16}
                removeClippedSubviews={false}
                initialNumToRender={14}
                maxToRenderPerBatch={8}
                updateCellsBatchingPeriod={50}
                windowSize={5}
              />
            </View>

            {/* Timeline ÚNICA: cabeçalho + todas as linhas movem juntos no eixo X.
                No web, a roda do mouse sobre esta área rola o TEMPO (ver useEffect). */}
            <View style={styles.timelineWrap}>
              <ScrollView
                ref={scrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                scrollEventThrottle={16}
                contentContainerStyle={styles.timelineContent}
              >
                <View style={styles.timeline}>
                  {/* Cabeçalho de horários */}
                  <View style={styles.timeHeader}>
                    {timeSlots.map((t, i) => (
                      <View key={i} style={[styles.timeCell, i === nowOffset && nowSlotStyle]}>
                        <Text style={[styles.timeText, i === nowOffset && { color: colors.text1, fontFamily: fontFamily.semiBold }]}>{t}</Text>
                      </View>
                    ))}
                    {/* Marca do instante atual na régua */}
                    <View pointerEvents="none" style={[styles.nowTick, { left: nowX, backgroundColor: ac.accent }]} />
                  </View>

                  {/* Linhas de programas — eixo Y sincronizado com a coluna de canais */}
                  <FlatList
                    ref={rowsRef}
                    // Altura limitada: sem isso a lista mede a si mesma pelo CONTEÚDO e
                    // virtualização nenhuma acontece (e no web o painel estica).
                    style={styles.vList}
                    data={liveChannels}
                    keyExtractor={epgKeyExtractor}
                    renderItem={renderProgramRow}
                    getItemLayout={epgItemLayout}
                    showsVerticalScrollIndicator={false}
                    onScroll={onRowsScroll}
                    scrollEventThrottle={16}
                    removeClippedSubviews={false}
                    initialNumToRender={14}
                    maxToRenderPerBatch={8}
                    updateCellsBatchingPeriod={50}
                    windowSize={5}
                  />
                </View>
              </ScrollView>
            </View>
          </View>

          {/* Rodapé: detalhes do programa focado no D-pad */}
          <DetailBar setterRef={detailSetRef} />
        </View>
      )}
    </View>
  );
}

// ── Estilos do layout de celular ──────────────────────────────────────────────
const mStyles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.bg1,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, fontSize: 13, color: colors.text1, padding: 0 },
  searchResultRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  searchResultTitle: { fontSize: 13, fontWeight: '600', color: colors.text1 },
  searchResultMeta: { fontSize: 11, color: colors.text3, marginTop: 2 },
  error: {
    fontSize: fontSize.xs,
    color: colors.yellow,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  listContent: {
    paddingVertical: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  logo: {
    width: 44, height: 44, borderRadius: radius.md,
    backgroundColor: colors.bg1,
  },
  logoPlaceholder: {
    width: 44, height: 44, borderRadius: radius.md,
    backgroundColor: colors.bg2,
    alignItems: 'center', justifyContent: 'center',
  },
  logoText: { fontSize: 12, fontWeight: '700', color: colors.text3 },
  info: { flex: 1, gap: 3 },
  channelName: { fontSize: 13, fontWeight: '600', color: colors.text1 },
  nowTitle: { fontSize: 12, color: colors.accent2, fontWeight: '500' },
  nowTime: { fontSize: 10, color: colors.text3, fontWeight: '400' },
  progressBg: {
    height: 3, borderRadius: 2, backgroundColor: colors.bg2,
    overflow: 'hidden', marginVertical: 2,
  },
  progressFill: { height: 3, borderRadius: 2, backgroundColor: colors.accent },
  nextTitle: { fontSize: 11, color: colors.text2 },
  noInfo: { fontSize: 11, color: colors.text3, fontStyle: 'italic' },
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg0,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: spacing.xxxl,
    paddingTop: 28,
    paddingBottom: 16,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: radius.full,
    backgroundColor: colors.bg1, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 26,
    fontFamily: fontFamily.bold,
    color: colors.text1,
    letterSpacing: -0.6,
  },
  headerSub: {
    fontSize: 14,
    color: colors.text3,
    fontFamily: fontFamily.regular,
  },
  nowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.bg1,
    borderWidth: 1,
    borderColor: colors.border,
  },
  nowDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: colors.live,
  },
  nowBtnText: {
    fontSize: 14, fontWeight: '600', color: colors.text1,
  },

  // Busca de programa no guia
  searchWrap: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: 280,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.bg1,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text1,
    padding: 0,
  },
  searchEmpty: { fontSize: 13, color: colors.text2, fontFamily: fontFamily.regular, padding: 14 },
  searchResults: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 6,
    backgroundColor: colors.bg1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    maxHeight: 320,
    overflow: 'hidden',
    zIndex: 50,
    elevation: 10,
  },
  searchResultRow: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  searchResultTitle: { fontSize: 15, fontWeight: '600', color: colors.text1 },
  searchResultMeta: { fontSize: 12, color: colors.text3, marginTop: 2 },

  // Grid layout
  // minHeight:0 em toda a cadeia flex vertical até os ScrollViews: sem isso, no
  // web (CSS puro) um item flex não encolhe abaixo do tamanho do seu conteúdo
  // (min-height:auto por padrão), então a grade cresce e empurra a página em vez
  // de rolar internamente. O Yoga (nativo) não tem essa regra — por isso a TV/
  // Android sempre rolou normal e só o web ficava travado.
  vList: { flex: 1, minHeight: 0 },
  grid: {
    flex: 1,
    flexDirection: 'column',
    minHeight: 0,
  },
  gridBody: {
    flex: 1,
    flexDirection: 'row',
    minHeight: 0,
    // Respiro lateral: o zoom/anel de foco da 1a coluna não pode ser cortado (overscan)
    paddingLeft: spacing.xxl,
    paddingRight: spacing.xl,
  },
  channelCol: {
    width: CHANNEL_COL,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    backgroundColor: colors.bg0,
    minHeight: 0,
  },
  cornerCell: {
    height: ROW_HEIGHT * 0.75,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  cornerText: { fontSize: 13, color: colors.text3, fontFamily: fontFamily.medium },
  timelineWrap: {
    flex: 1,
    minHeight: 0,
  },
  // flexGrow garante que o conteúdo estique na vertical dentro do ScrollView
  // horizontal (react-native-web dá flexGrow:1 só no eixo principal).
  timelineContent: {
    flexGrow: 1,
    paddingLeft: 8, // folga p/ o zoom de foco da 1a coluna de tempo
  },
  timeline: {
    width: SLOT_COUNT * SLOT_WIDTH,
    flexDirection: 'column',
    minHeight: 0,
  },
  timeHeader: {
    flexDirection: 'row',
    height: ROW_HEIGHT * 0.75,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  timeCell: {
    width: SLOT_WIDTH,
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderRightWidth: 1,
    borderRightColor: colors.borderSoft,
  },
  timeText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text2,
    letterSpacing: 0.4,
  },
  nowTick: { position: 'absolute', top: 0, bottom: 0, width: 2 },

  // Rows
  programsLine: {
    flexDirection: 'row',
    height: ROW_HEIGHT,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  channelCell: {
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.bg0,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  channelLogo: {
    width: 40, height: 40, borderRadius: radius.sm,
  },
  channelLogoPlaceholder: {
    width: 40, height: 40, borderRadius: radius.sm,
    backgroundColor: colors.bg2,
    alignItems: 'center', justifyContent: 'center',
  },
  channelLogoText: {
    fontSize: 12, fontWeight: '700', color: colors.text3,
  },
  channelName: {
    flex: 1, fontSize: 13, fontWeight: '500', color: colors.text1, lineHeight: 17,
  },

  // Chip arredondado; o borderRight cor-de-fundo faz o "vão" entre blocos sem
  // alterar a largura de fluxo (a régua do tempo depende dela).
  programBlock: {
    height: ROW_HEIGHT - 1,
    justifyContent: 'center',
    paddingHorizontal: 10,
    backgroundColor: colors.bg1,
    borderRadius: 6,
    borderRightWidth: 2,
    borderRightColor: colors.bg0,
  },
  // "No ar": tinta + contorno do tema aplicados via prop nowStyle (NUNCA listra lateral).
  programTitle: {
    fontSize: 14, fontWeight: '600', color: colors.text1,
  },
  programTitlePast: { color: colors.text3, fontWeight: '500' },
  programTitleNow: { fontWeight: '700' },
  programTime: {
    fontSize: 11, color: colors.text2, marginTop: 2,
  },
  nowProgress: { position: 'absolute', left: 10, bottom: 6, height: 3, borderRadius: 2 },
  // Lacuna sem dados: contorno discreto, sem opacity (opacity derrubava o contraste do texto)
  programBlockEmpty: {
    backgroundColor: colors.bg0,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  programEmptyText: {
    fontSize: 12, color: colors.text3, fontStyle: 'italic',
  },

  // Status do guia no header
  epgStatus: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  epgStatusText: { fontSize: 13, fontFamily: fontFamily.regular, color: colors.text2, maxWidth: 260 },

  // Rodapé com detalhes do programa focado (altura mínima fixa: sem pulo de layout)
  detailBar: {
    paddingHorizontal: spacing.xxxl,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg1,
    minHeight: 84,
    justifyContent: 'center',
  },
  detailHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  detailTitle: { flexShrink: 1, fontSize: 16, fontWeight: '700', color: colors.text1 },
  detailMeta: { fontSize: 12, color: colors.text2, marginTop: 2 },
  detailDesc: { fontSize: 13, color: colors.text2, marginTop: 3, lineHeight: 18 },
  detailHint: { fontSize: 13, color: colors.text2, fontFamily: fontFamily.regular },

  // Empty state
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text1,
  },
  emptySubtitle: {
    fontSize: fontSize.sm,
    color: colors.text3,
    textAlign: 'center',
    maxWidth: 320,
  },
  emptyBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginTop: 8,
  },
  emptyBtnText: {
    color: colors.white,
    fontWeight: '600',
    fontSize: fontSize.sm,
  },
});
