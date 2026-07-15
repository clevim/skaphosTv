/**
 * PairingSetupModal — "Configurar pelo celular".
 *
 * Sobe o pairingServer efêmero e mostra um QR com a URL local + token.
 * O usuário escaneia com o celular, preenche o formulário servido pela
 * própria TV e a fonte chega via onSource — o SetupScreen dispara o mesmo
 * fluxo de validação/carga da digitação manual.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Modal, ActivityIndicator } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Ionicons } from '@expo/vector-icons';
import TVFocusable from './TVFocusable';
import { colors, fontSize, radius, spacing, fontFamily, shadow } from '../utils/theme';
import { startPairingServer, PairingPayload, PairingServer } from '../utils/pairingServer';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Fonte recebida do celular — o chamador fecha o modal e inicia a carga. */
  onSource: (payload: PairingPayload) => void;
}

type Status = 'starting' | 'ready' | 'error' | 'expired';

export default function PairingSetupModal({ visible, onClose, onSource }: Props) {
  const [status, setStatus] = useState<Status>('starting');
  const [url, setUrl] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const serverRef = useRef<PairingServer | null>(null);
  // Evita aplicar resultados de um start antigo (abre/fecha rápido)
  const sessionRef = useRef(0);

  useEffect(() => {
    if (!visible) {
      serverRef.current?.stop();
      serverRef.current = null;
      return;
    }
    const session = ++sessionRef.current;
    setStatus('starting');
    setUrl('');

    startPairingServer({
      onSource: (payload) => {
        if (session === sessionRef.current) onSource(payload);
      },
      onTimeout: () => {
        if (session === sessionRef.current) setStatus('expired');
      },
    })
      .then(server => {
        if (session !== sessionRef.current) { server.stop(); return; }
        serverRef.current = server;
        setUrl(server.url);
        setStatus('ready');
      })
      .catch(e => {
        if (session !== sessionRef.current) return;
        setErrorMsg(e?.message ?? 'Não foi possível iniciar o pareamento');
        setStatus('error');
      });

    return () => {
      serverRef.current?.stop();
      serverRef.current = null;
    };
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.box}>
          <View style={styles.iconWrap}>
            <Ionicons name="phone-portrait-outline" size={22} color={colors.accent} />
          </View>
          <Text style={styles.title}>Configurar pelo celular</Text>

          {status === 'starting' && (
            <View style={styles.center}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.desc}>Preparando conexão local…</Text>
            </View>
          )}

          {status === 'ready' && (
            <>
              <Text style={styles.desc}>
                Aponte a câmera do celular para o código.{'\n'}
                O formulário abre no navegador — nada sai da sua rede Wi-Fi.
              </Text>
              <View style={styles.qrWrap}>
                <QRCode value={url} size={190} backgroundColor={colors.white} color={colors.black} />
              </View>
              <Text style={styles.url}>{url}</Text>
              <View style={styles.waitRow}>
                <ActivityIndicator size="small" color={colors.accent} />
                <Text style={styles.waitText}>Aguardando o celular…</Text>
              </View>
            </>
          )}

          {status === 'error' && (
            <Text style={[styles.desc, styles.errText]}>{errorMsg}</Text>
          )}

          {status === 'expired' && (
            <Text style={styles.desc}>
              O código expirou por inatividade.{'\n'}Feche e abra novamente para gerar outro.
            </Text>
          )}

          <TVFocusable onPress={onClose} style={styles.cancelBtn} hasTVPreferredFocus>
            <Text style={styles.cancelText}>{status === 'ready' ? 'Cancelar' : 'Fechar'}</Text>
          </TVFocusable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  box: {
    ...shadow.floating,
    width: 400,
    maxWidth: '90%',
    backgroundColor: colors.bg1,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: 'center',
  },
  iconWrap: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.accentSoft,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fontSize.lg,
    fontFamily: fontFamily.semiBold,
    color: colors.text1,
    marginBottom: spacing.sm,
  },
  center: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  desc: {
    fontSize: fontSize.sm,
    color: colors.text2,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: spacing.md,
  },
  errText: { color: colors.red },
  qrWrap: {
    backgroundColor: colors.white,
    padding: 12,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  url: {
    fontSize: fontSize.xs,
    color: colors.text3,
    marginBottom: spacing.md,
  },
  waitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: spacing.sm,
  },
  waitText: { fontSize: fontSize.sm, color: colors.accent },
  cancelBtn: {
    marginTop: spacing.sm,
    paddingHorizontal: 28,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.bg2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelText: { fontSize: fontSize.sm, color: colors.text1, fontWeight: '600' },
});
