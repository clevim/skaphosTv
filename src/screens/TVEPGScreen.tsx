// TVEPGScreen.tsx — TV Electronic Program Guide
// Shows channel rows × time columns. EPG data is placeholder (no XMLTV source yet).
import React, { useRef, useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Image,
  TouchableOpacity, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store/useStore';
import TVFocusable from '../components/TVFocusable';
import { colors, spacing, fontSize, radius } from '../utils/theme';
import { RootStackParamList, Channel } from '../types';
import { detectType } from '../utils/channelUtils';

type Nav = StackNavigationProp<RootStackParamList>;

const SLOT_WIDTH = 180;   // px per 30-min slot
const CHANNEL_COL = 200; // px for left channel column
const ROW_HEIGHT = 60;
const SLOTS_VISIBLE = 6;  // 3 hours visible at once

/** Generate time labels starting from the previous even hour */
function buildTimeSlots(count = 12): string[] {
  const now = new Date();
  const start = new Date(now);
  start.setMinutes(now.getMinutes() < 30 ? 0 : 30, 0, 0);
  // Go back 1 slot to show "what's on now" on-screen
  start.setMinutes(start.getMinutes() - 30);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(start.getTime() + i * 30 * 60 * 1000);
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  });
}

/** Deterministic program title from channel name + slot index */
function fakeProgramTitle(ch: Channel, slotIdx: number): string {
  const hash = (ch.id.charCodeAt(0) + slotIdx * 7) % 5;
  const suffixes = ['ao vivo', 'especial', 'notícias', 'esportes', 'entretenimento'];
  const clean = ch.name.split(' ').slice(0, 2).join(' ');
  return slotIdx === 1 ? `${clean} ao vivo` : `${clean} — ${suffixes[hash]}`;
}

/** Width in slots for a fake program block (1 or 2 slots = 30 or 60 min) */
function programSpan(ch: Channel, slotIdx: number): number {
  return ((ch.id.charCodeAt(0) + slotIdx * 3) % 2) + 1;
}

export default function TVEPGScreen() {
  const navigation = useNavigation<Nav>();
  const { channels, setCurrentChannel } = useStore();
  const timeSlots = useMemo(() => buildTimeSlots(14), []);
  const [nowOffset, setNowOffset] = useState(1); // slot index for "now" indicator

  // Only live channels for EPG
  const liveChannels = useMemo(
    () => channels.filter(c => detectType(c.group || '', c.name) === 'live').slice(0, 40),
    [channels]
  );

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
                    <Image source={{ uri: ch.logo }} style={styles.channelLogo} resizeMode="contain" />
                  ) : (
                    <View style={styles.channelLogoPlaceholder}>
                      <Text style={styles.channelLogoText}>{ch.name.slice(0, 2).toUpperCase()}</Text>
                    </View>
                  )}
                  <Text style={styles.channelName} numberOfLines={2}>{ch.name}</Text>
                </TVFocusable>

                {/* Program blocks — horizontally scrollable */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.programRow}>
                  {(() => {
                    const blocks: JSX.Element[] = [];
                    let slotIdx = 0;
                    while (slotIdx < timeSlots.length) {
                      const span = programSpan(ch, slotIdx);
                      const isNow = slotIdx <= nowOffset && nowOffset < slotIdx + span;
                      blocks.push(
                        <TVFocusable
                          key={slotIdx}
                          onPress={() => handlePlay(ch)}
                          style={[
                            styles.programBlock,
                            { width: SLOT_WIDTH * span - 2 },
                            isNow && styles.programBlockNow,
                          ]}
                        >
                          <Text style={[styles.programTitle, isNow && styles.programTitleNow]} numberOfLines={1}>
                            {fakeProgramTitle(ch, slotIdx)}
                          </Text>
                          <Text style={styles.programTime}>
                            {timeSlots[slotIdx]}{span > 1 && timeSlots[slotIdx + 1] ? ` — ${timeSlots[slotIdx + 1]}` : ''}
                          </Text>
                        </TVFocusable>
                      );
                      slotIdx += span;
                    }
                    return blocks;
                  })()}
                </ScrollView>
              </View>
            ))}
          </ScrollView>
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
