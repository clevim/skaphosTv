/**
 * AppAlert — substituto temático do Alert.alert() nativo.
 *
 * O Alert.alert do RN abre o diálogo do SISTEMA (cinza/branco no Android),
 * quebrando o visual escuro do app e sem foco de D-pad garantido na TV.
 * `showAlert(title, message?, buttons?)` tem a MESMA assinatura do
 * Alert.alert — troca direta nos call sites — mas renderiza um modal próprio,
 * com os componentes do app (TVFocusable) e a paleta de theme.ts.
 *
 * <AppAlertHost /> é montado uma vez no root (App.tsx), como o MiniPlayer.
 */
import React from 'react';
import { View, Text, StyleSheet, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { create } from 'zustand';
import TVFocusable from './TVFocusable';
import { colors, spacing, fontSize, radius } from '../utils/theme';

export interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

interface AlertState {
  visible: boolean;
  title: string;
  message?: string;
  buttons: AlertButton[];
}

const useAlertStore = create<AlertState>(() => ({
  visible: false,
  title: '',
  message: undefined,
  buttons: [],
}));

/** Substituto de Alert.alert(title, message?, buttons?) — mesma assinatura. */
export function showAlert(title: string, message?: string, buttons?: AlertButton[]): void {
  useAlertStore.setState({
    visible: true,
    title,
    message,
    buttons: buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }],
  });
}

function hide() {
  useAlertStore.setState({ visible: false });
}

export default function AppAlertHost() {
  const { visible, title, message, buttons } = useAlertStore();
  if (!visible) return null;

  const hasDestructive = buttons.some(b => b.style === 'destructive');
  const cancelIndex = buttons.findIndex(b => b.style === 'cancel');
  // Foco padrão: se há ação destrutiva, o Cancelar ganha foco (evita apagar/instalar
  // sem querer no D-pad); senão, o ÚLTIMO botão (ação principal) — igual ao resto do app.
  const preferredIndex = hasDestructive && cancelIndex >= 0 ? cancelIndex : buttons.length - 1;

  const press = (btn: AlertButton) => {
    hide();
    btn.onPress?.();
  };

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={() => press(buttons[cancelIndex >= 0 ? cancelIndex : buttons.length - 1])}
    >
      <View style={styles.overlay}>
        <View style={styles.box}>
          <Text style={styles.title}>{title}</Text>
          {!!message && <Text style={styles.message}>{message}</Text>}
          <View style={[styles.actions, buttons.length > 2 && styles.actionsColumn]}>
            {buttons.map((btn, i) => {
              const variant =
                btn.style === 'destructive' ? styles.btnDestructive
                : btn.style === 'cancel'      ? styles.btnCancel
                : styles.btnDefault;
              const textVariant =
                btn.style === 'destructive' ? styles.btnDestructiveText
                : btn.style === 'cancel'      ? styles.btnCancelText
                : styles.btnDefaultText;
              return (
                <TVFocusable
                  key={i}
                  onPress={() => press(btn)}
                  style={[styles.btn, variant]}
                  hasTVPreferredFocus={i === preferredIndex}
                >
                  <Text style={textVariant} numberOfLines={1}>{btn.text}</Text>
                </TVFocusable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  box: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.bg1,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.md,
  },
  title: { fontSize: fontSize.lg, fontWeight: '600', color: colors.text1 },
  message: { fontSize: 13.5, color: colors.text2, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  actionsColumn: { flexDirection: 'column-reverse' },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  btnDefault: { backgroundColor: colors.accent3 },
  btnDefaultText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.white },
  btnCancel: { backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.border },
  btnCancelText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text2 },
  btnDestructive: { backgroundColor: colors.red },
  btnDestructiveText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.white },
});
