// TVEPGScreen.tsx — TV Electronic Program Guide
// Canais × horários com dados REAIS de XMLTV (epgStore: Xtream xmltv.php /
// url-tvg do M3U). Blocos posicionados pelo horário verdadeiro dos programas.
import React, { useRef, useState, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store/useStore';
import { useEpgStore } from '../store/epgStore';
import { EpgProgram } from '../utils/epg';
import TVFocusable from '../components/TVFocusable';
import { colors, spacing, fontSize, radius } from '../utils/theme';
import { RootStackParamList, Channel } from '../types';
import { detectType } from '../utils/channelUtils';

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

export default function TVEPGScreen() {
  const navigation = useNavigation<Nav>();
  const channels          = useStore(s => s.channels);
  const setCurrentChannel = useStore(s => s.setCurrentChannel);
  const epgByChannel = useEpgStore(s => s.byChannelId);
  const epgLoading   = useEpgStore(s => s.loading);
  const epgError     = useEpgStore(s => s.error);
  const loadEpg      = useEpgStore(s => s.load);

  // Programa focado no D-pad — sinopse no rodapé
  const [focused, setFocused] = useState<{ channel: string; program: EpgProgram } | null>(null);

  const winStart = useMemo(() => windowStartMs(), []);
  const winEnd = winStart + SLOT_COUNT * SLOT_MS;
  const timeSlots = useMemo(
    () => Array.from({ length: SLOT_COUNT }, (_, i) => fmtTime(winStart + i * SLOT_MS)),
    [winStart],
  );
  const nowOffset = Math.min(SLOT_COUNT - 1, Math.max(0, Math.floor((Date.now() - winStart) / SLOT_MS)));

  useEffect(() => { loadEpg(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Only live channels for EPG — com programação primeiro (canais com guia sobem)
  const liveChannels = useMemo(() => {
    const live = channels.filter(c => detectType(c.group || '', c.name) === 'live');
    const withEpg = live.filter(c => epgByChannel[c.id]?.length);
    const without = live.filter(c => !epgByChannel[c.id]?.length);
    return [...withEpg, ...without].slice(0, 60);
  }, [channels, epgByChannel]);

  const scrollRef = useRef<ScrollView>(null);

  const handlePlay = (ch: Channel) => {
    setCurrentChannel(ch);
    navigation.navigate('Player', { channel: ch });
  };

  const isEmpty = liveChannels.length === 0;

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <TVFocusable onPress={() => navigation.goBack()} style={styles.backBtn} hasTVPreferredFocus>
          <Ionicons name="chevron-back" size={18} color={colors.text1} />
        </TVFocusable>
        <Text style={styles.headerTitle}>Guia de Programação</Text>
        <Text style={styles.headerSub}>
          {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
        </Text>
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
          {/* Fixed channel column header */}
          <View style={styles.cornerCell} />

          {/* Scrollable area: time header + program rows */}
          <ScrollView
            ref={scrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.hScroll}
          >
            {/* Time header row */}
            <View style={styles.timeHeader}>
              {timeSlots.map((t, i) => (
                <View key={i} style={[styles.timeCell, i === nowOffset && styles.timeCellNow]}>
                  <Text style={[styles.timeText, i === nowOffset && styles.timeTextNow]}>{t}</Text>
                </View>
              ))}
            </View>
          </ScrollView>

          {/* Channel list + scrollable program rows */}
          <ScrollView showsVerticalScrollIndicator={false} style={styles.rowsOuter}>
            {liveChannels.map(ch => (
              <View key={ch.id} style={styles.epgRow}>
                {/* Channel info — fixed column */}
                <TVFocusable onPress={() => handlePlay(ch)} style={styles.channelCell}>
                  {ch.logo ? (
                    <Image source={ch.logo} style={styles.channelLogo} contentFit="contain" transition={0} recyclingKey={ch.id} />
                  ) : (
                    <View style={styles.channelLogoPlaceholder}>
                      <Text style={styles.channelLogoText}>{ch.name.slice(0, 2).toUpperCase()}</Text>
                    </View>
                  )}
                  <Text style={styles.channelName} numberOfLines={2}>{ch.name}</Text>
                </TVFocusable>

                {/* Program blocks — horizontally scrollable, posicionados por horário real */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.programRow}>
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
                        <Text style={[styles.programTitle, isNow && styles.programTitleNow]} numberOfLines={1}>
                          {p.title}
                        </Text>
                        <Text style={styles.programTime}>
                          {fmtTime(p.start)} — {fmtTime(p.end)}
                        </Text>
                      </TVFocusable>
                    );
                  })}
                </ScrollView>
              </View>
            ))}
          </ScrollView>

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

  // Grid layout
  grid: {
    flex: 1,
    flexDirection: 'column',
  },
  cornerCell: {
    width: CHANNEL_COL,
    height: ROW_HEIGHT * 0.75,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    position: 'absolute',
    left: 0,
    top: 0,
    zIndex: 2,
    backgroundColor: colors.bg0,
  },
  hScroll: {
    marginLeft: CHANNEL_COL,
    height: ROW_HEIGHT * 0.75,
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
  rowsOuter: {
    flex: 1,
    marginTop: ROW_HEIGHT * 0.75,
  },
  epgRow: {
    flexDirection: 'row',
    height: ROW_HEIGHT,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  channelCell: {
    width: CHANNEL_COL,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    backgroundColor: colors.bg0,
    borderRightWidth: 1,
    borderRightColor: colors.border,
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

  programRow: {
    flex: 1,
  },
  programBlock: {
    height: ROW_HEIGHT - 1,
    justifyContent: 'center',
    paddingHorizontal: 10,
    backgroundColor: colors.bg1,
    borderRightWidth: 2,
    borderRightColor: colors.bg0,
  },
  programBlockNow: {
    backgroundColor: 'rgba(167,139,250,0.12)',
    borderLeftWidth: 2,
    borderLeftColor: colors.accent,
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
