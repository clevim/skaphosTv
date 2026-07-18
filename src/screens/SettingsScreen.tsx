// SettingsScreen.tsx
// Mobile: vertical scroll layout
// TV: two-panel (left sidebar with categories + right panel with settings)
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, ActivityIndicator, TextInput, Platform, Modal } from 'react-native';
import axios from 'axios';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useStore } from '../store/useStore';
import TVFocusable from '../components/TVFocusable';
import {
  checkOtaUpdate, reloadApp, fetchLatestRelease, isNewerVersion,
  downloadAndInstallApk,
} from '../utils/appUpdate';
import { APP_VERSION, VERSION_LABEL } from '../utils/version';
import { colors, spacing, fontSize, radius, UI_FONT_SCALE } from '../utils/theme';
import { IS_TV, IS_WEB } from '../utils/tvDetect';
import { showAlert } from '../components/AppAlert';
import { IS_DEV_BUILD, dlog } from '../utils/debugLog';
import { shareBackup, downloadBackupWeb, copyBackupToClipboard, pasteFromClipboard, pickBackupFileWeb, importBackup } from '../utils/backup';
import { useThemeStore } from '../store/useThemeStore';
import { useUsageStats, topChannelFor, formatWatchTime, computeWrapped, WrappedSummary } from '../store/usageStats';
import WrappedModal from '../components/WrappedModal';
import { getAchievements, Achievement } from '../utils/achievements';
import AchievementsModal from '../components/AchievementsModal';

// ── Shared sub-components ───────────────────────────────────────────────────

// ── Auth info helpers ───────────────────────────────────────────────────────

interface XtreamUserInfo {
  status: string;
  exp_date: string;
  created_at: string;
  active_cons: string;
  max_connections: string;
  is_trial: string;
  allowed_output_formats?: string[];
}

function formatExpDate(unixStr: string): string {
  const ms = parseInt(unixStr) * 1000;
  if (!ms || isNaN(ms)) return '—';
  return new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatCreatedAt(unixStr: string): string {
  const ms = parseInt(unixStr) * 1000;
  if (!ms || isNaN(ms)) return '—';
  const diff = Date.now() - ms;
  const years  = Math.floor(diff / (1000 * 60 * 60 * 24 * 365));
  const months = Math.floor(diff / (1000 * 60 * 60 * 24 * 30));
  const days   = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (years  >= 1) return `há ${years} ano${years  > 1 ? 's' : ''}`;
  if (months >= 1) return `há ${months} mês${months > 1 ? 'es' : ''}`;
  if (days   >= 1) return `há ${days} dia${days   > 1 ? 's' : ''}`;
  return 'hoje';
}

function statusColor(status: string): string {
  switch (status?.toLowerCase()) {
    case 'active':  return colors.green;
    case 'expired': return colors.red;
    case 'banned':  return colors.red;
    default:        return colors.text3;
  }
}

function statusLabel(status: string): string {
  switch (status?.toLowerCase()) {
    case 'active':  return 'Ativo';
    case 'expired': return 'Expirado';
    case 'banned':  return 'Banido';
    case 'disabled': return 'Desativado';
    default: return status || '—';
  }
}

// ── Opções de idioma Jellyfin ────────────────────────────────────────────────

const LANG_OPTIONS = [
  { value: 'pt-BR', label: 'Português (Brasil)' },
  { value: 'en',    label: 'English' },
  { value: 'es',    label: 'Español' },
  { value: 'fr',    label: 'Français' },
  { value: '',      label: 'Padrão Jellyfin' },
] as const;

function langLabel(value: string): string {
  return LANG_OPTIONS.find(o => o.value === value)?.label ?? 'Padrão Jellyfin';
}

const SUBSIZE_OPTIONS = [
  { value: 'small',  label: 'Pequena' },
  { value: 'medium', label: 'Média' },
  { value: 'large',  label: 'Grande' },
] as const;

const BUFFER_OPTIONS = [
  { value: '15000', label: '15 s · conexão instável' },
  { value: '30000', label: '30 s · padrão' },
  { value: '60000', label: '60 s · conexão estável' },
] as const;

// ── SettingsGroup / SettingsRow ─────────────────────────────────────────────

function SettingsGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{title}</Text>
      <View style={styles.groupBox}>{children}</View>
    </View>
  );
}

function SettingsRow({ icon, label, sub, value, valueColor, toggle, on, onToggle, onPress }: {
  icon: string; label: string; sub?: string; value?: string; valueColor?: string;
  toggle?: boolean; on?: boolean; onToggle?: (v: boolean) => void;
  onPress?: () => void;
}) {
  const scale = useStore(s => UI_FONT_SCALE[s.settings.uiFontScale]);
  const content = (
    <View style={styles.row}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon as any} size={16} color={colors.text2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { fontSize: 14 * scale }]}>{label}</Text>
        {sub && <Text style={[styles.rowSub, { fontSize: fontSize.xs * scale }]}>{sub}</Text>}
      </View>
      {toggle && onToggle ? (
        <Switch
          value={on}
          onValueChange={onToggle}
          trackColor={{ true: colors.accent, false: colors.border }}
          thumbColor={colors.white}
          // RNW: sem isto o thumb ligado usa o verde default da lib no web
          {...({ activeThumbColor: colors.white } as any)}
        />
      ) : value ? (
        <View style={styles.rowValueWrap}>
          <Text style={[styles.rowValue, { fontSize: 12 * scale }, valueColor ? { color: valueColor } : null]}>{value}</Text>
          {onPress && <Ionicons name="chevron-forward" size={12} color={colors.text3} />}
        </View>
      ) : onPress ? (
        <Ionicons name="chevron-forward" size={14} color={colors.text3} />
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      <TVFocusable onPress={onPress} style={{ borderRadius: 0 }}>
        {content}
      </TVFocusable>
    );
  }
  return content;
}

function SettingsRowSelect({ icon, label, sub, options, value, onChange }: {
  icon: string; label: string; sub?: string;
  options: readonly { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  const scale = useStore(s => UI_FONT_SCALE[s.settings.uiFontScale]);
  const current = options.find(o => o.value === value) ?? options[0];
  const cycle = () => {
    const idx = options.findIndex(o => o.value === value);
    onChange(options[(idx + 1) % options.length].value);
  };
  return (
    <TVFocusable onPress={cycle} style={{ borderRadius: 0 }}>
      <View style={styles.row}>
        <View style={styles.rowIcon}>
          <Ionicons name={icon as any} size={16} color={colors.text2} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowLabel, { fontSize: 14 * scale }]}>{label}</Text>
          {sub && <Text style={[styles.rowSub, { fontSize: fontSize.xs * scale }]}>{sub}</Text>}
        </View>
        <View style={styles.rowValueWrap}>
          <Text style={[styles.rowValue, { fontSize: 12 * scale }]}>{current.label}</Text>
          <Ionicons name="swap-horizontal-outline" size={12} color={colors.text3} />
        </View>
      </View>
    </TVFocusable>
  );
}

// ── SeasonalThemeRow ────────────────────────────────────────────────────────
// Liga/desliga a troca automática de cores em datas comemorativas (Natal,
// Halloween) — ver SEASONAL_PRESETS em useThemeStore.ts. Nunca sobrescreve a
// escolha manual de tema, só substitui temporariamente enquanto a data bate.

function SeasonalThemeRow() {
  const seasonalEnabled = useThemeStore(s => s.seasonalEnabled);
  const setSeasonalEnabled = useThemeStore(s => s.setSeasonalEnabled);
  return (
    <SettingsRow
      icon="gift-outline"
      label="Tema sazonal automático"
      sub="Cores especiais no Natal e Halloween"
      toggle
      on={seasonalEnabled}
      onToggle={setSeasonalEnabled}
    />
  );
}

// ── DevUpdateUrlRow ──────────────────────────────────────────────────────────
// Só existe em build de dev (IS_DEV_BUILD). Aponta "Verificar/Forçar
// atualização" pro dev-update-server local em vez do GitHub — editável aqui
// pra não precisar rebuildar o APK toda vez que o IP do PC mudar de rede.
function DevUpdateUrlRow() {
  const devUpdateUrl = useStore(s => s.settings.devUpdateUrl);
  const updateSettings = useStore(s => s.updateSettings);
  const [value, setValue] = useState(devUpdateUrl);

  if (!IS_DEV_BUILD) return null;

  return (
    <>
      <View style={styles.row}>
        <View style={styles.rowIcon}>
          <Ionicons name="construct-outline" size={16} color={colors.text2} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowLabel}>Servidor de update (dev)</Text>
          <Text style={styles.rowSub}>scripts/dev-update-server.js — ex: http://192.168.0.10:8787</Text>
        </View>
      </View>
      <View style={[styles.row, { paddingTop: 4, paddingBottom: 12 }]}>
        <TextInput
          style={styles.textInput}
          value={value}
          onChangeText={setValue}
          onBlur={() => updateSettings({ devUpdateUrl: value.trim().replace(/\/$/, '') })}
          placeholder="http://<ip-do-pc>:8787"
          placeholderTextColor={colors.text3}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
      </View>
    </>
  );
}

// ── UpdateCheckRow ──────────────────────────────────────────────────────────
// Verifica atualização: 1) OTA (JS, sem APK); 2) GitHub Release (APK, se nativa).

function UpdateCheckRow() {
  const [sub, setSub] = useState<string>(`Atual: ${VERSION_LABEL}`);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setSub('Verificando…');
    try {
      // 1) OTA — atualiza o JS sem baixar APK
      const tOta = Date.now();
      const ota = await checkOtaUpdate();
      dlog(`[perf][update] checkOtaUpdate: ${Date.now() - tOta}ms, resultado: ${ota}`);
      if (ota === 'ready') {
        setBusy(false);
        showAlert('Atualização pronta', 'Uma atualização foi baixada. Reiniciar o app agora para aplicar?', [
          { text: 'Depois', style: 'cancel', onPress: () => setSub('Atualização pendente — reinicie para aplicar') },
          { text: 'Reiniciar', onPress: () => reloadApp() },
        ]);
        return;
      }

      // 2) GitHub Release — APK (mudanças nativas)
      const tRel = Date.now();
      const rel = await fetchLatestRelease();
      dlog(`[perf][update] fetchLatestRelease: ${Date.now() - tRel}ms, resultado: ${rel ? `v${rel.version}` : 'null'}`);
      if (rel && isNewerVersion(rel.version, APP_VERSION)) {
        setBusy(false);
        if (!rel.apkUrl) {
          setSub(`Nova versão v${rel.version} disponível no GitHub`);
          showAlert('Nova versão', `A v${rel.version} está disponível, mas sem APK anexado ao release.`);
          return;
        }
        showAlert('Nova versão disponível', `v${rel.version} requer atualização do app (APK). Baixar e instalar agora?`, [
          { text: 'Agora não', style: 'cancel', onPress: () => setSub(`Nova versão v${rel.version} disponível`) },
          {
            text: 'Atualizar', onPress: async () => {
              setBusy(true);
              setSub('Baixando atualização…');
              try {
                await downloadAndInstallApk(rel.apkUrl!, p => setSub(`Baixando… ${Math.round(p * 100)}%`));
                setSub('Abrindo instalador…');
              } catch {
                setSub('Falha ao baixar o APK');
                showAlert('Erro', 'Não foi possível baixar/instalar o APK.');
              } finally {
                setBusy(false);
              }
            },
          },
        ]);
        return;
      }

      setSub(`Você está atualizado · ${VERSION_LABEL}`);
    } catch {
      setSub('Erro ao verificar atualização');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsRow
      icon="cloud-download-outline"
      label="Verificar atualização"
      sub={sub}
      value={busy ? '…' : undefined}
      onPress={busy ? undefined : run}
    />
  );
}

// ── ForceUpdateRow ──────────────────────────────────────────────────────────
// Baixa e reinstala o último APK do GitHub MESMO que a versão não seja mais nova
// que a atual — útil para reinstalar uma build corrompida ou "voltar ao oficial".
// Android instala por cima quando a assinatura confere (downgrade o sistema recusa).

const FORCE_SUB_IDLE = 'Baixa e reinstala a última versão do GitHub, mesmo igual à atual';

function ForceUpdateRow() {
  const [sub, setSub] = useState(FORCE_SUB_IDLE);
  const [busy, setBusy] = useState(false);

  // Instalação de APK só existe no Android nativo (TV/celular) — some no web
  if (Platform.OS !== 'android') return null;

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setSub('Buscando última versão no GitHub…');
    try {
      const tRel = Date.now();
      const rel = await fetchLatestRelease();
      dlog(`[perf][update] (force) fetchLatestRelease: ${Date.now() - tRel}ms, resultado: ${rel ? `v${rel.version}` : 'null'}`);
      if (!rel) { setSub('Não foi possível consultar o GitHub'); return; }
      if (!rel.apkUrl) { setSub(`v${rel.version} está sem APK anexado no release`); return; }

      const isSameOrOlder = !isNewerVersion(rel.version, APP_VERSION);
      setBusy(false);
      showAlert(
        'Forçar atualização',
        `Baixar e reinstalar a v${rel.version}?` +
          (isSameOrOlder ? `\n\nVocê já está na ${VERSION_LABEL} — o APK será reinstalado por cima.` : ''),
        [
          { text: 'Cancelar', style: 'cancel', onPress: () => setSub(FORCE_SUB_IDLE) },
          {
            text: 'Baixar e instalar',
            onPress: async () => {
              setBusy(true);
              try {
                await downloadAndInstallApk(rel.apkUrl!, p => setSub(`Baixando… ${Math.round(p * 100)}%`));
                setSub('Abrindo instalador…');
              } catch {
                setSub('Falha ao baixar o APK');
                showAlert('Erro', 'Não foi possível baixar/instalar o APK.');
              } finally {
                setBusy(false);
              }
            },
          },
        ],
      );
    } catch {
      setSub('Erro ao buscar o release');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsRow
      icon="refresh-circle-outline"
      label="Forçar atualização"
      sub={sub}
      value={busy ? '…' : undefined}
      onPress={busy ? undefined : run}
    />
  );
}

// ── BackupRows ──────────────────────────────────────────────────────────────
// Exporta fontes+favoritos+ajustes como .json (compartilha via intent do
// sistema — mesmo mecanismo do instalador de APK, sem picker de arquivo).
// Importar é colar o JSON de volta (evita adicionar uma dependência de picker
// de arquivo só pra esse fluxo raro de troca de aparelho).

// ── WrappedRow ──────────────────────────────────────────────────────────────
// "Wrapped" do ano — calcula sob demanda (usageStats + watchProgress cruzados
// com o catálogo atual) e mostra num modal, mesmo padrão auto-contido acima.

function WrappedRow() {
  const enabled = useStore(s => s.settings.showWrapped);
  const [summary, setSummary] = useState<WrappedSummary | null>(null);
  if (!enabled) return null;

  const open = () => setSummary(computeWrapped(useStore.getState().channels));

  return (
    <>
      <SettingsRow
        icon="sparkles-outline"
        label="Seu resumo do ano"
        sub="Tempo assistido, gênero e canal favoritos"
        onPress={open}
      />
      <WrappedModal visible={!!summary} summary={summary} onClose={() => setSummary(null)} />
    </>
  );
}

function AchievementsRow() {
  const enabled = useStore(s => s.settings.showAchievements);
  const [achievements, setAchievements] = useState<Achievement[] | null>(null);
  if (!enabled) return null;

  const open = () => setAchievements(getAchievements(useStore.getState().sources));

  return (
    <>
      <SettingsRow
        icon="trophy-outline"
        label="Conquistas"
        sub="Badges por uso — maratonista, madrugador, fiel..."
        onPress={open}
      />
      <AchievementsModal
        visible={!!achievements}
        achievements={achievements ?? []}
        onClose={() => setAchievements(null)}
      />
    </>
  );
}

function BackupRows() {
  const [showExport, setShowExport] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importBusy, setImportBusy] = useState(false);

  const runExport = async (action: () => Promise<void> | void, doneMsg: string) => {
    setExportBusy(true);
    try {
      await action();
      setShowExport(false);
      showAlert('Backup pronto', doneMsg);
    } catch {
      showAlert('Erro', 'Não foi possível gerar o backup.');
    } finally {
      setExportBusy(false);
    }
  };

  const handlePasteFromClipboard = async () => {
    const text = await pasteFromClipboard();
    if (text.trim()) setImportText(text.trim());
  };

  const handleImport = async () => {
    if (!importText.trim()) return;
    setImportBusy(true);
    try {
      const { sourcesCount } = await importBackup(importText.trim());
      setShowImport(false);
      setImportText('');
      showAlert('Backup importado', `${sourcesCount} fonte(s) restaurada(s) — os canais estão recarregando em segundo plano.`);
    } catch (e: any) {
      showAlert('Erro ao importar', e?.message ?? 'JSON inválido ou incompleto.');
    } finally {
      setImportBusy(false);
    }
  };

  return (
    <>
      <SettingsRow
        icon="share-outline"
        label="Exportar configuração"
        sub="Fontes (com credenciais), favoritos e ajustes — .json"
        onPress={() => setShowExport(true)}
      />
      <SettingsRow
        icon="download-outline"
        label="Importar configuração"
        sub="Cole o .json exportado de outro aparelho"
        onPress={() => setShowImport(true)}
      />

      <Modal visible={showExport} transparent animationType="fade" onRequestClose={() => setShowExport(false)}>
        <View style={backupStyles.overlay}>
          <View style={backupStyles.box}>
            <Text style={backupStyles.title}>Exportar configuração</Text>
            <Text style={backupStyles.desc}>Escolha como salvar o backup.</Text>

            {IS_WEB && (
              <TVFocusable
                onPress={() => runExport(() => downloadBackupWeb(), 'Arquivo baixado.')}
                style={backupStyles.optionRow}
                hasTVPreferredFocus
                disabled={exportBusy}
              >
                <Ionicons name="cloud-download-outline" size={18} color={colors.accent} />
                <Text style={backupStyles.optionText}>Baixar arquivo .json</Text>
              </TVFocusable>
            )}
            {Platform.OS === 'android' && (
              <TVFocusable
                onPress={() => runExport(() => shareBackup(), 'Compartilhado.')}
                style={backupStyles.optionRow}
                hasTVPreferredFocus={!IS_WEB}
                disabled={exportBusy}
              >
                <Ionicons name="share-social-outline" size={18} color={colors.accent} />
                <Text style={backupStyles.optionText}>Compartilhar / salvar arquivo</Text>
              </TVFocusable>
            )}
            <TVFocusable
              onPress={() => runExport(() => copyBackupToClipboard(), 'Copiado — cole em outro aparelho ou app.')}
              style={backupStyles.optionRow}
              disabled={exportBusy}
            >
              <Ionicons name="copy-outline" size={18} color={colors.accent} />
              <Text style={backupStyles.optionText}>Copiar para a área de transferência</Text>
            </TVFocusable>

            <View style={backupStyles.actions}>
              <TVFocusable onPress={() => setShowExport(false)} style={backupStyles.btnCancel}>
                <Text style={backupStyles.btnCancelText}>Fechar</Text>
              </TVFocusable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showImport} transparent animationType="fade" onRequestClose={() => setShowImport(false)}>
        <View style={backupStyles.overlay}>
          <View style={backupStyles.box}>
            <Text style={backupStyles.title}>Importar configuração</Text>
            <Text style={backupStyles.desc}>Cole aqui o conteúdo do arquivo .json exportado.</Text>
            <TextInput
              style={backupStyles.input}
              value={importText}
              onChangeText={setImportText}
              placeholder='{"version": 1, "sources": [...]}'
              placeholderTextColor={colors.text3}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TVFocusable onPress={handlePasteFromClipboard} style={backupStyles.pasteBtn}>
              <Ionicons name="clipboard-outline" size={14} color={colors.text2} />
              <Text style={backupStyles.pasteBtnText}>Colar da área de transferência</Text>
            </TVFocusable>
            {IS_WEB && (
              <TVFocusable
                onPress={async () => {
                  try { setImportText((await pickBackupFileWeb()).trim()); } catch { /* cancelou */ }
                }}
                style={backupStyles.pasteBtn}
              >
                <Ionicons name="folder-open-outline" size={14} color={colors.text2} />
                <Text style={backupStyles.pasteBtnText}>Escolher arquivo .json</Text>
              </TVFocusable>
            )}
            <View style={backupStyles.actions}>
              <TVFocusable onPress={() => setShowImport(false)} style={backupStyles.btnCancel}>
                <Text style={backupStyles.btnCancelText}>Cancelar</Text>
              </TVFocusable>
              <TVFocusable onPress={handleImport} style={backupStyles.btnConfirm} disabled={importBusy}>
                <Text style={backupStyles.btnConfirmText}>{importBusy ? 'Importando…' : 'Importar'}</Text>
              </TVFocusable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const backupStyles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center', justifyContent: 'center', padding: spacing.xl,
  },
  box: {
    width: '100%', maxWidth: 420,
    backgroundColor: colors.bg1, borderRadius: radius.xl,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.xl, gap: spacing.sm,
  },
  title: { fontSize: fontSize.lg, fontWeight: '600', color: colors.text1 },
  desc: { fontSize: 12.5, color: colors.text2 },
  optionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 13, paddingHorizontal: 14,
    backgroundColor: colors.bg2, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
  },
  optionText: { fontSize: fontSize.sm, fontWeight: '500', color: colors.text1 },
  pasteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    alignSelf: 'flex-start',
    paddingVertical: 6,
  },
  pasteBtnText: { fontSize: 12, fontWeight: '500', color: colors.text2 },
  input: {
    minHeight: 120, maxHeight: 220,
    backgroundColor: colors.bg2, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.sm, color: colors.text1, fontSize: 12,
    textAlignVertical: 'top',
  },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  btnCancel: {
    flex: 1, height: 44, borderRadius: radius.md,
    backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  btnCancelText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text2 },
  btnConfirm: {
    flex: 1, height: 44, borderRadius: radius.md,
    backgroundColor: colors.accent3,
    alignItems: 'center', justifyContent: 'center',
  },
  btnConfirmText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.white },
});

// ── XtreamSourceCard ────────────────────────────────────────────────────────

/** Tempo assistido + canal mais usado de uma fonte — reusado nos 3 tipos de card. */
function UsageRows({ sourceId }: { sourceId: string }) {
  const usage = useUsageStats(s => s.bySource[sourceId]);
  if (!usage || usage.watchSeconds === 0) return null;
  const top = topChannelFor(usage);
  return (
    <>
      <SettingsRow icon="hourglass-outline" label="Tempo assistido" value={formatWatchTime(usage.watchSeconds)} />
      {top && (
        <SettingsRow icon="trophy-outline" label="Mais assistido" value={`${top.name} (${top.count}x)`} />
      )}
    </>
  );
}

function XtreamSourceCard({ source, authInfo }: {
  source: { id: string; name: string; host?: string; username?: string; password?: string; channelCount?: number };
  authInfo: XtreamUserInfo | 'loading' | 'error' | undefined;
}) {
  const isLoading = authInfo === 'loading';
  const isError   = authInfo === 'error';
  const info      = typeof authInfo === 'object' ? authInfo : null;
  const displayName = source.name.replace(/^Xtream:\s*/i, '') || source.host || 'Lista';

  return (
    <SettingsGroup title={`XTREAM: ${displayName}`}>
      <SettingsRow icon="server-outline"      label="Servidor" value={source.host ?? '—'} />
      <SettingsRow icon="person-outline"      label="Usuário"  value={source.username ?? '—'} />
      <SettingsRow icon="lock-closed-outline" label="Senha"    value={'•'.repeat(Math.min(source.password?.length ?? 0, 10))} />
      <SettingsRow icon="layers-outline"      label="Canais"   value={`${source.channelCount ?? 0} itens`} />
      <UsageRows sourceId={source.id} />
      {isLoading && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10 }}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={{ fontSize: 12, color: colors.text3 }}>Verificando conta...</Text>
        </View>
      )}
      {isError && (
        <SettingsRow icon="warning-outline" label="Conta" value="Sem resposta do servidor" valueColor={colors.text3} />
      )}
      {info && (
        <>
          <SettingsRow
            icon="checkmark-circle-outline"
            label="Status"
            value={statusLabel(info.status)}
            valueColor={statusColor(info.status)}
          />
          <SettingsRow
            icon="calendar-outline"
            label="Expira em"
            value={formatExpDate(info.exp_date)}
            valueColor={info.status?.toLowerCase() === 'expired' ? colors.red : undefined}
          />
          <SettingsRow
            icon="time-outline"
            label="Conta criada"
            value={formatCreatedAt(info.created_at)}
          />
          <SettingsRow
            icon="people-outline"
            label="Conexões"
            value={`${info.active_cons} de ${info.max_connections} ativa${info.max_connections !== '1' ? 's' : ''}`}
          />
          {info.is_trial === '1' && (
            <SettingsRow icon="flask-outline" label="Tipo" value="Trial" valueColor={colors.accent} />
          )}
        </>
      )}
    </SettingsGroup>
  );
}

// ── JellyfinSourceCard ──────────────────────────────────────────────────────

function JellyfinSourceCard({ source }: {
  source: { id: string; name: string; host?: string; serverName?: string; apiKey?: string; channelCount?: number };
}) {
  const [serverInfo, setServerInfo] = useState<{ Version?: string; ServerName?: string } | 'loading' | 'error'>('loading');

  useEffect(() => {
    if (!source.host || !source.apiKey) { setServerInfo('error'); return; }
    axios.get(`${source.host}/System/Info`, {
      timeout: 8_000,
      headers: { 'X-Emby-Token': source.apiKey },
    })
      .then(res => setServerInfo(res.data ?? 'error'))
      .catch(() => setServerInfo('error'));
  }, [source.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const info = typeof serverInfo === 'object' ? serverInfo : null;

  return (
    <SettingsGroup title={`JELLYFIN: ${source.serverName || source.name}`}>
      <SettingsRow icon="server-outline"    label="Servidor"  value={source.host ?? '—'} />
      <SettingsRow icon="layers-outline"    label="Conteúdo"  value={`${source.channelCount ?? 0} itens`} />
      <UsageRows sourceId={source.id} />
      {serverInfo === 'loading' && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10 }}>
          <ActivityIndicator size="small" color="#00a4dc" />
          <Text style={{ fontSize: 12, color: colors.text3 }}>Verificando servidor...</Text>
        </View>
      )}
      {serverInfo === 'error' && (
        <SettingsRow icon="warning-outline" label="Status" value="Sem resposta" valueColor={colors.text3} />
      )}
      {info && (
        <>
          <SettingsRow icon="checkmark-circle-outline" label="Status"  value="Conectado"   valueColor={colors.green} />
          {info.ServerName && <SettingsRow icon="tv-outline"         label="Nome"    value={info.ServerName} />}
          {info.Version    && <SettingsRow icon="code-slash-outline" label="Versão"  value={`v${info.Version}`} />}
        </>
      )}
    </SettingsGroup>
  );
}

// ── TV category definitions ─────────────────────────────────────────────────

// ── Blocos compartilhados TV/mobile (todas as opções têm efeito REAL) ────────

/** Linhas de Reprodução: autoplay, buffer (bufferConfig do player) e legenda automática. */
function PlaybackRows({ settings, updateSettings }: {
  settings: any; updateSettings: (s: any) => void;
}) {
  return (
    <>
      <SettingsRow
        icon="sparkles-outline"
        label="Reprodução automática"
        toggle
        on={settings.autoPlay}
        onToggle={v => updateSettings({ autoPlay: v })}
      />
      <SettingsRowSelect
        icon="speedometer-outline"
        label="Buffer de vídeo"
        sub="Quanto o player pré-carrega — maior aguenta mais oscilação de rede"
        options={BUFFER_OPTIONS}
        value={String(settings.bufferSize)}
        onChange={v => updateSettings({ bufferSize: parseInt(v, 10) })}
      />
      <SettingsRow
        icon="chatbox-ellipses-outline"
        label="Legendas automáticas"
        sub="Ativa a legenda preferida quando o conteúdo tiver (Jellyfin)"
        toggle
        on={settings.subtitleEnabled}
        onToggle={v => updateSettings({ subtitleEnabled: v })}
      />
    </>
  );
}

/** Grupo Interface: Guia (EPG) na navegação e relógio da TV. */
function InterfaceGroup({ settings, updateSettings }: {
  settings: any; updateSettings: (s: any) => void;
}) {
  return (
    <SettingsGroup title="Interface">
      <SettingsRow
        icon="calendar-outline"
        label="Guia de programação (EPG)"
        sub="Mostra a aba Guia na navegação"
        toggle
        on={settings.showEpg}
        onToggle={v => updateSettings({ showEpg: v })}
      />
      {/* Relógio: recurso da top bar da TV — no celular não existe onde exibi-lo */}
      {IS_TV && (
        <SettingsRow
          icon="time-outline"
          label="Relógio na barra da TV"
          toggle
          on={settings.showClock}
          onToggle={v => updateSettings({ showClock: v })}
        />
      )}
    </SettingsGroup>
  );
}

type CategoryKey = 'reproducao' | 'conta' | 'sistema';

// ── Card de status da conta ─────────────────────────────────────────────────
// Identidade + fatos ao vivo no topo de "Conta e dispositivos". Sóbrio de
// propósito: logo, nome/versão e uma linha de estado com ponto semântico —
// nada de número gigante nem grade de métricas.
function AccountCard({ sources, authInfoMap }: {
  sources: any[];
  authInfoMap: Record<string, XtreamUserInfo | 'loading' | 'error'>;
}) {
  // Resumo das fontes: "3 listas · 2 Xtream · 1 Jellyfin" (só os tipos presentes)
  const byType = (t: string) => sources.filter(s => s.type === t).length;
  const parts = [
    `${sources.length} lista${sources.length !== 1 ? 's' : ''}`,
    byType('xtream') > 0 ? `${byType('xtream')} Xtream` : null,
    byType('m3u') > 0 ? `${byType('m3u')} M3U` : null,
    byType('jellyfin') > 0 ? `${byType('jellyfin')} Jellyfin` : null,
  ].filter(Boolean).join(' · ');

  // Estado da assinatura: a fonte Xtream que vence PRIMEIRO define a linha.
  // Sem Xtream (ou sem resposta ainda) → sem linha de estado, sem inventar.
  let statusText: string | null = null;
  let statusDot = colors.text3;
  const infos = sources
    .map(s => authInfoMap[s.id])
    .filter((i): i is XtreamUserInfo => !!i && i !== 'loading' && i !== 'error');
  if (infos.length > 0) {
    const soonest = infos.reduce((a, b) =>
      (parseInt(a.exp_date) || Infinity) <= (parseInt(b.exp_date) || Infinity) ? a : b);
    const expMs = parseInt(soonest.exp_date) * 1000;
    const days = expMs ? Math.ceil((expMs - Date.now()) / 86_400_000) : NaN;
    if (soonest.status?.toLowerCase() !== 'active') {
      statusText = statusLabel(soonest.status);
      statusDot = statusColor(soonest.status);
    } else if (!isNaN(days) && days <= 30) {
      statusText = days <= 0 ? 'Vencida' : `Vence em ${days} dia${days !== 1 ? 's' : ''}`;
      statusDot = days <= 7 ? colors.red : colors.yellow;
    } else {
      statusText = expMs ? `Ativa até ${formatExpDate(soonest.exp_date)}` : 'Ativa';
      statusDot = colors.green;
    }
  }

  return (
    <View style={styles.accountCard}>
      <View style={styles.accountLogo}>
        <Image source={require('../../assets/icon.png')} style={styles.accountLogoImg} contentFit="cover" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.accountName}>
          Skaphos<Text style={{ color: colors.accent }}>·</Text>TV <Text style={styles.accountVersion}>v{APP_VERSION}</Text>
        </Text>
        <Text style={styles.accountFacts}>{parts}</Text>
        {statusText && (
          <View style={styles.accountStatusRow}>
            <View style={[styles.accountStatusDot, { backgroundColor: statusDot }]} />
            <Text style={styles.accountStatusText}>{statusText}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const CATEGORIES: { key: CategoryKey; label: string; sub: string; icon: string }[] = [
  { key: 'reproducao', label: 'Reprodução',           sub: 'Player, legendas e interface',        icon: 'play-circle-outline' },
  { key: 'conta',      label: 'Conta e dispositivos', sub: 'Listas, assinaturas e uso',           icon: 'person-circle-outline' },
  { key: 'sistema',    label: 'Sistema',              sub: 'Notificações, backup e atualizações', icon: 'settings-outline' },
];

// ── Category panel content (TV e mobile compartilham o mesmo conteúdo;
//    só o layout de navegação entre categorias muda) ────────────────────────

function CategoryPanel({
  category, settings, updateSettings, sources, navigation, authInfoMap,
}: {
  category: CategoryKey;
  settings: any;
  updateSettings: (s: any) => void;
  sources: any[];
  navigation: any;
  authInfoMap: Record<string, XtreamUserInfo | 'loading' | 'error'>;
}) {
  if (category === 'reproducao') {
    return (
      <>
        <SettingsGroup title="Reprodução">
          <PlaybackRows settings={settings} updateSettings={updateSettings} />
        </SettingsGroup>
        <InterfaceGroup settings={settings} updateSettings={updateSettings} />
        <SettingsGroup title="Jellyfin · Preferências">
          <SettingsRowSelect
            icon="musical-note-outline"
            label="Áudio preferido"
            sub="Idioma pré-selecionado ao abrir conteúdo"
            options={LANG_OPTIONS}
            value={settings.jellyfinPreferredAudio}
            onChange={v => updateSettings({ jellyfinPreferredAudio: v })}
          />
          <SettingsRowSelect
            icon="chatbox-ellipses-outline"
            label="Legenda preferida"
            sub="Idioma pré-selecionado ao abrir conteúdo"
            options={LANG_OPTIONS}
            value={settings.jellyfinPreferredSubtitle}
            onChange={v => updateSettings({ jellyfinPreferredSubtitle: v })}
          />
          <SettingsRowSelect
            icon="text-outline"
            label="Tamanho da legenda"
            sub="Tamanho do texto das legendas no player"
            options={SUBSIZE_OPTIONS}
            value={settings.subtitleSize}
            onChange={v => updateSettings({ subtitleSize: v as 'small' | 'medium' | 'large' })}
          />
          <SettingsRowSelect
            icon="resize-outline"
            label="Tamanho de fonte da interface"
            sub="Ajustes, busca e guia de programação"
            options={SUBSIZE_OPTIONS}
            value={settings.uiFontScale}
            onChange={v => updateSettings({ uiFontScale: v as 'small' | 'medium' | 'large' })}
          />
        </SettingsGroup>
      </>
    );
  }

  if (category === 'conta') {
    return (
      <>
        <AccountCard sources={sources} authInfoMap={authInfoMap} />
        <SettingsGroup title="Fontes">
          <SettingsRow
            icon="globe-outline"
            label="Gerenciar listas"
            value={`${sources.length} lista${sources.length !== 1 ? 's' : ''}`}
            onPress={() => navigation.navigate('Setup')}
          />
        </SettingsGroup>
        {sources.filter(s => s.type === 'xtream').map(s => (
          <XtreamSourceCard key={s.id} source={s} authInfo={authInfoMap[s.id]} />
        ))}
        {sources.filter(s => s.type === 'm3u').map(s => (
          <SettingsGroup key={s.id} title={s.name}>
            <SettingsRow icon="link-outline"   label="URL"    value={s.url ?? '—'} />
            <SettingsRow icon="layers-outline" label="Canais" value={`${s.channelCount ?? 0} itens`} />
            <UsageRows sourceId={s.id} />
          </SettingsGroup>
        ))}
        {sources.filter(s => s.type === 'jellyfin').map(s => (
          <JellyfinSourceCard key={s.id} source={s} />
        ))}
      </>
    );
  }

  // sistema
  return (
    <>
      <SettingsGroup title="Notificações">
        <SettingsRow
          icon="tv-outline"
          label="Canal indisponível"
          sub="Avisa quando um canal ao vivo para de responder"
          toggle
          on={settings.notifyChannelOffline}
          onToggle={v => updateSettings({ notifyChannelOffline: v })}
        />
        <SettingsRow
          icon="albums-outline"
          label="Catálogo atualizado"
          sub="Avisa quando uma fonte ganha itens novos ao recarregar"
          toggle
          on={settings.notifyCatalogUpdate}
          onToggle={v => updateSettings({ notifyCatalogUpdate: v })}
        />
        <SettingsRow
          icon="calendar-outline"
          label="Fonte prestes a vencer"
          sub="Avisa quando a assinatura Xtream está perto do vencimento"
          toggle
          on={settings.notifySourceExpiring}
          onToggle={v => updateSettings({ notifySourceExpiring: v })}
        />
      </SettingsGroup>
      <SettingsGroup title="Estatísticas">
        <SettingsRow
          icon="sparkles-outline"
          label="Mostrar resumo do ano"
          toggle
          on={settings.showWrapped}
          onToggle={v => updateSettings({ showWrapped: v })}
        />
        <SettingsRow
          icon="trophy-outline"
          label="Mostrar conquistas"
          toggle
          on={settings.showAchievements}
          onToggle={v => updateSettings({ showAchievements: v })}
        />
        <WrappedRow />
        <AchievementsRow />
      </SettingsGroup>
      <SettingsGroup title="Backup">
        <BackupRows />
      </SettingsGroup>
      <SettingsGroup title="Sistema">
        <SettingsRow icon="language-outline"           label="Idioma"   value="Português (Brasil)" />
        <SeasonalThemeRow />
        <DevUpdateUrlRow />
        <UpdateCheckRow />
        <ForceUpdateRow />
        <SettingsRow icon="information-circle-outline" label="Versão"   value={VERSION_LABEL} />
      </SettingsGroup>
    </>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const navigation = useNavigation();
  const settings       = useStore(s => s.settings);
  const updateSettings = useStore(s => s.updateSettings);
  const sources        = useStore(s => s.sources);
  const [activeCategory, setActiveCategory] = useState<CategoryKey>('reproducao');
  const [authInfoMap, setAuthInfoMap] = useState<Record<string, XtreamUserInfo | 'loading' | 'error'>>({});

  useEffect(() => {
    sources.filter(s => s.type === 'xtream' && s.host && s.username && s.password).forEach(async s => {
      setAuthInfoMap(prev => ({ ...prev, [s.id]: 'loading' }));
      try {
        const res = await axios.get(
          `${s.host}/player_api.php?username=${s.username}&password=${s.password}`,
          { timeout: 10_000, headers: { 'User-Agent': 'okhttp/4.9.0' } },
        );
        const info: XtreamUserInfo = res.data?.user_info;
        setAuthInfoMap(prev => ({ ...prev, [s.id]: info ?? 'error' }));
      } catch {
        setAuthInfoMap(prev => ({ ...prev, [s.id]: 'error' }));
      }
    });
  }, [sources]);

  // ── TV Layout ───────────────────────────────────────────────────────────
  if (IS_TV) {
    return (
      <View style={tvStyles.root}>
        {/* Sidebar */}
        <View style={tvStyles.sidebar}>
          {/* Identidade + título da tela — a sidebar abria direto nas categorias */}
          <View style={tvStyles.sidebarHeader}>
            <View style={tvStyles.sidebarLogo}>
              <Image source={require('../../assets/icon.png')} style={tvStyles.sidebarLogoImg} contentFit="cover" />
            </View>
            <Text style={tvStyles.sidebarTitle}>Ajustes</Text>
          </View>
          <View style={tvStyles.categoryList}>
            {CATEGORIES.map((cat, i) => {
              const active = cat.key === activeCategory;
              return (
                <TVFocusable
                  key={cat.key}
                  onPress={() => setActiveCategory(cat.key)}
                  style={[tvStyles.categoryItem, active && tvStyles.categoryItemActive]}
                  hasTVPreferredFocus={i === 0}
                >
                  {/* Ativo = contêiner violeta-profundo com ícone claro (uso
                      sancionado no DESIGN.md) — sem a barrinha lateral (side-stripe) */}
                  <View style={[tvStyles.catIcon, active && tvStyles.catIconActive]}>
                    <Ionicons name={cat.icon as any} size={16} color={active ? colors.white : colors.text2} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[tvStyles.categoryLabel, active && tvStyles.categoryLabelActive]}>
                      {cat.label}
                    </Text>
                    <Text style={tvStyles.categorySub} numberOfLines={1}>{cat.sub}</Text>
                  </View>
                </TVFocusable>
              );
            })}
          </View>

          <View style={tvStyles.sidebarFooter}>
            <Text style={tvStyles.madeBy}>made by clevs · v{APP_VERSION}</Text>
            <TVFocusable accessibilityLabel="Voltar" onPress={() => navigation.goBack()} style={tvStyles.backBtn}>
              <Ionicons name="chevron-back" size={14} color={colors.text2} />
              <Text style={tvStyles.backBtnText}>Voltar</Text>
            </TVFocusable>
          </View>
        </View>

        {/* Right panel */}
        <View style={tvStyles.panel}>
          <View style={tvStyles.panelHeader}>
            <Text style={tvStyles.panelTitle}>
              {CATEGORIES.find(c => c.key === activeCategory)?.label}
            </Text>
            <Text style={tvStyles.panelSub}>
              {CATEGORIES.find(c => c.key === activeCategory)?.sub}
            </Text>
          </View>
          <ScrollView contentContainerStyle={tvStyles.panelContent}>
            <CategoryPanel
              category={activeCategory}
              settings={settings}
              updateSettings={updateSettings}
              sources={sources}
              navigation={navigation}
              authInfoMap={authInfoMap}
            />
          </ScrollView>
        </View>
      </View>
    );
  }

  // ── Mobile Layout ────────────────────────────────────────────────────────
  // Mesmas categorias/conteúdo da TV (CategoryPanel) — só troca o sidebar por
  // uma barra de abas horizontal, já que não há espaço lateral no celular.
  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TVFocusable accessibilityLabel="Voltar" onPress={() => navigation.goBack()} style={styles.back}>
          <Ionicons name="chevron-back" size={20} color={colors.text2} />
        </TVFocusable>
        <Text style={styles.title}>Ajustes</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabBar}
        contentContainerStyle={styles.tabBarInner}
      >
        {CATEGORIES.map(cat => {
          const active = cat.key === activeCategory;
          return (
            <TVFocusable
              key={cat.key}
              onPress={() => setActiveCategory(cat.key)}
              style={[styles.tab, active && styles.tabActive]}
              borderRadius={radius.lg}
            >
              {/* Mesma anatomia da sidebar da TV: contêiner tonal, violeta-profundo
                  no ativo — uma linguagem de categoria nas três plataformas */}
              <View style={[styles.tabIcon, active && styles.tabIconActive]}>
                <Ionicons name={cat.icon as any} size={13} color={active ? colors.white : colors.text2} />
              </View>
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{cat.label}</Text>
            </TVFocusable>
          );
        })}
      </ScrollView>
      {/* Descrição da categoria ativa — contexto sem poluir as abas */}
      <Text style={styles.tabCaption}>
        {CATEGORIES.find(c => c.key === activeCategory)?.sub}
      </Text>

      <ScrollView style={styles.content} contentContainerStyle={styles.inner}>
        <CategoryPanel
          category={activeCategory}
          settings={settings}
          updateSettings={updateSettings}
          sources={sources}
          navigation={navigation}
          authInfoMap={authInfoMap}
        />

        <View style={styles.footer}>
          <View style={styles.footerLogoRow}>
            <View style={styles.footerLogoIcon}>
              <Image source={require('../../assets/icon.png')} style={styles.footerLogoImg} contentFit="cover" />
            </View>
            <Text style={styles.footerLogoText}>
              Skaphos<Text style={{ color: colors.accent }}>·</Text>TV
            </Text>
          </View>
          <Text style={styles.footerVersion}>{VERSION_LABEL}</Text>
          <Text style={styles.footerBy}>made by clevs</Text>
        </View>
      </ScrollView>
    </View>
  );
}

// ── TV Styles ────────────────────────────────────────────────────────────────
const tvStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg0,
    flexDirection: 'row',
  },

  // Sidebar
  sidebar: {
    width: 260,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    paddingTop: 32,
    gap: spacing.xl,
  },
  sidebarHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: spacing.lg,
  },
  sidebarLogo: {
    width: 28, height: 28, borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.25)',
    backgroundColor: colors.bg0,
  },
  sidebarLogoImg: { width: 40, height: 40, marginTop: -7, marginLeft: -7 },
  sidebarTitle: {
    fontSize: 20, fontWeight: '700', color: colors.text1, letterSpacing: -0.4,
  },
  categoryList: {
    flex: 1,
    paddingHorizontal: spacing.sm,
    gap: 2,
  },
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.lg,
  },
  categoryItemActive: {
    backgroundColor: colors.accentSoft,
  },
  catIcon: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: colors.bg2,
    alignItems: 'center', justifyContent: 'center',
  },
  catIconActive: {
    backgroundColor: colors.accent3,
  },
  categoryLabel: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.text2,
  },
  categoryLabelActive: {
    color: colors.text1,
    fontWeight: '600',
  },
  categorySub: {
    fontSize: 10.5,
    color: colors.text3,
    marginTop: 1,
  },

  sidebarFooter: {
    padding: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    gap: 8,
  },
  madeBy: { fontSize: 10, color: colors.text3, letterSpacing: 0.4 },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: colors.bg1,
    borderWidth: 1,
    borderColor: colors.border,
  },
  backBtnText: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.text2,
  },

  // Right panel
  panel: {
    flex: 1,
  },
  panelHeader: {
    paddingHorizontal: spacing.xxxl,
    paddingTop: 32,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  panelTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.text1,
    letterSpacing: -0.5,
  },
  panelSub: {
    fontSize: fontSize.sm,
    color: colors.text3,
    marginTop: 4,
  },
  panelContent: {
    padding: spacing.xxxl,
    paddingTop: spacing.xl,
    gap: 24,
    maxWidth: 640,
  },
});

// ── Mobile Styles ─────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg0 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 22,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  back: {
    width: 36, height: 36, borderRadius: radius.full,
    backgroundColor: colors.bg1, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 28, fontWeight: '600', color: colors.text1, letterSpacing: -0.6 },

  tabBar: { flexGrow: 0, marginTop: spacing.sm },
  tabBarInner: { paddingHorizontal: 22, gap: 8 },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 7, paddingLeft: 8, paddingRight: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.bg1, borderWidth: 1, borderColor: colors.border,
  },
  tabActive: { backgroundColor: colors.accentSoft, borderColor: 'rgba(167,139,250,0.4)' },
  tabIcon: {
    width: 26, height: 26, borderRadius: 8,
    backgroundColor: colors.bg2,
    alignItems: 'center', justifyContent: 'center',
  },
  tabIconActive: { backgroundColor: colors.accent3 },
  tabLabel: { fontSize: fontSize.xs, fontWeight: '600', color: colors.text2 },
  tabLabelActive: { color: colors.text1 },
  tabCaption: {
    fontSize: fontSize.xs, color: colors.text3,
    paddingHorizontal: 24, paddingTop: 10,
  },

  content: { flex: 1 },
  inner: {
    paddingHorizontal: 22,
    paddingBottom: 60,
    gap: 20,
    maxWidth: 600,
    alignSelf: 'center',
    width: '100%',
    paddingTop: 18,
  },

  // Card de status da conta
  accountCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: colors.bg1, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border,
    padding: 16,
  },
  accountLogo: {
    width: 44, height: 44, borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.25)',
    backgroundColor: colors.bg0,
  },
  accountLogoImg: { width: 64, height: 64, marginTop: -10, marginLeft: -10 },
  accountName: { fontSize: 15, fontWeight: '700', color: colors.text1, letterSpacing: 0.3 },
  accountVersion: { fontSize: 11, fontWeight: '500', color: colors.text3, letterSpacing: 0 },
  accountFacts: { fontSize: 12, color: colors.text2, marginTop: 3 },
  accountStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  accountStatusDot: { width: 7, height: 7, borderRadius: 4 },
  accountStatusText: { fontSize: 12, color: colors.text2 },

  group: { gap: spacing.sm },
  groupTitle: {
    fontSize: 11, fontWeight: '600', color: colors.text3,
    letterSpacing: 0.8, textTransform: 'uppercase', paddingLeft: 2,
  },
  groupBox: {
    backgroundColor: colors.bg1, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 13, paddingHorizontal: 14,
    borderBottomWidth: 1, borderBottomColor: colors.borderSoft,
  },
  // Contêiner tonal arredondado (anatomia de settings premium) em vez do
  // ícone solto — uma mudança, todas as linhas de todas as plataformas herdam.
  rowIcon: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: colors.bg2,
    alignItems: 'center', justifyContent: 'center',
  },
  rowLabel: { fontSize: 14, fontWeight: '500', color: colors.text1 },
  rowSub: { fontSize: fontSize.xs, color: colors.text3, marginTop: 2 },
  rowValueWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowValue: { fontSize: 12, color: colors.text2 },

  footer: { alignItems: 'center', paddingVertical: 20, gap: 8 },
  footerLogoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  footerLogoIcon: {
    width: 22, height: 22, borderRadius: 6,
    overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.25)',
    backgroundColor: colors.bg0,
  },
  footerLogoImg: { width: 32, height: 32, marginTop: -6, marginLeft: -6 },
  footerLogoText: { fontSize: 11, fontWeight: '600', color: colors.text3, letterSpacing: 0.4 },
  footerVersion: { fontSize: 10, color: colors.text3, letterSpacing: 0.4 },
  footerBy: { fontSize: 10, color: colors.text3, letterSpacing: 0.4, marginTop: 2 },
  textInput: {
    flex: 1,
    height: 38,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg2,
    paddingHorizontal: 12,
    fontSize: 13,
    color: colors.text1,
    marginLeft: 42, // alinha com o texto das linhas (ícone 30 + gap 12)
  },
});
