import React, { useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import TVFocusable, { TVFocusableHandle } from './TVFocusable';
import { colors, fontFamily } from '../utils/theme';
import { sheet } from './playerSheetStyles';
import { useAccentColors } from '../hooks/useAccentColors';
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
  const ac = useAccentColors();

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

  const anyActive = selectedIndex === null || tracks.some(t => t.index === selectedIndex);

  return (
    <View style={sheet.root} pointerEvents="box-none">
      <Pressable
        style={StyleSheet.absoluteFillObject}
        onPress={onClose}
        {...({ focusable: false } as any)}
      />

      <View style={sheet.panel}>
        <Text style={sheet.title}>Legendas</Text>

        <FlatList
          data={data}
          keyExtractor={t => String(t.index)}
          style={sheet.list}
          contentContainerStyle={sheet.listInner}
          renderItem={({ item, index: listIndex }) => {
            const isOff  = item.index === -1;
            const active = isOff ? selectedIndex === null : item.index === selectedIndex;
            const isFirst = listIndex === 0;
            const isLast  = listIndex === data.length - 1;
            return (
              <TVFocusable
                ref={isFirst ? firstRef : undefined}
                onPress={() => { onSelect(isOff ? null : item.index); onClose(); }}
                style={sheet.row}
                focusScale={1}
                // Abre no item ATIVO (era sempre o 1º, "Desativado").
                hasTVPreferredFocus={active || (isFirst && !anyActive)}
                nextFocusUp={isFirst && closeTag ? closeTag : undefined}
                nextFocusDown={isLast && closeTag ? closeTag : undefined}
                nextFocusLeft={closeTag ?? undefined}
                nextFocusRight={closeTag ?? undefined}
              >
                <View style={sheet.rowText}>
                  <Text style={[sheet.rowTitle, active && sheet.rowTitleOn]}>{item.displayTitle}</Text>
                  {!isOff && item.isExternal && <Text style={sheet.rowSub}>Externa</Text>}
                </View>
                {active && <Ionicons name="checkmark" size={20} color={ac.accent} />}
              </TVFocusable>
            );
          }}
        />

        {/* Sincronia — só faz sentido com uma legenda ativa */}
        {selectedIndex !== null && onOffsetChange && (
          <>
            <Text style={sheet.section}>Sincronia</Text>
            <View style={styles.syncControls}>
              <TVFocusable accessibilityLabel="Atrasar legenda"
                onPress={() => onOffsetChange(offsetMs - OFFSET_STEP_MS)}
                style={styles.syncBtn}
                borderRadius={22}
                focusScale={1}
              >
                <Ionicons name="remove" size={20} color={colors.text1} />
              </TVFocusable>
              <Text style={styles.syncValue}>{formatOffset(offsetMs)}</Text>
              <TVFocusable accessibilityLabel="Adiantar legenda"
                onPress={() => onOffsetChange(offsetMs + OFFSET_STEP_MS)}
                style={styles.syncBtn}
                borderRadius={22}
                focusScale={1}
              >
                <Ionicons name="add" size={20} color={colors.text1} />
              </TVFocusable>
              {offsetMs !== 0 && (
                <TVFocusable onPress={() => onOffsetChange(0)} style={styles.syncReset} focusScale={1}>
                  <Text style={styles.syncResetText}>Zerar</Text>
                </TVFocusable>
              )}
            </View>
          </>
        )}

        <View style={sheet.footer}>
          <TVFocusable
            ref={closeRef}
            onPress={onClose}
            style={sheet.close}
            focusScale={1}
            nextFocusDown={firstTag ?? undefined}
          >
            <Text style={sheet.closeText}>Fechar</Text>
          </TVFocusable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  syncControls: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 26, paddingVertical: 6 },
  syncBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  syncValue: { fontSize: 17, fontFamily: fontFamily.semiBold, fontVariant: ['tabular-nums'], color: colors.text1, minWidth: 70, textAlign: 'center' },
  syncReset: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10 },
  syncResetText: { fontSize: 14, fontFamily: fontFamily.medium, color: colors.text2 },
});
