/**
 * PairingSetupModal — "Sincronizar dispositivos".
 *
 * Passo 1: escolher o escopo — só a fonte, fonte + favoritos, ou fonte +
 * favoritos + assistidos. Passo 2: sobe o pairingServer efêmero e mostra um
 * QR com a URL local + token + escopo. No celular, o app lê o QR (Adicionar
 * fonte → Sincronizar dispositivos) e envia respeitando o escopo pedido;
 * a câmera do sistema também funciona e cai no formulário do navegador
 * (que envia só a fonte). A fonte chega via onSource — o SetupScreen dispara
 * o mesmo fluxo de validação/carga da digitação manual.
 *
 * Web: o navegador não abre porta local (TCP), então aqui só explicamos a
 * limitação e apontamos para Exportar/Importar nos Ajustes.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Modal, ActivityIndicator } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Ionicons } from '@expo/vector-icons';
import TVFocusable from './TVFocusable';
import { colors, fontSize, radius, spacing, fontFamily, shadow } from '../utils/theme';
import { IS_WEB } from '../utils/tvDetect';
import { startPairingServer, PairingPayload, PairingServer } from '../utils/pairingServer';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Fonte recebida do celular — o chamador fecha o modal e inicia a carga. */
  onSource: (payload: PairingPayload) => void;
}

type Scope = 'src' | 'fav' | 'all';
type Status = 'choose' | 'starting' | 'ready' | 'error' | 'expired';

const SCOPE_OPTIONS: { key: Scope; icon: string; label: string; desc: string }[] = [
  { key: 'src', icon: 'tv-outline',             label: 'Só a fonte',                     desc: 'Credenciais e lista de canais' },
  { key: 'fav', icon: 'star-outline',           label: 'Fonte + favoritos',              desc: 'Inclui seus canais favoritos' },
  { key: 'all', icon: 'checkmark-done-outline', label: 'Fonte + favoritos + assistidos', desc: 'Inclui também o progresso de assistidos' },
];

export default function PairingSetupModal({ visible, onClose, onSource }: Props) {
  const [scope, setScope] = useState<Scope | null>(null);
  const [status, setStatus] = useState<Status>('choose');
  const [url, setUrl] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const serverRef = useRef<PairingServer | null>(null);
  // Evita aplicar resultados de um start antigo (abre/fecha rápido)
  const sessionRef = useRef(0);

  useEffect(() => {
    if (!visible || !scope) {
      serverRef.current?.stop();
      serverRef.current = null;
      if (!visible) { setScope(null); setStatus('choose'); }
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
  }, [visible, scope]); // eslint-disable-line react-hooks/exhaustive-deps

  // QR carrega o escopo — o app do celular envia só o que a TV/painel pediu
  const qrValue = scope ? `${url}&s=${scope}` : url;
  // Web aberto via localhost: o QR apontaria pra um endereço que o celular
  // não alcança — avisa pra abrir o painel pelo IP da rede.
  const isLocalhostUrl = IS_WEB && /\/\/(localhost|127\.0\.0\.1)/.test(url);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.box}>
          <View style={styles.iconWrap}>
            <Ionicons name="qr-code-outline" size={22} color={colors.accent} />
          </View>
          <Text style={styles.title}>Sincronizar dispositivos</Text>

          {(
            <>
              {status === 'choose' && (
                <>
                  <Text style={styles.desc}>O que você quer receber do celular?</Text>
                  <View style={styles.scopeList}>
                    {SCOPE_OPTIONS.map((opt, i) => (
                      <TVFocusable
                        key={opt.key}
                        onPress={() => setScope(opt.key)}
                        style={styles.scopeRow}
                        hasTVPreferredFocus={i === 0}
                        borderRadius={radius.md}
                      >
                        <View style={styles.scopeIcon}>
                          <Ionicons name={opt.icon as any} size={17} color={colors.accent} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.scopeLabel}>{opt.label}</Text>
                          <Text style={styles.scopeDesc}>{opt.desc}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={14} color={colors.text3} />
                      </TVFocusable>
                    ))}
                  </View>
                </>
              )}

              {status === 'starting' && (
                <View style={styles.center}>
                  <ActivityIndicator color={colors.accent} />
                  <Text style={styles.desc}>Preparando conexão local…</Text>
                </View>
              )}

              {status === 'ready' && (
                <>
                  <Text style={styles.desc}>
                    No app do celular: <Text style={styles.bold}>Adicionar fonte → Sincronizar dispositivos</Text>.{'\n'}
                    A câmera do sistema também funciona — abre um formulário no navegador.{'\n'}
                    Nada sai da sua rede Wi-Fi.
                  </Text>
                  <View style={styles.qrWrap}>
                    <QRCode value={qrValue} size={190} backgroundColor={colors.white} color={colors.black} />
                  </View>
                  <Text style={styles.url}>{url}</Text>
                  {isLocalhostUrl && (
                    <Text style={[styles.desc, styles.warnText]}>
                      Você abriu o painel via localhost — o celular não alcança este endereço.{'\n'}
                      Abra pelo IP da rede (ex.: http://192.168.0.10:8080) e gere o QR de novo.
                    </Text>
                  )}
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
            </>
          )}

          <TVFocusable onPress={onClose} style={styles.cancelBtn}>
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
    width: 420,
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
  bold: { color: colors.text1, fontWeight: '600' },
  errText: { color: colors.red },
  warnText: { color: colors.yellow },

  scopeList: { alignSelf: 'stretch', gap: 8, marginBottom: spacing.md },
  scopeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.bg2,
    borderRadius: radius.md,
    paddingVertical: 12, paddingHorizontal: 14,
  },
  scopeIcon: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: colors.accentSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  scopeLabel: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text1 },
  scopeDesc: { fontSize: fontSize.xs, color: colors.text3, marginTop: 2 },

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
