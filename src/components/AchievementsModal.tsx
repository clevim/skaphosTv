// AchievementsModal.tsx — grade de badges (achievements.ts), mesmo padrão
// visual do WrappedModal.
import React from 'react';
import { View, Text, StyleSheet, Modal, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import TVFocusable from './TVFocusable';
import { colors, spacing, fontSize, radius, shadow, fontFamily } from '../utils/theme';
import { useAccentColors } from '../hooks/useAccentColors';
import { SkSectionHeader, SkChip } from './sk';
import { Achievement } from '../utils/achievements';

interface Props {
  visible: boolean;
  achievements: Achievement[];
  onClose: () => void;
}

export default function AchievementsModal({ visible, achievements, onClose }: Props) {
  const ac = useAccentColors();
  if (!visible) return null;
  const unlockedCount = achievements.filter(a => a.unlocked).length;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.box}>
          <View style={styles.head}><SkSectionHeader title="progresso" /></View>
          <Text style={styles.title}>Conquistas</Text>
          <SkChip
            label={`${unlockedCount}/${achievements.length} DESBLOQUEADAS`}
            variant={unlockedCount > 0 ? 'accent' : 'warn'}
            dot={false}
            style={styles.chip}
          />

          <ScrollView style={styles.list}>
            {achievements.map(a => (
              <View key={a.id} style={[styles.row, !a.unlocked && styles.rowLocked]}>
                <View style={[styles.iconWrap, a.unlocked && { borderColor: ac.accent, backgroundColor: ac.accentSoft }]}>
                  <Ionicons name={a.icon as any} size={18} color={a.unlocked ? ac.accent : colors.text3} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, a.unlocked && styles.labelUnlocked]}>{a.label}</Text>
                  <Text style={styles.description}>{a.description}</Text>
                </View>
                {a.unlocked && <Ionicons name="checkmark-circle" size={18} color={colors.green} />}
              </View>
            ))}
          </ScrollView>

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
    width: '100%', maxWidth: 460, maxHeight: '80%',
    backgroundColor: colors.bg1, borderRadius: radius.xl,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.xl, gap: spacing.sm, alignItems: 'center',
  },
  head: { alignSelf: 'stretch' },
  title: { fontSize: fontSize.lg, fontFamily: fontFamily.semiBold, color: colors.text1 },
  chip: { alignSelf: 'center', marginBottom: spacing.sm },
  list: { width: '100%' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.borderSoft,
  },
  rowLocked: { opacity: 0.8 }, // bloqueada: só atenua; contraste do texto segue AA
  iconWrap: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  label: { fontSize: fontSize.md, fontFamily: fontFamily.semiBold, color: colors.text2 },
  labelUnlocked: { color: colors.text1 },
  description: { fontSize: fontSize.xs, color: colors.text3, marginTop: 2 },
  closeBtn: {
    marginTop: spacing.sm, width: '100%', height: 48, borderRadius: radius.md,
    backgroundColor: colors.accent3, alignItems: 'center', justifyContent: 'center',
  },
  closeText: { fontSize: fontSize.md, fontFamily: fontFamily.semiBold, color: colors.white },
});
