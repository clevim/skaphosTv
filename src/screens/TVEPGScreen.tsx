// TVEPGScreen.tsx — TV Electronic Program Guide
// Canais × horários com dados REAIS de XMLTV (epgStore: Xtream xmltv.php /
// url-tvg do M3U). Blocos posicionados pelo horário verdadeiro dos programas.
import React, { useRef, useState, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, FlatList, TextInput,
} from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store/useStore';
import { useEpgStore } from '../store/epgStore';
import { EpgProgram, nowNextFor } from '../utils/epg';
import { fold } from '../utils/search';
import TVFocusable from '../components/TVFocusable';
import { colors, spacing, fontSize, radius, UI_FONT_SCALE } from '../utils/theme';
import { RootStackParamList, Channel } from '../types';
import { IS_MOBILE } from '../utils/tvDetect';

type Nav = StackNavigationProp<RootStackParamList>;

const SLOT_WIDTH = 180;   // px per 30-min slot
const SLOT_MS = 30 * 60 * 1000;
const PX_PER_MS = SLOT_WIDTH / SLOT_MS;
const CHANNEL_COL = 200; // px for left channel column
const ROW_HEIGHT = 60;
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
  const scale = useStore(s => UI_FONT_SCALE[s.settings.uiFontScale]);
  const { now, next } = nowNextFor(programs);
  const progress = now ? Math.min(1, Math.max(0, (Date.now() - now.start) / (now.end - now.start))) : 0;
  return (
    <TVFocusable onPress={onPress} style={mStyles.row}>
      {ch.logo ? (
        <Image source={ch.logo} style={mStyles.logo} contentFit="contain" transition={0} recyclingKey={ch.id} />
      ) : (
        <View style={mStyles.logoPlaceholder}>
          <Text style={mStyles.logoText}>{ch.name.slice(0, 2).toUpperCase()}</Text>
        </View>
      )}
      <View style={mStyles.info}>
        <Text style={[mStyles.channelName, { fontSize: 13 * scale }]} numberOfLines={1}>{ch.name}</Text>
        {now ? (
          <>
            <Text style={[mStyles.nowTitle, { fontSize: 12 * scale }]} numberOfLines={1}>
              {now.title}
              <Text style={mStyles.nowTime}>  {fmtTime(now.start)}–{fmtTime(now.end)}</Text>
            </Text>
            <View style={mStyles.progressBg}>
              <View style={[mStyles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
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

export default function TVEPGScreen() {
  const navigation = useNavigation<Nav>();
  const channelIndex      = useStore(s => s.channelIndex);
  const scale             = useStore(s => UI_FONT_SCALE[s.settings.uiFontScale]);
  const setCurrentChannel = useStore(s => s.setCurrentChannel);
  const epgByChannel = useEpgStore(s => s.byChannelId);
  const epgLoading   = useEpgStore(s => s.loading);
  const epgError     = useEpgStore(s => s.error);
  const loadEpg      = useEpgStore(s => s.load);

  // Programa focado no D-pad — sinopse no rodapé
  const [focused, setFocused] = useState<{ channel: string; program: EpgProgram } | null>(null);

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

  const scrollRef = useRef<ScrollView>(null);   // eixo X — timeline única
  const leftColRef = useRef<ScrollView>(null);  // eixo Y — coluna de canais
  const rowsRef = useRef<ScrollView>(null);     // eixo Y — linhas de programas

  // Colunas de canais e linhas de programas rolam JUNTAS no eixo Y.
  // scrollTo no mesmo offset não re-emite evento → converge sem loop.
  // Roda do mouse: vertical rola os canais (webWheel global deixa o navegador
  // agir); Shift+roda/trackpad horizontal move o TEMPO — sempre em bloco,
  // porque a timeline inteira vive num único ScrollView horizontal.
  const syncY = (target: React.RefObject<ScrollView>) => (e: any) => {
    target.current?.scrollTo({ y: e.nativeEvent.contentOffset.y, animated: false });
  };

  const handlePlay = (ch: Channel) => {
    setCurrentChannel(ch);
    navigation.navigate('Player', { channel: ch });
  };

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
            <ActivityIndicator size="small" color={colors.accent} />
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
        <TVFocusable accessibilityLabel="Voltar" onPress={() => navigation.goBack()} style={styles.backBtn} hasTVPreferredFocus>
          <Ionicons name="chevron-back" size={18} color={colors.text1} />
        </TVFocusable>
        <Text style={styles.headerTitle}>Guia de Programação</Text>
        <Text style={styles.headerSub}>
          {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
        </Text>

        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={14} color={colors.text3} />
          <TextInput
            value={programQuery}
            onChangeText={setProgramQuery}
            placeholder="Onde passa..."
            placeholderTextColor={colors.text3}
            style={styles.searchInput}
          />
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
        </View>

        <View style={{ flex: 1 }} />
        {/* Estado do guia + atualizar */}
        {epgLoading && (
          <View style={styles.epgStatus}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={styles.epgStatusText}>Baixando guia…</Text>
          </View>
        )}
        {!epgLoading && epgError && (
          <Text style={[styles.epgStatusText, { color: colors.yellow }]} numberOfLines={1}>
            {epgError}
          </Text>
        )}
        {!epgLoading && (
          <TVFocusable onPress={() => loadEpg(true)} style={styles.nowBtn}>
            <Ionicons name="refresh-outline" size={13} color={colors.text2} />
            <Text style={styles.nowBtnText}>Atualizar</Text>
          </TVFocusable>
        )}
        {/* Jump to now */}
        <TVFocusable
          onPress={() => scrollRef.current?.scrollTo({ x: 0, animated: true })}
          style={styles.nowBtn}
        >
          <View style={styles.nowDot} />
          <Text style={styles.nowBtnText}>Agora</Text>
        </TVFocusable>
      </View>

      {isEmpty ? (
        <View style={styles.empty}>
          <Ionicons name="calendar-outline" size={64} color={colors.text3} />
          <Text style={styles.emptyTitle}>Nenhum canal ao vivo</Text>
          <Text style={styles.emptySubtitle}>Configure uma fonte M3U ou Xtream para ver a programação</Text>
          <TVFocusable onPress={() => (navigation as any).navigate('Setup')} style={styles.emptyBtn}>
            <Text style={styles.emptyBtnText}>Configurar fonte</Text>
          </TVFocusable>
        </View>
      ) : (
        <View style={styles.grid}>
          <View style={styles.gridBody}>
            {/* Coluna FIXA de canais — rola no eixo Y em sincronia com as linhas */}
            <View style={styles.channelCol}>
              <View style={styles.cornerCell} />
              <ScrollView
                ref={leftColRef}
                showsVerticalScrollIndicator={false}
                onScroll={syncY(rowsRef)}
                scrollEventThrottle={16}
              >
                {liveChannels.map(ch => (
                  <TVFocusable key={ch.id} onPress={() => handlePlay(ch)} style={styles.channelCell}>
                    {ch.logo ? (
                      <Image source={ch.logo} style={styles.channelLogo} contentFit="contain" transition={0} recyclingKey={ch.id} />
                    ) : (
                      <View style={styles.channelLogoPlaceholder}>
                        <Text style={styles.channelLogoText}>{ch.name.slice(0, 2).toUpperCase()}</Text>
                      </View>
                    )}
                    <Text style={[styles.channelName, { fontSize: 11 * scale }]} numberOfLines={2}>{ch.name}</Text>
                  </TVFocusable>
                ))}
              </ScrollView>
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
                      <View key={i} style={[styles.timeCell, i === nowOffset && styles.timeCellNow]}>
                        <Text style={[styles.timeText, i === nowOffset && styles.timeTextNow]}>{t}</Text>
                      </View>
                    ))}
                  </View>

                  {/* Linhas de programas — eixo Y sincronizado com a coluna de canais */}
                  <ScrollView
                    ref={rowsRef}
                    showsVerticalScrollIndicator={false}
                    onScroll={syncY(leftColRef)}
                    scrollEventThrottle={16}
                  >
                    {liveChannels.map(ch => (
                      <View key={ch.id} style={styles.programsLine}>
                        {buildRowBlocks(epgByChannel[ch.id], winStart, winEnd).map(block => {
                          if (!block.program) {
                            return (
                              <View key={block.key} style={[styles.programBlock, styles.programBlockEmpty, { width: block.width - 2 }]}>
                                {block.width > 90 && (
                                  <Text style={styles.programEmptyText} numberOfLines={1}>Sem informação</Text>
                                )}
                              </View>
                            );
                          }
                          const p = block.program;
                          const isNow = p.start <= Date.now() && Date.now() < p.end;
                          return (
                            <TVFocusable
                              key={block.key}
                              onPress={() => handlePlay(ch)}
                              onFocus={() => setFocused({ channel: ch.name, program: p })}
                              style={[
                                styles.programBlock,
                                { width: block.width - 2 },
                                isNow && styles.programBlockNow,
                              ]}
                            >
                              <Text style={[styles.programTitle, { fontSize: 12 * scale }, isNow && styles.programTitleNow]} numberOfLines={1}>
                                {p.title}
                              </Text>
                              <Text style={styles.programTime}>
                                {fmtTime(p.start)} — {fmtTime(p.end)}
                              </Text>
                            </TVFocusable>
                          );
                        })}
                      </View>
                    ))}
                  </ScrollView>
                </View>
              </ScrollView>
            </View>
          </View>

          {/* Rodapé: detalhes do programa focado no D-pad */}
          {focused && (
            <View style={styles.detailBar}>
              <Text style={styles.detailTitle} numberOfLines={1}>
                {focused.program.title}
                <Text style={styles.detailMeta}>
                  {'   '}{focused.channel} · {fmtTime(focused.program.start)}–{fmtTime(focused.program.end)}
                </Text>
              </Text>
              {!!focused.program.desc && (
                <Text style={styles.detailDesc} numberOfLines={2}>{focused.program.desc}</Text>
              )}
            </View>
          )}
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
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: radius.full,
    backgroundColor: colors.bg1, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text1,
    letterSpacing: -0.4,
  },
  headerSub: {
    fontSize: 13,
    color: colors.text3,
    textTransform: 'capitalize',
  },
  nowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
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
    fontSize: 12, fontWeight: '600', color: colors.text1,
  },

  // Busca de programa no guia
  searchWrap: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: 220,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.bg1,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: colors.text1,
    padding: 0,
  },
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
  searchResultTitle: { fontSize: 13, fontWeight: '600', color: colors.text1 },
  searchResultMeta: { fontSize: 11, color: colors.text3, marginTop: 2 },

  // Grid layout
  // minHeight:0 em toda a cadeia flex vertical até os ScrollViews: sem isso, no
  // web (CSS puro) um item flex não encolhe abaixo do tamanho do seu conteúdo
  // (min-height:auto por padrão), então a grade cresce e empurra a página em vez
  // de rolar internamente. O Yoga (nativo) não tem essa regra — por isso a TV/
  // Android sempre rolou normal e só o web ficava travado.
  grid: {
    flex: 1,
    flexDirection: 'column',
    minHeight: 0,
  },
  gridBody: {
    flex: 1,
    flexDirection: 'row',
    minHeight: 0,
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
  },
  timelineWrap: {
    flex: 1,
    minHeight: 0,
  },
  // flexGrow garante que o conteúdo estique na vertical dentro do ScrollView
  // horizontal (react-native-web dá flexGrow:1 só no eixo principal).
  timelineContent: {
    flexGrow: 1,
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
  timeCellNow: {
    backgroundColor: 'rgba(167,139,250,0.06)',
  },
  timeText: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.text3,
    letterSpacing: 0.4,
  },
  timeTextNow: {
    color: colors.accent,
    fontWeight: '700',
  },

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
    paddingHorizontal: 14,
    backgroundColor: colors.bg0,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  channelLogo: {
    width: 32, height: 32, borderRadius: radius.sm,
  },
  channelLogoPlaceholder: {
    width: 32, height: 32, borderRadius: radius.sm,
    backgroundColor: colors.bg2,
    alignItems: 'center', justifyContent: 'center',
  },
  channelLogoText: {
    fontSize: 10, fontWeight: '700', color: colors.text3,
  },
  channelName: {
    flex: 1, fontSize: 11, fontWeight: '500', color: colors.text1, lineHeight: 14,
  },

  programBlock: {
    height: ROW_HEIGHT - 1,
    justifyContent: 'center',
    paddingHorizontal: 10,
    backgroundColor: colors.bg1,
    borderRightWidth: 2,
    borderRightColor: colors.bg0,
  },
  // "No ar": tinta violeta + contorno completo sutil — sem a listra lateral
  // (side-stripe), que o design system bane.
  programBlockNow: {
    backgroundColor: 'rgba(167,139,250,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.35)',
    borderRadius: 6,
  },
  programTitle: {
    fontSize: 12, fontWeight: '500', color: colors.text1,
  },
  programTitleNow: {
    color: colors.accent2,
    fontWeight: '600',
  },
  programTime: {
    fontSize: 10, color: colors.text3, marginTop: 2,
  },
  programBlockEmpty: {
    backgroundColor: colors.bgSoft,
    opacity: 0.6,
  },
  programEmptyText: {
    fontSize: 11, color: colors.text3, fontStyle: 'italic',
  },

  // Status do guia no header
  epgStatus: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  epgStatusText: { fontSize: 12, color: colors.text3, maxWidth: 260 },

  // Rodapé com detalhes do programa focado
  detailBar: {
    paddingHorizontal: spacing.xxxl,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg1,
    minHeight: 58,
  },
  detailTitle: { fontSize: 13, fontWeight: '700', color: colors.text1 },
  detailMeta: { fontSize: 11, fontWeight: '400', color: colors.text3 },
  detailDesc: { fontSize: 11, color: colors.text2, marginTop: 3, lineHeight: 15 },

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
