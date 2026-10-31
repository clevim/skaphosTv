// RemoteHints.tsx — TV remote button hints (faixa fixa no rodapé)
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../utils/theme';
import { IS_NATIVE_TV } from '../utils/tvDetect';

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
  { key: '←', label: 'Voltar' },
];

export default function RemoteHints({ hints = DEFAULT_HINTS }: Props) {
  // Só em TV física — no web o usuário usa mouse/teclado, dicas de controle não se aplicam
  if (!IS_NATIVE_TV) return null;
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

export const REMOTE_HINTS_HEIGHT = 36; // reserve esta altura no rodapé do conteúdo

const styles = StyleSheet.create({
  // Faixa fixa, sólida, de borda a borda: nunca fica translúcida sobre cards/títulos.
  container: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    height: REMOTE_HINTS_HEIGHT,
    zIndex: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 24,
    paddingHorizontal: 48,
    backgroundColor: colors.bg0,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  keyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.text3,
    backgroundColor: colors.bg1,
  },
  keyText: {
    fontSize: 12,
    color: colors.text1,
    fontWeight: '600',
  },
  label: {
    fontSize: 13,
    color: colors.text2,
    letterSpacing: 0.2,
  },
});
