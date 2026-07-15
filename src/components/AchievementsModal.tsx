// AchievementsModal.tsx — grade de badges (achievements.ts), mesmo padrão
// visual do WrappedModal.
import React from 'react';
import { View, Text, StyleSheet, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import TVFocusable from './TVFocusable';
import { colors, spacing, fontSize, radius, shadow } from '../utils/theme';
import { Achievement } from '../utils/achievements';

interface Props {
  visible: boolean;
  achievements: Achievement[];
  onClose: () => void;
}

export default function AchievementsModal({ visible, achievements, onClose }: Props) {
  if (!visible) return null;
  const unlockedCount = achievements.filter(a => a.unlocked).length;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.box}>
          <Ionicons name="trophy" size={28} color={colors.accent} />
          <Text style={styles.title}>Conquistas</Text>
          <Text style={styles.subtitle}>{unlockedCount} de {achievements.length} desbloqueadas</Text>

          <ScrollView style={styles.list}>
            {achievements.map(a => (
              <View key={a.id} style={[styles.row, !a.unlocked && styles.rowLocked]}>
                <View style={[styles.iconWrap, a.unlocked && styles.iconWrapUnlocked]}>
                  <Ionicons name={a.icon as any} size={18} color={a.unlocked ? colors.accent : colors.text3} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, a.unlocked && styles.labelUnlocked]}>{a.label}</Text>
                  <Text style={styles.description}>{a.description}</Text>
                </View>
                {a.unlocked && <Ionicons name="checkmark-circle" size={18} color={colors.green} />}
              </View>
            ))}
          </ScrollView>

          <TVFocusable onPress={onClose} style={styles.closeBtn} hasTVPreferredFocus>
            <Text style={styles.closeText}>Fechar</Text>
          </TVFocusable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center', justifyContent: 'center', padding: spacing.xl,
  },
  box: {
    ...shadow.floating,
    width: '100%', maxWidth: 420, maxHeight: '80%',
    backgroundColor: colors.bg1, borderRadius: radius.xl,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.xl, gap: spacing.sm, alignItems: 'center',
  },
  title: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text1 },
  subtitle: { fontSize: 12, color: colors.text3, marginBottom: spacing.sm },
  list: { width: '100%' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.borderSoft,
  },
  rowLocked: { opacity: 0.5 },
  iconWrap: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  iconWrapUnlocked: { borderColor: colors.accent, backgroundColor: 'rgba(167,139,250,0.12)' },
  label: { fontSize: 14, fontWeight: '600', color: colors.text2 },
  labelUnlocked: { color: colors.text1 },
  description: { fontSize: 11, color: colors.text3, marginTop: 1 },
  closeBtn: {
    marginTop: spacing.sm, width: '100%', height: 44, borderRadius: radius.md,
    backgroundColor: colors.accent3, alignItems: 'center', justifyContent: 'center',
  },
  closeText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.white },
});
