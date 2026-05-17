// RemoteHints.tsx — TV remote button hints (bottom-right corner)
import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { colors } from '../utils/theme';
import { IS_TV } from '../utils/tvDetect';

interface Hint {
  key: string;
  label: string;
}

interface Props {
  hints?: Hint[];
}

const DEFAULT_HINTS: Hint[] = [
  { key: 'OK', label: 'Selecionar' },
  { key: '↑↓←→', label: 'Navegar' },
  { key: '⬅', label: 'Voltar' },
];

export default function RemoteHints({ hints = DEFAULT_HINTS }: Props) {
  if (!Platform.isTV) return null;
  return (
    <View style={styles.container} pointerEvents="none">
      {hints.map((h, i) => (
        <View key={i} style={styles.hint}>
          <View style={styles.keyBadge}>
            <Text style={styles.keyText}>{h.key}</Text>
          </View>
          <Text style={styles.label}>{h.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 18,
    right: 48,
    flexDirection: 'row',
    gap: 18,
  },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  keyBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(20,17,28,0.5)',
  },
  keyText: {
    fontSize: 9,
    color: colors.text2,
    fontWeight: '500',
  },
  label: {
    fontSize: 11,
    color: colors.text3,
    letterSpacing: 0.3,
  },
});
