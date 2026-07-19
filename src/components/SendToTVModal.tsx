/**
 * SendToTVModal — "Enviar para uma TV".
 *
 * O inverso do PairingSetupModal: aqui o CELULAR é quem age. Abre a câmera
 * dentro do app, lê o QR que a TV está exibindo (URL do pairingServer local
 * + token de uso único) e envia uma das fontes já configuradas neste
 * aparelho via POST /api/source — sem digitar nada na TV.
 *
 * expo-camera é carregado com require dinâmico: em APKs antigos atualizados
 * só via OTA o módulo nativo não existe, e o import estático derrubaria a
 * tela inteira. Nesses casos mostramos "atualize o app".
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Modal, ActivityIndicator, Pressable, Vibration, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { colors, fontSize, radius, spacing, shadow } from '../utils/theme';
import { useStore, IPTVSource } from '../store/useStore';
import { useWatchProgress } from '../store/watchProgress';
import type { PairingPayload, PairingExtras } from '../utils/pairingServer';

// ── expo-camera opcional (ver comentário no topo) ───────────────────────────
let CameraModule: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  CameraModule = require('expo-camera');
} catch {
  CameraModule = null;
}

type Step =
  | 'unsupported'   // binário sem o módulo nativo da câmera
  | 'no-sources'    // nenhuma fonte Xtream/M3U pra enviar
  | 'requesting'    // pedindo permissão de câmera
  | 'denied'        // permissão negada
  | 'scan'          // câmera aberta lendo QR
  | 'pick'          // QR lido — escolher qual fonte enviar
  | 'sending'
  | 'done'
  | 'error';

type Scope = 'src' | 'fav' | 'all';

interface Target { origin: string; token: string; scope: Scope }

const SCOPE_LABEL: Record<Scope, string> = {
  src: 'A TV pediu só a fonte.',
  fav: 'A TV pediu a fonte + favoritos.',
  all: 'A TV pediu fonte + favoritos + progresso de assistidos.',
};

/** Extrai origin+token+escopo do QR — aceita o formato da TV
 *  (http://192.168.x.x:4xxxx/?t=abc123&s=all) e o do painel web
 *  (http://host:8080/pair?t=abc123&s=fav). Ambos recebem o POST no mesmo
 *  caminho /api/source. QR antigo sem escopo → 'all' (a TV velha ignora extras). */
function parseQR(data: string): Target | null {
  const m = data.trim().match(/^(https?:\/\/[\w.\-]+(?::\d+)?)(?:\/pair)?\/?\?t=([A-Za-z0-9]+)(?:&s=(src|fav|all))?$/);
  return m ? { origin: m[1], token: m[2], scope: (m[3] as Scope) ?? 'all' } : null;
}

/** Só Xtream e M3U viajam pelo pareamento (mesmo contrato do pairingServer). */
function toPayload(s: IPTVSource): PairingPayload {
  return s.type === 'xtream'
    ? { type: 'xtream', host: s.host, username: s.username, password: s.password, name: s.name }
    : { type: 'm3u', url: s.url, name: s.name };
}

/** Favoritos desta fonte + progresso de assistidos, conforme o escopo que a TV
 *  pediu no QR — a TV mescla ao receber. */
function buildExtras(source: IPTVSource, scope: Scope): PairingExtras | undefined {
  if (scope === 'src') return undefined;
  const { favorites, channels } = useStore.getState();
  const sourceIds = new Set(channels.filter(c => c.sourceId === source.id).map(c => c.id));
  return {
    // Sem canais carregados desta fonte no celular, manda todos (melhor que nada)
    favorites: sourceIds.size > 0 ? favorites.filter(id => sourceIds.has(id)) : favorites,
    ...(scope === 'all' ? { watch: useWatchProgress.getState().entries } : null),
  };
}

const TYPE_META: Record<string, { icon: string; tint: string; tintSoft: string; label: string }> = {
  xtream: { icon: 'server',        tint: '#34d399',     tintSoft: 'rgba(52,211,153,0.14)', label: 'Xtream'   },
  m3u:    { icon: 'document-text', tint: colors.accent, tintSoft: colors.accentSoft,       label: 'Lista M3U' },
};

export default function SendToTVModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const sources = useStore(s => s.sources);
  const eligible = sources.filter(s => s.type === 'xtream' || s.type === 'm3u');

  const [step, setStep] = useState<Step>('requesting');
  const [target, setTarget] = useState<Target | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  // Trava contra leituras repetidas (a câmera dispara vários eventos por segundo)
  const scannedRef = useRef(false);

  useEffect(() => {
    if (!visible) return;
    scannedRef.current = false;
    setTarget(null);
    setErrorMsg('');

    if (!CameraModule?.CameraView) { setStep('unsupported'); return; }
    if (eligible.length === 0) { setStep('no-sources'); return; }

    // O export raiz mudou entre versões do expo-camera — tenta os dois caminhos
    const requestPermission =
      CameraModule.requestCameraPermissionsAsync ?? CameraModule.Camera?.requestCameraPermissionsAsync;
    if (!requestPermission) { setStep('unsupported'); return; }

    setStep('requesting');
    requestPermission()
      .then((res: any) => setStep(res?.granted ? 'scan' : 'denied'))
      .catch(() => setStep('denied'));
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleScan = ({ data }: { data: string }) => {
    if (scannedRef.current) return;
    const parsed = parseQR(data);
    if (!parsed) return; // QR de outra coisa — segue lendo
    scannedRef.current = true;
    Vibration.vibrate(60);
    setTarget(parsed);
    setStep('pick');
  };

  const send = async (source: IPTVSource) => {
    if (!target) return;
    setStep('sending');
    try {
      const res = await axios.post(
        `${target.origin}/api/source`,
        { token: target.token, source: { ...toPayload(source), extras: buildExtras(source, target.scope) } },
        { timeout: 10_000 },
      );
      if (res.data?.ok) {
        setStep('done');
      } else {
        setErrorMsg(res.data?.error ?? 'A TV recusou o envio.');
        setStep('error');
      }
    } catch {
      setErrorMsg('Não foi possível falar com o outro aparelho. Ele ainda está na tela do QR code? Os dois precisam estar na mesma rede.');
      setStep('error');
    }
  };

  const CameraView = CameraModule?.CameraView;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={st.overlay}>
        <View style={st.box}>
          <View style={st.header}>
            <View style={st.headerIcon}>
              <Ionicons name="scan-outline" size={18} color={colors.accent} />
            </View>
            <Text style={st.title}>Enviar para uma TV</Text>
          </View>

          {step === 'unsupported' && (
            <Text style={st.desc}>
              Esta versão do app foi instalada sem o leitor de QR.{'\n'}
              Atualize o app (Ajustes → Verificar atualização) para usar este recurso.
            </Text>
          )}

          {step === 'no-sources' && (
            <Text style={st.desc}>
              Você ainda não tem fontes Xtream ou M3U neste aparelho.{'\n'}
              Adicione uma primeiro — depois é só escanear o QR da TV.
            </Text>
          )}

          {step === 'requesting' && (
            <View style={st.center}>
              <ActivityIndicator color={colors.accent} />
              <Text style={st.desc}>Abrindo a câmera…</Text>
            </View>
          )}

          {step === 'denied' && (
            <Text style={st.desc}>
              Sem acesso à câmera.{'\n'}
              Permita a câmera para o SkaphosTV nas configurações do Android e tente de novo.
            </Text>
          )}

          {step === 'scan' && CameraView && (
            <>
              <Text style={st.desc}>
                Na TV ou no painel web, abra <Text style={st.bold}>Adicionar fonte → Sincronizar dispositivos</Text>,
                escolha o que sincronizar e aponte a câmera para o QR code.
              </Text>
              <View style={st.cameraWrap}>
                <CameraView
                  style={StyleSheet.absoluteFill}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onBarcodeScanned={handleScan}
                />
                {/* Moldura de mira — quatro cantos violeta */}
                <View pointerEvents="none" style={st.frame}>
                  <View style={[st.corner, st.cTL]} />
                  <View style={[st.corner, st.cTR]} />
                  <View style={[st.corner, st.cBL]} />
                  <View style={[st.corner, st.cBR]} />
                </View>
              </View>
              <View style={st.waitRow}>
                <ActivityIndicator size="small" color={colors.accent} />
                <Text style={st.waitText}>Procurando QR code…</Text>
              </View>
            </>
          )}

          {step === 'pick' && (
            <>
              <View style={st.linkedRow}>
                <Ionicons name="checkmark-circle" size={16} color={colors.green} />
                <Text style={st.linkedText}>TV encontrada na rede</Text>
              </View>
              <Text style={st.desc}>
                Qual fonte você quer enviar?{'\n'}
                <Text style={st.extrasNote}>{SCOPE_LABEL[target?.scope ?? 'all']}</Text>
              </Text>
              <ScrollView style={st.pickList} contentContainerStyle={{ gap: 8 }}>
                {eligible.map(s => {
                  const meta = TYPE_META[s.type]!;
                  return (
                    <Pressable
                      key={s.id}
                      accessibilityRole="button"
                      onPress={() => send(s)}
                      style={({ pressed }) => [st.pickCard, pressed && { opacity: 0.7 }]}
                    >
                      <View style={[st.pickIcon, { backgroundColor: meta.tintSoft }]}>
                        <Ionicons name={meta.icon as any} size={16} color={meta.tint} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={st.pickName} numberOfLines={1}>{s.name}</Text>
                        <Text style={st.pickMeta}>{meta.label} · {s.channelCount || 0} itens</Text>
                      </View>
                      <Ionicons name="paper-plane-outline" size={16} color={colors.accent} />
                    </Pressable>
                  );
                })}
              </ScrollView>
            </>
          )}

          {step === 'sending' && (
            <View style={st.center}>
              <ActivityIndicator color={colors.accent} size="large" />
              <Text style={st.desc}>Enviando para a TV…</Text>
            </View>
          )}

          {step === 'done' && (
            <View style={st.center}>
              <View style={st.doneIcon}>
                <Ionicons name="checkmark" size={30} color={colors.green} />
              </View>
              <Text style={st.doneTitle}>Fonte enviada!</Text>
              <Text style={st.desc}>Continue na TV — os canais já estão carregando.</Text>
            </View>
          )}

          {step === 'error' && (
            <View style={st.center}>
              <Ionicons name="alert-circle-outline" size={36} color={colors.red} />
              <Text style={[st.desc, { color: colors.red }]}>{errorMsg}</Text>
            </View>
          )}

          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [st.closeBtn, pressed && { opacity: 0.7 }]}
          >
            <Text style={st.closeText}>{step === 'done' ? 'Concluir' : 'Fechar'}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: colors.overlay,
    alignItems: 'center', justifyContent: 'center', padding: spacing.xl,
  },
  box: {
    ...shadow.floating,
    width: '100%', maxWidth: 400,
    backgroundColor: colors.bg1, borderRadius: radius.xl,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.xl,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: spacing.md },
  headerIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.accentSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: fontSize.lg, fontWeight: '600', color: colors.text1 },
  desc: { fontSize: fontSize.sm, color: colors.text2, lineHeight: 19, textAlign: 'center', marginBottom: spacing.md },
  extrasNote: { fontSize: fontSize.xs, color: colors.text3 },
  bold: { color: colors.text1, fontWeight: '600' },
  center: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.lg },

  cameraWrap: {
    height: 260, borderRadius: radius.lg, overflow: 'hidden',
    backgroundColor: colors.black, marginBottom: spacing.md,
  },
  frame: { ...StyleSheet.absoluteFillObject, margin: 42 },
  corner: { position: 'absolute', width: 26, height: 26, borderColor: colors.accent },
  cTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 8 },
  cTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 8 },
  cBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 8 },
  cBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 8 },
  waitRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: spacing.sm },
  waitText: { fontSize: fontSize.sm, color: colors.accent },

  linkedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: spacing.sm },
  linkedText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.green },
  pickList: { maxHeight: 280 },
  pickCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.bg2, borderRadius: radius.lg,
    padding: 12,
  },
  pickIcon: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  pickName: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text1 },
  pickMeta: { fontSize: fontSize.xs, color: colors.text3, marginTop: 2 },

  doneIcon: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: 'rgba(34,197,94,0.14)',
    alignItems: 'center', justifyContent: 'center',
  },
  doneTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text1 },

  closeBtn: {
    marginTop: spacing.sm, height: 44, borderRadius: radius.md,
    backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  closeText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text1 },
});
