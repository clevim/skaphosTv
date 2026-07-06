/**
 * DebugOverlay — badge flutuante que expande num painel com os logs de
 * `dlog()` (debugLog.ts). Só monta no APK de dev (IS_DEV_BUILD) — não existe
 * no build normal que vai pro usuário final.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import TVFocusable from './TVFocusable';
import { useDebugLogStore, clearDebugLog, IS_DEV_BUILD } from '../utils/debugLog';
import { colors, spacing, fontSize, radius } from '../utils/theme';

export default function DebugOverlay() {
  const [expanded, setExpanded] = useState(false);
  const lines = useDebugLogStore(s => s.lines);

  if (!IS_DEV_BUILD) return null;

  if (!expanded) {
    return (
      <TVFocusable onPress={() => setExpanded(true)} style={styles.badge}>
        <Text style={styles.badgeText}>LOG ({lines.length})</Text>
      </TVFocusable>
    );
  }

  return (
    <View style={styles.panel}>
      <View style={styles.actions}>
        <TVFocusable onPress={clearDebugLog} style={styles.actionBtn}>
          <Text style={styles.actionText}>Limpar</Text>
        </TVFocusable>
        <TVFocusable onPress={() => setExpanded(false)} style={styles.actionBtn} hasTVPreferredFocus>
          <Text style={styles.actionText}>Fechar</Text>
        </TVFocusable>
      </View>
      <ScrollView style={styles.scroll}>
        {lines.length === 0 ? (
          <Text style={styles.line}>(sem logs ainda)</Text>
        ) : (
          lines.map((l, i) => <Text key={i} style={styles.line} selectable>{l}</Text>)
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: colors.bg1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    zIndex: 9999,
  },
  badgeText: { fontSize: 11, color: colors.text2, fontWeight: '600' },
  panel: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.92)',
    padding: spacing.md,
    zIndex: 9999,
  },
  actions: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  actionBtn: {
    backgroundColor: colors.bg2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  actionText: { fontSize: fontSize.sm, color: colors.text1, fontWeight: '600' },
  scroll: { flex: 1 },
  line: { fontSize: 11, color: colors.text2, fontFamily: 'monospace', marginBottom: 2 },
});
