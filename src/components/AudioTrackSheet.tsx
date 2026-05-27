/**
 * AudioTrackSheet — Modal de seleção de faixa de áudio durante a reprodução Jellyfin.
 * Ao trocar a faixa, o player recarrega o vídeo na posição atual com o novo audioStreamIndex.
 */
import React from 'react';
import { Modal, View, Text, StyleSheet, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import TVFocusable from './TVFocusable';
import { colors, radius, fontFamily } from '../utils/theme';
import { JellyfinAudioTrack } from '../utils/jellyfinLoader';

interface Props {
  visible: boolean;
  tracks: JellyfinAudioTrack[];
  selectedIndex: number | null;
  onSelect: (streamIndex: number) => void;
  onClose: () => void;
}

export default function AudioTrackSheet({ visible, tracks, selectedIndex, onSelect, onClose }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
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
              const active = item.index === selectedIndex;
              return (
                <TVFocusable
                  onPress={() => { onSelect(item.index); onClose(); }}
                  style={[styles.row, active && styles.rowActive]}
                                    hasTVPreferredFocus={listIndex === 0}
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
            <TVFocusable onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>Fechar</Text>
            </TVFocusable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
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
