// WrappedModal.tsx — resumo "Wrapped" do ano, calculado sob demanda a partir
// de usageStats + watchProgress (ver computeWrapped). Mesmo padrão visual dos
// outros modais do app (AppAlert/CategoryOverrideModal): overlay + box.
import React from 'react';
import { View, Text, StyleSheet, Modal } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import TVFocusable from './TVFocusable';
import { colors, spacing, fontSize, radius, shadow, fontFamily } from '../utils/theme';
import { useAccentColors } from '../hooks/useAccentColors';
import { SkSectionHeader, SkChip } from './sk';
import { formatWatchTime, WrappedSummary } from '../store/usageStats';

interface Props {
  visible: boolean;
  summary: WrappedSummary | null;
  onClose: () => void;
}

export default function WrappedModal({ visible, summary, onClose }: Props) {
  const ac = useAccentColors();
  if (!visible || !summary) return null;
  const hasData = summary.itemsWatched > 0 || summary.totalWatchSeconds > 0;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.box}>
          <View style={styles.head}><SkSectionHeader title={`wrapped ${summary.year}`} /></View>
          <View style={[styles.iconWrap, { backgroundColor: ac.accentSoft }]}>
            <Ionicons name="sparkles" size={24} color={ac.accent} />
          </View>
          <Text style={styles.title}>Seu {summary.year} no SkaphosTV</Text>

          {hasData ? (
            <View style={styles.stats}>
              <View style={styles.statRow}>
                <Text style={styles.statValue}>{formatWatchTime(summary.totalWatchSeconds)}</Text>
                <Text style={styles.statLabel}>assistidos ao todo</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statValue}>{summary.itemsWatched}</Text>
                <Text style={styles.statLabel}>título{summary.itemsWatched !== 1 ? 's' : ''} concluído{summary.itemsWatched !== 1 ? 's' : ''} em {summary.year}</Text>
              </View>
              {summary.topGenre && (
                <View style={styles.statRow}>
                  <Text style={styles.statValue}>{summary.topGenre}</Text>
                  <Text style={styles.statLabel}>seu gênero favorito</Text>
                </View>
              )}
              {summary.topChannel && (
                <View style={styles.statRow}>
                  <Text style={styles.statValue} numberOfLines={1}>{summary.topChannel.name}</Text>
                  <Text style={styles.statLabel}>mais assistido ({summary.topChannel.count}x)</Text>
                </View>
              )}
            </View>
          ) : (
            <Text style={styles.emptyText}>
              Ainda sem dados em {summary.year}. Assista um pouco mais e volte aqui.
            </Text>
          )}

          <TVFocusable onPress={onClose} style={[styles.closeBtn, { backgroundColor: ac.accent3 }]} hasTVPreferredFocus>
            <Text style={styles.closeText}>Fechar</Text>
          </TVFocusable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: colors.overlay,
    alignItems: 'center', justifyContent: 'center', padding: spacing.xl,
  },
  box: {
    ...shadow.floating,
    width: '100%', maxWidth: 460,
    backgroundColor: colors.bg1, borderRadius: radius.xl,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.xl, gap: spacing.md, alignItems: 'center',
  },
  head: { alignSelf: 'stretch' },
  iconWrap: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: fontSize.lg, fontFamily: fontFamily.semiBold, color: colors.text1, textAlign: 'center' },
  stats: { width: '100%', gap: spacing.md, marginTop: spacing.sm },
  statRow: {
    width: '100%', alignItems: 'center', gap: 2,
    paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.borderSoft,
  },
  statValue: { fontSize: fontSize.xxl, fontFamily: fontFamily.bold, color: colors.text1 },
  statLabel: { fontSize: fontSize.xs, fontFamily: fontFamily.medium, fontVariant: ['tabular-nums'], color: colors.text3, textTransform: 'uppercase', letterSpacing: 0.6 },
  emptyText: { fontSize: fontSize.sm, fontFamily: fontFamily.regular, color: colors.text2, lineHeight: 20, textAlign: 'center', marginTop: spacing.sm },
  closeBtn: {
    marginTop: spacing.sm, width: '100%', height: 48, borderRadius: radius.md,
    backgroundColor: colors.accent3, alignItems: 'center', justifyContent: 'center',
  },
  closeText: { fontSize: fontSize.md, fontFamily: fontFamily.semiBold, color: colors.white },
});
