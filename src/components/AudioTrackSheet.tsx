import React, { useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import TVFocusable, { TVFocusableHandle } from './TVFocusable';
import { colors, radius, fontFamily } from '../utils/theme';
import { JellyfinAudioTrack } from '../utils/jellyfinLoader';
import { IS_TV } from '../utils/tvDetect';

interface Props {
  visible: boolean;
  tracks: JellyfinAudioTrack[];
  selectedIndex: number | null;
  onSelect: (streamIndex: number) => void;
  onClose: () => void;
}

export default function AudioTrackSheet({ visible, tracks, selectedIndex, onSelect, onClose }: Props) {
  // Refs para os elementos de borda do sheet — usados para focus trapping via nextFocus*.
  const closeRef = useRef<TVFocusableHandle | null>(null);
  const firstRef = useRef<TVFocusableHandle | null>(null);
  const [closeTag, setCloseTag] = useState<number | null>(null);
  const [firstTag, setFirstTag] = useState<number | null>(null);

  // Captura IDs nativos após o sheet aparecer e o FlatList renderizar o primeiro item.
  useEffect(() => {
    if (!visible || !IS_TV) return;
    const t = setTimeout(() => {
      setCloseTag(closeRef.current?.getTag() ?? null);
      setFirstTag(firstRef.current?.getTag() ?? null);
    }, 150);
    return () => clearTimeout(t);
  }, [visible]);

  if (!visible) return null;

  return (
    <View style={styles.root} pointerEvents="box-none">
      {/* Backdrop — clicável para fechar, não focável pelo D-pad */}
      <Pressable
        style={StyleSheet.absoluteFillObject}
        onPress={onClose}
        {...({ focusable: false } as any)}
      />

      <View style={styles.sheet}>
        <View style={styles.header}>
          <Ionicons name="musical-notes-outline" size={18} color={colors.accent} />
          <Text style={styles.title}>Faixa de áudio</Text>
        </View>

        <FlatList
          data={tracks}
          keyExtractor={t => String(t.index)}
          style={styles.list}
          renderItem={({ item, index: listIndex }) => {
            const active  = item.index === selectedIndex;
            const isFirst = listIndex === 0;
            return (
              <TVFocusable
                ref={isFirst ? firstRef : undefined}
                onPress={() => { onSelect(item.index); onClose(); }}
                style={[styles.row, active && styles.rowActive]}
                focusScale={1}
                borderRadius={6}
                hasTVPreferredFocus={isFirst}
                // Trap: UP do primeiro item → botão Fechar (loop); L/R → Fechar
                nextFocusUp={isFirst && closeTag ? closeTag : undefined}
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
                  {item.isDefault && (
                    <Text style={styles.sub}>Padrão</Text>
                  )}
                </View>
              </TVFocusable>
            );
          }}
        />

        <View style={styles.actions}>
          <TVFocusable
            ref={closeRef}
            onPress={onClose}
            style={styles.closeBtn}
            // Trap: DOWN do botão → primeiro item da lista (loop)
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
    width: 340,
    maxHeight: 440,
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
  list: { maxHeight: 320 },
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
  actions: { padding: 14, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  closeBtn: {
    height: 40, borderRadius: radius.md,
    backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  closeText: { fontSize: 13, fontWeight: '500', color: colors.text2 },
});
