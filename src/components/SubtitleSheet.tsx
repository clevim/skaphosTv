import React, { useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import TVFocusable, { TVFocusableHandle } from './TVFocusable';
import { colors, radius, fontFamily, shadow } from '../utils/theme';
import { JellyfinSubtitleTrack } from '../utils/jellyfinLoader';
import { IS_TV } from '../utils/tvDetect';

interface Props {
  visible: boolean;
  tracks: JellyfinSubtitleTrack[];
  selectedIndex: number | null;
  onSelect: (index: number | null) => void;
  onClose: () => void;
  /** Sincronia da legenda ativa em ms (positivo adianta, negativo atrasa). */
  offsetMs?: number;
  onOffsetChange?: (ms: number) => void;
}

const OFFSET_STEP_MS = 250;

function formatOffset(ms: number): string {
  const s = (ms / 1000).toFixed(2).replace(/0$/, '').replace(/\.$/, '.0');
  return `${ms > 0 ? '+' : ''}${s}s`;
}

export default function SubtitleSheet({
  visible, tracks, selectedIndex, onSelect, onClose, offsetMs = 0, onOffsetChange,
}: Props) {
  const { width, height } = useWindowDimensions();
  const sheetWidth  = Math.min(340, width  - 40);
  const sheetHeight = Math.min(440, height - 80);
  const listHeight  = sheetHeight - 120;

  const closeRef = useRef<TVFocusableHandle | null>(null);
  const firstRef = useRef<TVFocusableHandle | null>(null);
  const [closeTag, setCloseTag] = useState<number | null>(null);
  const [firstTag, setFirstTag] = useState<number | null>(null);

  useEffect(() => {
    if (!visible || !IS_TV) return;
    const t = setTimeout(() => {
      setCloseTag(closeRef.current?.getTag() ?? null);
      setFirstTag(firstRef.current?.getTag() ?? null);
    }, 150);
    return () => clearTimeout(t);
  }, [visible]);

  if (!visible) return null;

  const data: JellyfinSubtitleTrack[] = [
    { index: -1, displayTitle: 'Desativado', language: '', isExternal: false, vttUrl: '' },
    ...tracks,
  ];

  return (
    <View style={styles.root} pointerEvents="box-none">
      <Pressable
        style={StyleSheet.absoluteFillObject}
        onPress={onClose}
        {...({ focusable: false } as any)}
      />

      <View style={[styles.sheet, { width: sheetWidth, maxHeight: sheetHeight }]}>
        <View style={styles.header}>
          <Ionicons name="chatbox-ellipses-outline" size={18} color={colors.accent} />
          <Text style={styles.title}>Legendas</Text>
        </View>

        <FlatList
          data={data}
          keyExtractor={t => String(t.index)}
          style={{ maxHeight: listHeight }}
          renderItem={({ item, index: listIndex }) => {
            const isOff  = item.index === -1;
            const active = isOff ? selectedIndex === null : item.index === selectedIndex;
            const isFirst = listIndex === 0;
            const isLast  = listIndex === data.length - 1;
            return (
              <TVFocusable
                ref={isFirst ? firstRef : undefined}
                onPress={() => { onSelect(isOff ? null : item.index); onClose(); }}
                style={[styles.row, active && styles.rowActive]}
                focusScale={1}
                borderRadius={6}
                hasTVPreferredFocus={isFirst}
                nextFocusUp={isFirst && closeTag ? closeTag : undefined}
                nextFocusDown={isLast && closeTag ? closeTag : undefined}
                nextFocusLeft={closeTag ?? undefined}
                nextFocusRight={closeTag ?? undefined}
              >
                <View style={[styles.radio, active && styles.radioActive]}>
                  {active && <View style={styles.radioDot} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.trackTitle, active && styles.trackTitleActive]}>
                    {item.displayTitle}
                  </Text>
                  {!isOff && item.isExternal && (
                    <Text style={styles.sub}>Externo</Text>
                  )}
                </View>
              </TVFocusable>
            );
          }}
        />

        {/* Sincronia — só faz sentido com uma legenda ativa */}
        {selectedIndex !== null && onOffsetChange && (
          <View style={styles.syncRow}>
            <Text style={styles.syncLabel}>Sincronia</Text>
            <View style={styles.syncControls}>
              <TVFocusable accessibilityLabel="Atrasar legenda"
                onPress={() => onOffsetChange(offsetMs - OFFSET_STEP_MS)}
                style={styles.syncBtn}
                borderRadius={16}
              >
                <Ionicons name="remove" size={16} color={colors.white} />
              </TVFocusable>
              <Text style={styles.syncValue}>{formatOffset(offsetMs)}</Text>
              <TVFocusable accessibilityLabel="Adiantar legenda"
                onPress={() => onOffsetChange(offsetMs + OFFSET_STEP_MS)}
                style={styles.syncBtn}
                borderRadius={16}
              >
                <Ionicons name="add" size={16} color={colors.white} />
              </TVFocusable>
              {offsetMs !== 0 && (
                <TVFocusable onPress={() => onOffsetChange(0)} style={styles.syncReset} borderRadius={6}>
                  <Text style={styles.syncResetText}>Zerar</Text>
                </TVFocusable>
              )}
            </View>
          </View>
        )}

        <View style={styles.actions}>
          <TVFocusable
            ref={closeRef}
            onPress={onClose}
            style={styles.closeBtn}
            nextFocusDown={firstTag ?? undefined}
          >
            <Text style={styles.closeText}>Fechar</Text>
          </TVFocusable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  sheet: {
    ...shadow.floating,
    backgroundColor: colors.bg1,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  title: { fontSize: 15, fontFamily: fontFamily.semiBold, color: colors.text1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  rowActive: { backgroundColor: colors.accentSoft },
  radio: {
    width: 18, height: 18, borderRadius: 9,
    borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  radioActive: { borderColor: colors.accent },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  trackTitle: { fontSize: 13, fontWeight: '500', color: colors.text2 },
  trackTitleActive: { color: colors.text1, fontWeight: '600' },
  sub: { fontSize: 10, color: colors.text3, marginTop: 2 },
  syncRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderTopWidth: 1, borderTopColor: colors.borderSoft,
  },
  syncLabel: { fontSize: 13, fontWeight: '500', color: colors.text2 },
  syncControls: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  syncBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  syncValue: { fontSize: 13, fontWeight: '600', color: colors.text1, minWidth: 48, textAlign: 'center' },
  syncReset: {
    paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.border,
  },
  syncResetText: { fontSize: 11, fontWeight: '500', color: colors.text2 },
  actions: { padding: 14, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  closeBtn: {
    height: 40, borderRadius: radius.md,
    backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  closeText: { fontSize: 13, fontWeight: '500', color: colors.text2 },
});
