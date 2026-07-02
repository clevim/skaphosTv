// SettingsScreen.tsx
// Mobile: vertical scroll layout
// TV: two-panel (left sidebar with categories + right panel with settings)
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, ActivityIndicator, TextInput, Alert } from 'react-native';
import axios from 'axios';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store/useStore';
import TVFocusable from '../components/TVFocusable';
import { enrichLiveLogos } from '../utils/logoResolver';
import {
  checkOtaUpdate, reloadApp, fetchLatestRelease, isNewerVersion,
  downloadAndInstallApk,
} from '../utils/appUpdate';
import { APP_VERSION, VERSION_LABEL } from '../utils/version';
import { colors, spacing, fontSize, radius } from '../utils/theme';
import { IS_TV } from '../utils/tvDetect';

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
  const content = (
    <View style={styles.row}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon as any} size={16} color={colors.text2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {sub && <Text style={styles.rowSub}>{sub}</Text>}
      </View>
      {toggle && onToggle ? (
        <Switch
          value={on}
          onValueChange={onToggle}
          trackColor={{ true: colors.accent, false: colors.border }}
          thumbColor={colors.white}
        />
      ) : value ? (
        <View style={styles.rowValueWrap}>
          <Text style={[styles.rowValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
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
          <Text style={styles.rowLabel}>{label}</Text>
          {sub && <Text style={styles.rowSub}>{sub}</Text>}
        </View>
        <View style={styles.rowValueWrap}>
          <Text style={styles.rowValue}>{current.label}</Text>
          <Ionicons name="swap-horizontal-outline" size={12} color={colors.text3} />
        </View>
      </View>
    </TVFocusable>
  );
}

// ── LogoRefreshRow ──────────────────────────────────────────────────────────
// Busca sob demanda os logos faltantes de canais ao vivo (iptv-org, com cache).

function LogoRefreshRow() {
  const [state, setState] = useState<'idle' | 'running' | 'done'>('idle');
  const [count, setCount] = useState(0);

  const run = async () => {
    if (state === 'running') return;
    setState('running');
    try {
      const { channels, sources, appendChannels } = useStore.getState();
      let total = 0;
      for (const src of sources) {
        const candidates = channels.filter(c => c.sourceId === src.id && !c.logo);
        if (candidates.length === 0) continue;
        const updated = await enrichLiveLogos(candidates);
        const withLogo = updated.filter(c => c.logo);
        if (withLogo.length) { appendChannels(withLogo, [], src.id); total += withLogo.length; }
      }
      setCount(total);
      setState('done');
    } catch {
      setState('idle');
    }
  };

  const sub =
    state === 'running' ? 'Buscando no iptv-org…'
    : state === 'done'  ? `${count} logo${count !== 1 ? 's' : ''} adicionado${count !== 1 ? 's' : ''}`
    : 'Preenche logos faltantes dos canais ao vivo';

  return (
    <SettingsRow
      icon="images-outline"
      label="Atualizar logos dos canais"
      sub={sub}
      value={state === 'running' ? '…' : undefined}
      valueColor={state === 'done' ? colors.green : undefined}
      onPress={state === 'running' ? undefined : run}
    />
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
      const ota = await checkOtaUpdate();
      if (ota === 'ready') {
        setBusy(false);
        Alert.alert('Atualização pronta', 'Uma atualização foi baixada. Reiniciar o app agora para aplicar?', [
          { text: 'Depois', style: 'cancel', onPress: () => setSub('Atualização pendente — reinicie para aplicar') },
          { text: 'Reiniciar', onPress: () => reloadApp() },
        ]);
        return;
      }

      // 2) GitHub Release — APK (mudanças nativas)
      const rel = await fetchLatestRelease();
      if (rel && isNewerVersion(rel.version, APP_VERSION)) {
        setBusy(false);
        if (!rel.apkUrl) {
          setSub(`Nova versão v${rel.version} disponível no GitHub`);
          Alert.alert('Nova versão', `A v${rel.version} está disponível, mas sem APK anexado ao release.`);
          return;
        }
        Alert.alert('Nova versão disponível', `v${rel.version} requer atualização do app (APK). Baixar e instalar agora?`, [
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
                Alert.alert('Erro', 'Não foi possível baixar/instalar o APK.');
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

// ── XtreamSourceCard ────────────────────────────────────────────────────────

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

type CategoryKey = 'reproducao' | 'conta' | 'sistema';

const TV_CATEGORIES: { key: CategoryKey; label: string; icon: string }[] = [
  { key: 'reproducao', label: 'Reprodução',           icon: 'play-circle-outline' },
  { key: 'conta',      label: 'Conta e dispositivos', icon: 'person-circle-outline' },
  { key: 'sistema',    label: 'Sistema',              icon: 'settings-outline' },
];

// ── TV Panel content ────────────────────────────────────────────────────────

function TVPanel({
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
          <SettingsRow icon="play-outline"            label="Qualidade do streaming"  value="Auto · até 4K" />
          <SettingsRow icon="download-outline"         label="Qualidade dos downloads" value="HD" />
          <SettingsRow
            icon="sparkles-outline"
            label="Reprodução automática"
            toggle
            on={settings.autoPlay}
            onToggle={v => updateSettings({ autoPlay: v })}
          />
        </SettingsGroup>
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
        </SettingsGroup>
      </>
    );
  }

  if (category === 'conta') {
    return (
      <>
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
      <SettingsGroup title="Sistema">
        <SettingsRow icon="language-outline"           label="Idioma"   value={settings.language || 'pt-BR'} />
        <UpdateCheckRow />
        <LogoRefreshRow />
        <SettingsRow icon="information-circle-outline" label="Versão"   value={VERSION_LABEL} />
      </SettingsGroup>
      <SettingsGroup title="Integrações">
        <SettingsRow
          icon="film-outline"
          label="TMDB API Key"
          sub="Para enriquecer filmes e séries com metadata do TMDB"
          value={settings.tmdbApiKey ? '••••••••' : 'Não configurado'}
          valueColor={settings.tmdbApiKey ? colors.green : colors.text3}
        />
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
          <View style={tvStyles.categoryList}>
            {TV_CATEGORIES.map((cat, i) => {
              const active = cat.key === activeCategory;
              return (
                <TVFocusable
                  key={cat.key}
                  onPress={() => setActiveCategory(cat.key)}
                  style={[tvStyles.categoryItem, active && tvStyles.categoryItemActive]}
                  hasTVPreferredFocus={i === 0}
                >
                  {active && <View style={tvStyles.categoryActiveBar} />}
                  <Ionicons name={cat.icon as any} size={18} color={active ? colors.accent : colors.text3} />
                  <Text style={[tvStyles.categoryLabel, active && tvStyles.categoryLabelActive]}>
                    {cat.label}
                  </Text>
                </TVFocusable>
              );
            })}
          </View>

          <View style={tvStyles.sidebarFooter}>
            <Text style={tvStyles.madeBy}>made by clevs · v{APP_VERSION}</Text>
            <TVFocusable onPress={() => navigation.goBack()} style={tvStyles.backBtn}>
              <Ionicons name="chevron-back" size={14} color={colors.text2} />
              <Text style={tvStyles.backBtnText}>Voltar</Text>
            </TVFocusable>
          </View>
        </View>

        {/* Right panel */}
        <View style={tvStyles.panel}>
          <View style={tvStyles.panelHeader}>
            <Text style={tvStyles.panelTitle}>
              {TV_CATEGORIES.find(c => c.key === activeCategory)?.label}
            </Text>
          </View>
          <ScrollView contentContainerStyle={tvStyles.panelContent}>
            <TVPanel
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
  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TVFocusable onPress={() => navigation.goBack()} style={styles.back}>
          <Ionicons name="chevron-back" size={20} color={colors.text2} />
        </TVFocusable>
        <Text style={styles.title}>Ajustes</Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.inner}>
        <SettingsGroup title="Reprodução">
          <SettingsRow icon="play-outline"   label="Qualidade do streaming"  value="Auto · até 4K" />
          <SettingsRow icon="download-outline" label="Qualidade dos downloads" value="HD" />
          <SettingsRow
            icon="sparkles-outline"
            label="Reprodução automática"
            toggle on={settings.autoPlay}
            onToggle={v => updateSettings({ autoPlay: v })}
          />
        </SettingsGroup>

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
        </SettingsGroup>

        <SettingsGroup title="Fontes">
          <SettingsRow
            icon="globe-outline"
            label="Gerenciar listas"
            value={`${sources.length} lista${sources.length !== 1 ? 's' : ''}`}
            onPress={() => (navigation as any).navigate('Setup')}
          />
        </SettingsGroup>

        {sources.filter(s => s.type === 'xtream').map(s => (
          <XtreamSourceCard key={s.id} source={s} authInfo={authInfoMap[s.id]} />
        ))}

        {sources.filter(s => s.type === 'm3u').map(s => (
          <SettingsGroup key={s.id} title={s.name}>
            <SettingsRow icon="link-outline"   label="URL"    value={s.url ?? '—'} />
            <SettingsRow icon="layers-outline" label="Canais" value={`${s.channelCount ?? 0} itens`} />
          </SettingsGroup>
        ))}

        {sources.filter(s => s.type === 'jellyfin').map(s => (
          <JellyfinSourceCard key={s.id} source={s} />
        ))}

        <SettingsGroup title="Integrações">
          <View style={styles.row}>
            <View style={styles.rowIcon}>
              <Ionicons name="film-outline" size={16} color={colors.text2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>TMDB API Key</Text>
              <Text style={styles.rowSub}>Para metadata de filmes e séries</Text>
            </View>
          </View>
          <View style={[styles.row, { paddingTop: 4, paddingBottom: 12 }]}>
            <TextInput
              style={styles.tmdbInput}
              value={settings.tmdbApiKey}
              onChangeText={v => updateSettings({ tmdbApiKey: v.trim() })}
              placeholder="Cole sua API key aqui"
              placeholderTextColor={colors.text3}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        </SettingsGroup>

        <SettingsGroup title="Sistema">
          <SettingsRow icon="language-outline" label="Idioma" value={settings.language || 'pt-BR'} />
          <UpdateCheckRow />
          <LogoRefreshRow />
          <SettingsRow icon="information-circle-outline" label="Versão" value={VERSION_LABEL} />
        </SettingsGroup>

        <View style={styles.footer}>
          <View style={styles.footerLogoRow}>
            <View style={styles.footerLogoIcon}>
              <Ionicons name="tv" size={12} color={colors.accent} />
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
  categoryList: {
    flex: 1,
    paddingHorizontal: spacing.sm,
    gap: 2,
  },
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    position: 'relative',
  },
  categoryItemActive: {
    backgroundColor: colors.accentSoft,
  },
  categoryLabel: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.text3,
  },
  categoryLabelActive: {
    color: colors.accent,
    fontWeight: '600',
  },
  categoryActiveBar: {
    position: 'absolute',
    left: 0,
    top: 8,
    bottom: 8,
    width: 3,
    borderRadius: 2,
    backgroundColor: colors.accent,
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
  panelContent: {
    padding: spacing.xxxl,
    paddingTop: spacing.xl,
    gap: 20,
    maxWidth: 600,
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

  group: { gap: spacing.sm },
  groupTitle: {
    fontSize: 10, fontWeight: '600', color: colors.text3,
    letterSpacing: 0.6, textTransform: 'uppercase', paddingLeft: 2,
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
  rowIcon: { width: 24, alignItems: 'center' },
  rowLabel: { fontSize: 14, fontWeight: '500', color: colors.text1 },
  rowSub: { fontSize: fontSize.xs, color: colors.text3, marginTop: 2 },
  rowValueWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowValue: { fontSize: 12, color: colors.text2 },

  footer: { alignItems: 'center', paddingVertical: 20, gap: 8 },
  footerLogoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  footerLogoIcon: {
    width: 20, height: 20, borderRadius: 5,
    backgroundColor: 'rgba(167,139,250,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  footerLogoText: { fontSize: 11, fontWeight: '600', color: colors.text3, letterSpacing: 0.4 },
  footerVersion: { fontSize: 10, color: colors.text3, letterSpacing: 0.4 },
  footerBy: { fontSize: 10, color: colors.text3, letterSpacing: 0.4, marginTop: 2 },
  tmdbInput: {
    flex: 1,
    height: 38,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg2,
    paddingHorizontal: 12,
    fontSize: 13,
    color: colors.text1,
    marginLeft: 36,
  },
});
