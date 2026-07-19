import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, Pressable,
  ScrollView, ActivityIndicator, KeyboardAvoidingView,
  Platform, Modal, useWindowDimensions, Keyboard, BackHandler,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import axios from 'axios';
import { useStore, IPTVSource } from '../store/useStore';
import { useWatchProgress } from '../store/watchProgress';
import type { ChannelIndex } from '../store/channelIndex';
import { cleanGroupName } from '../utils/channelUtils';
import TVFocusable, { TVFocusableHandle } from '../components/TVFocusable';
import SonarLine from '../components/SonarLine';
import RemoteHints from '../components/RemoteHints';
import { parseM3U } from '../utils/m3uParser';
import { loadXtreamPhased, XtreamPhase } from '../utils/xtreamPhasedLoader';
import { enrichM3UChannels } from '../utils/xtreamEnricher';
import { normalizeHost as normalizeHostUtil } from '../utils/xtreamApi';
import { loadJellyfinContent } from '../utils/jellyfinLoader';
import { loadSourceChannels } from '../utils/sourceLoader';
import { APP_VERSION } from '../utils/version';
import { colors, spacing, fontSize, radius } from '../utils/theme';
import { IS_TV, IS_WEB } from '../utils/tvDetect';
import PairingSetupModal from '../components/PairingSetupModal';
import SendToTVModal from '../components/SendToTVModal';
import { showAlert } from '../components/AppAlert';
import { dlog } from '../utils/debugLog';
import type { PairingPayload } from '../utils/pairingServer';

type TabType = 'm3u' | 'xtream' | 'jellyfin';

// Conectores — cada tipo de fonte tem cor de identidade própria (soft, nunca
// bloco chapado berrante) usada no seletor e nos cards de fontes ativas.
const SOURCE_TYPES: { key: TabType; icon: string; tint: string; tintSoft: string; label: string; desc: string; hint: string }[] = [
  { key: 'xtream',   icon: 'server-outline',        tint: '#34d399',     tintSoft: 'rgba(52,211,153,0.14)', label: 'Xtream',   desc: 'Usuário e senha',
    hint: 'Servidor, usuário e senha da sua conta Xtream Codes API' },
  { key: 'm3u',      icon: 'document-text-outline', tint: colors.accent, tintSoft: colors.accentSoft,       label: 'M3U',      desc: 'URL da lista',
    hint: 'Aponte para uma lista M3U/M3U8 por URL' },
  { key: 'jellyfin', icon: 'play-circle-outline',   tint: '#38bdf8',     tintSoft: 'rgba(56,189,248,0.14)', label: 'Jellyfin', desc: 'Servidor de mídia',
    hint: 'Seu servidor de mídia pessoal, autenticado por Quick Connect' },
];

const typeTint     = (t: string) => SOURCE_TYPES.find(s => s.key === t)?.tint ?? colors.accent;
const typeTintSoft = (t: string) => SOURCE_TYPES.find(s => s.key === t)?.tintSoft ?? colors.accentSoft;

interface ConnectionResult {
  success: boolean;
  channels: number;
  vod: number;
  latency: number;
}


async function fetchWithRedirect(url: string, timeoutMs: number, log: (msg: string) => void): Promise<any> {
  let currentUrl = url;
  let attempts = 0;
  const maxRedirects = 5;

  while (attempts < maxRedirects) {
    log(`[${attempts + 1}] GET ${currentUrl}`);
    try {
      const res = await axios.get(currentUrl, {
        timeout: timeoutMs,
        maxRedirects: 0,
        validateStatus: (s) => s < 400 || [301, 302, 307, 308].includes(s),
        headers: { 'User-Agent': 'okhttp/4.9.0' },
      });

      log(`    → status ${res.status}`);

      if ([301, 302, 307, 308].includes(res.status)) {
        const location = res.headers?.location;
        if (!location) throw new Error('Redirect sem Location header');
        log(`    → redirect para: ${location}`);
        currentUrl = location.startsWith('http') ? location : (() => {
          const base = new URL(currentUrl);
          return `${base.protocol}//${base.host}${location}`;
        })();
        attempts++;
        continue;
      }

      log(`    → OK (${typeof res.data === 'string' ? res.data.length : JSON.stringify(res.data).length} bytes)`);
      return res;
    } catch (e: any) {
      const errMsg = e?.code || e?.message || String(e);
      log(`    → ERRO: ${errMsg}`);
      if (e?.response?.status) log(`    → HTTP ${e.response.status}`);
      if (e?.response?.headers?.location) {
        currentUrl = e.response.headers.location;
        attempts++;
        continue;
      }
      throw e;
    }
  }
  throw new Error('Muitos redirects');
}

interface PhaseStatus {
  label: string;
  count: number;
  state: 'waiting' | 'loading' | 'done' | 'error';
}

const PHASE_LABELS: Record<XtreamPhase, string> = {
  live:   'Ao Vivo',
  vod:    'Filmes',
  series: 'Séries',
};

const PHASE_ICONS: Record<XtreamPhase, string> = {
  live:   'radio',
  vod:    'film',
  series: 'tv',
};

export default function SetupScreen() {
  const navigation = useNavigation();
  const addSource             = useStore(s => s.addSource);
  const updateSource          = useStore(s => s.updateSource);
  const sources               = useStore(s => s.sources);
  const removeSource          = useStore(s => s.removeSource);
  const appendChannels        = useStore(s => s.appendChannels);
  const replaceSourceChannels = useStore(s => s.replaceSourceChannels);
  const channelIndex          = useStore(s => s.channelIndex);
  const refreshChannelIndex   = useStore(s => s.refreshChannelIndex);

  // Layout responsivo (TV): padding e largura do form proporcionais à tela,
  // evitando elementos grandes demais / apertados em resoluções diferentes.
  const { width: sw } = useWindowDimensions();
  const padH = Math.round(Math.min(48, Math.max(20, sw * 0.028)));
  const formMaxW = Math.round(Math.min(640, Math.max(420, sw * 0.46)));

  const [activeTab, setActiveTab] = useState<TabType>('xtream');
  const [isLoading, setIsLoadingLocal] = useState(false);
  const [connectionResult, setConnectionResult] = useState<ConnectionResult | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Progresso faseado (Xtream)
  const [phases, setPhases] = useState<Record<XtreamPhase, PhaseStatus>>({
    live:   { label: 'Ao Vivo', count: 0, state: 'waiting' },
    vod:    { label: 'Filmes',  count: 0, state: 'waiting' },
    series: { label: 'Séries',  count: 0, state: 'waiting' },
  });
  const [showPhases, setShowPhases] = useState(false);

  const [m3uUrl, setM3uUrl] = useState('');
  const [m3uName, setM3uName] = useState('');

  const [xHost, setXHost] = useState('http://');
  const [xUser, setXUser] = useState('');
  const [xPass, setXPass] = useState('');
  const [xName, setXName] = useState('');

  const [jHost, setJHost] = useState('http://');
  const [jName, setJName] = useState('');

  // Pareamento pelo celular (QR + servidor local efêmero) — só builds nativos
  const [showPairing, setShowPairing] = useState(false);
  // Scanner de QR (celular → TV) — só existe no layout mobile nativo
  const [showScanner, setShowScanner] = useState(false);
  // Mobile: fluxo em 2 passos — escolher o conector, depois o formulário
  const [mobileStep, setMobileStep] = useState<'pick' | 'form'>('pick');

  // Quick Connect
  const [showQC, setShowQC] = useState(false);
  const [qcCode, setQcCode] = useState('');
  const [qcStatus, setQcStatus] = useState<'loading' | 'waiting' | 'error'>('loading');
  const [qcError, setQcError] = useState('');
  const qcSecretRef = useRef('');
  const qcPollRef = useRef<NodeJS.Timeout | null>(null);


  // Refs para encadeamento de foco entre campos no TV
  const xHostRef = useRef<TextInput>(null);
  const xUserRef = useRef<TextInput>(null);
  const xPassRef = useRef<TextInput>(null);
  const xNameRef = useRef<TextInput>(null);
  const jHostRef = useRef<TextInput>(null);
  const jNameRef = useRef<TextInput>(null);
  const m3uUrlRef = useRef<TextInput>(null);
  const m3uNameRef = useRef<TextInput>(null);
  // Refs dos botões de envio — último campo manda o foco pro botão (não volta ao início)
  const xSubmitRef = useRef<TVFocusableHandle>(null);
  const jSubmitRef = useRef<TVFocusableHandle>(null);
  const m3uSubmitRef = useRef<TVFocusableHandle>(null);

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [reloadingIds, setReloadingIds] = useState<string[]>([]);
  const [categoryTarget, setCategoryTarget] = useState<IPTVSource | null>(null);

  const updatePhase = (phase: XtreamPhase, patch: Partial<PhaseStatus>) =>
    setPhases(prev => ({ ...prev, [phase]: { ...prev[phase], ...patch } }));

  // Fonte recebida do celular via QR: preenche o form (feedback visual) e dispara
  // o MESMO fluxo de validação/carga da digitação manual, com os valores direto
  // (o estado do form ainda não atualizou neste tick). Favoritos e assistidos
  // que vierem junto são mesclados na hora (união de favoritos; no progresso,
  // a entrada mais recente vence).
  const handlePairedSource = (p: PairingPayload) => {
    setShowPairing(false);
    if (p.extras) {
      if (Array.isArray(p.extras.favorites) && p.extras.favorites.length > 0) {
        const cur = useStore.getState().favorites;
        useStore.setState({ favorites: Array.from(new Set([...cur, ...p.extras.favorites])) });
        useStore.getState().saveToStorage();
      }
      if (p.extras.watch && typeof p.extras.watch === 'object') {
        useWatchProgress.getState().importEntries(p.extras.watch);
      }
    }
    if (p.type === 'xtream') {
      setActiveTab('xtream');
      setXHost(p.host ?? 'http://');
      setXUser(p.username ?? '');
      setXPass(p.password ?? '');
      setXName(p.name ?? '');
      loadXtream({ host: p.host ?? '', user: p.username ?? '', pass: p.password ?? '', name: p.name });
    } else {
      setActiveTab('m3u');
      setM3uUrl(p.url ?? '');
      setM3uName(p.name ?? '');
      loadAndSaveM3U({ url: p.url ?? '', name: p.name });
    }
  };

  const startEdit = useCallback((source: IPTVSource) => {
    if (source.type === 'xtream') {
      setActiveTab('xtream');
      setXHost(source.host ?? 'http://');
      setXUser(source.username ?? '');
      setXPass(source.password ?? '');
      setXName(source.name);
    } else if (source.type === 'jellyfin') {
      setActiveTab('jellyfin');
      setJHost(source.host ?? 'http://');
      setJName(source.name);
    } else {
      setActiveTab('m3u');
      setM3uUrl(source.url ?? '');
      setM3uName(source.name);
    }
    setEditingSourceId(source.id);
    setConnectionResult(null);
    setShowPhases(false);
    setMobileStep('form'); // no mobile, editar pula direto pro formulário
  }, []);

  // `override` = valores vindos do pareamento pelo celular (o estado do form
  // ainda não refletiu os setters); pareamento sempre cria fonte nova.
  const loadAndSaveM3U = async (override?: { url: string; name?: string }) => {
    const url = (override?.url ?? m3uUrl).trim();
    const name = (override?.name ?? m3uName).trim();
    const editingId = override ? null : editingSourceId;
    if (!url) { showAlert('Erro', 'Digite a URL da lista M3U'); return; }
    setIsLoadingLocal(true);
    setConnectionResult(null);
    const start = Date.now();
    try {
      const response = await fetchWithRedirect(url, 30000, () => {});
      const result = await parseM3U(response.data);
      if (result.channels.length === 0) throw new Error('Nenhum canal encontrado na lista');
      const latency = Date.now() - start;
      setConnectionResult({ success: true, channels: result.channels.length, vod: 0, latency });
      const sourceId = editingId ?? Date.now().toString();
      const source: IPTVSource = {
        id: sourceId,
        name: name || 'Minha Lista M3U',
        type: 'm3u',
        url,
        addedAt: Date.now(),
        channelCount: result.channels.length,
        epgUrl: result.tvgUrl,
      };
      // Primeira fonte = momento de ativação; a celebração aparece uma única vez
      const isFirstSource = !editingId && useStore.getState().sources.length === 0;
      if (editingId) updateSource(sourceId, source); else addSource(source);
      setEditingSourceId(null);
      replaceSourceChannels(sourceId, result.channels, result.groups);
      // Enriquece canais M3U com Xtream API em background (se URLs forem Xtream)
      enrichM3UChannels({
        channels: result.channels,
        onEnriched: (updated) => {
          useStore.getState().replaceSourceChannels(sourceId, updated, useStore.getState().groups);
        },
      });
      showAlert(
        isFirstSource ? 'Tudo pronto!' : 'Sucesso!',
        isFirstSource
          ? `${result.channels.length} canais te esperando. Bom mergulho.`
          : `${result.channels.length} canais carregados`,
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    } catch (e: any) {
      setConnectionResult(null);
      showAlert('Erro ao carregar lista', e.message || 'Verifique a URL e tente novamente');
    } finally {
      setIsLoadingLocal(false);
    }
  };

  const loadXtream = async (override?: { host: string; user: string; pass: string; name?: string }) => {
    const rawHost = override?.host ?? xHost;
    const rawUser = override?.user ?? xUser;
    const rawPass = override?.pass ?? xPass;
    const editingId = override ? null : editingSourceId;
    const isFirstSource = !editingId && useStore.getState().sources.length === 0;
    if (!rawHost.trim() || !rawUser.trim() || !rawPass.trim()) {
      showAlert('Erro', 'Preencha todos os campos');
      return;
    }

    const host = normalizeHostUtil(rawHost);
    const user = rawUser.trim();
    const pass = rawPass.trim();

    setIsLoadingLocal(true);
    setConnectionResult(null);
    setShowPhases(true);
    setPhases({
      live:   { label: 'Ao Vivo', count: 0, state: 'waiting' },
      vod:    { label: 'Filmes',  count: 0, state: 'waiting' },
      series: { label: 'Séries',  count: 0, state: 'waiting' },
    });

    // Teste de conectividade rápido antes das fases
    const testUrl = `${host}/player_api.php?username=${user}&password=${pass}`;
    try {
      const testRes = await axios.get(testUrl, {
        timeout: 15_000,
        headers: { 'User-Agent': 'okhttp/4.9.0' },
        validateStatus: () => true, // aceita qualquer status
      });
      if (testRes.status === 401 || testRes.data === false) {
        setIsLoadingLocal(false);
        showAlert('Credenciais inválidas', `O servidor respondeu mas rejeitou o login.\n\nURL testada:\n${testUrl}`);
        return;
      }
    } catch (e: any) {
      setIsLoadingLocal(false);
      const reason = e?.code === 'ECONNABORTED'
        ? 'Timeout — servidor demorou mais de 15s para responder'
        : e?.code
        ? `Erro de rede: ${e.code}`
        : e?.message ?? 'Sem resposta do servidor';
      showAlert('Servidor inacessível', `${reason}\n\nURL tentada:\n${testUrl}`);
      return;
    }

    const sourceId = editingId ?? Date.now().toString();
    const sourceName = (override?.name ?? xName).trim() || `Xtream: ${host}`;
    let totalLoaded = 0;
    let sourceAdded = false;
    const phaseErrors: string[] = [];

    await loadXtreamPhased({
      host,
      username: user,
      password: pass,
      onPhaseStart: (phase) => {
        updatePhase(phase, { state: 'loading', count: 0 });
      },
      onProgress: (phase, count) => {
        updatePhase(phase, { count });
      },
      onPhaseComplete: async (result) => {
        updatePhase(result.phase, { state: 'done', count: result.channels.length });
        totalLoaded += result.channels.length;

        if (result.channels.length === 0) return;

        const tSave = Date.now();
        if (!sourceAdded) {
          // Primeira fase com conteúdo: registra a fonte e substitui apenas os
          // canais DESTA fonte (preserva as demais fontes já adicionadas)
          sourceAdded = true;
          const xtreamSource: IPTVSource = {
            id: sourceId,
            name: sourceName,
            type: 'xtream',
            host,
            username: user,
            password: pass,
            addedAt: Date.now(),
            channelCount: 0, // atualizado ao final
          };
          if (editingId) updateSource(sourceId, xtreamSource); else addSource(xtreamSource);
          await replaceSourceChannels(sourceId, result.channels, result.groups);
        } else {
          // Fases seguintes: merge incremental, mantendo o vínculo com a fonte
          await appendChannels(result.channels, result.groups, sourceId);
        }
        dlog(`[perf][${result.phase}] persistência no store: ${Date.now() - tSave}ms`);
      },
      onError: (phase, message) => {
        updatePhase(phase, { state: 'error' });
        phaseErrors.push(`${PHASE_LABELS[phase]}: ${message}`);
        console.warn(`[Xtream] Fase ${phase} falhou:`, message);
      },
    });

    setIsLoadingLocal(false);

    if (totalLoaded === 0) {
      const detail = phaseErrors.length > 0
        ? phaseErrors.join('\n')
        : 'Servidor não retornou canais. Verifique host, usuário e senha.';
      showAlert('Falha na importação', detail);
      setShowPhases(false);
    } else {
      // Atualiza o channelCount da fonte com o total real carregado
      updateSource(sourceId, { channelCount: totalLoaded });
      // Força o flush do save (debounced) ANTES de avisar "Pronto!" — sem isso,
      // se o usuário fechar o app logo em seguida, o disco podia ficar com uma
      // versão mais velha (ex.: sem a fase de séries) e o próximo boot recarregava
      // tudo de novo silenciosamente achando o cache incompleto.
      const tFlush = Date.now();
      await useStore.getState().saveChannelsToStorage();
      dlog(`[perf][flush] save final no disco: ${Date.now() - tFlush}ms`);
      setEditingSourceId(null);
      setConnectionResult({ success: true, channels: totalLoaded, vod: 0, latency: 0 });
      showAlert(
        isFirstSource ? 'Tudo pronto!' : 'Pronto!',
        isFirstSource
          ? `${totalLoaded} itens te esperando. Bom mergulho.`
          : `${totalLoaded} itens carregados em 3 fases.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    }
  };

  const stopQCPoll = () => {
    if (qcPollRef.current) { clearInterval(qcPollRef.current); qcPollRef.current = null; }
  };

  const cancelQuickConnect = () => {
    stopQCPoll();
    setShowQC(false);
  };

  const startQuickConnect = async () => {
    const host = jHost.trim().replace(/\/$/, '');
    if (!host || host === 'http://' || host === 'https://') {
      showAlert('Erro', 'Preencha o endereço do servidor antes de usar o Quick Connect');
      return;
    }
    setShowQC(true);
    setQcCode('');
    setQcError('');
    setQcStatus('loading');
    stopQCPoll();

    const qcHeaders = {
      'X-Emby-Authorization': `MediaBrowser Client="SkaphosTV", Device="App", DeviceId="skaphostv-qc", Version="${APP_VERSION}"`,
    };

    try {
      const initRes = await axios.post(`${host}/QuickConnect/Initiate`, {}, { timeout: 10_000, headers: qcHeaders });
      const { Secret, Code } = initRes.data;
      qcSecretRef.current = Secret;
      setQcCode(Code);
      setQcStatus('waiting');

      qcPollRef.current = setInterval(async () => {
        try {
          const pollRes = await axios.get(`${host}/QuickConnect/Connect?Secret=${Secret}`, {
            timeout: 8_000, headers: qcHeaders,
          });
          if (!pollRes.data?.Authenticated) return;
          stopQCPoll();
          setQcStatus('loading');

          const authRes = await axios.post(`${host}/Users/AuthenticateWithQuickConnect`,
            { Secret },
            { timeout: 10_000, headers: qcHeaders },
          );
          const userId: string = authRes.data?.User?.Id;
          const accessToken: string = authRes.data?.AccessToken;
          if (!userId || !accessToken) throw new Error('Resposta de autenticação inválida');

          const infoRes = await axios.get(`${host}/System/Info`, {
            timeout: 10_000, headers: { 'X-Emby-Token': accessToken },
          });
          const serverName: string = infoRes.data?.ServerName ?? 'Jellyfin';
          const sourceName = jName.trim() || serverName;
          const sourceId = editingSourceId ?? Date.now().toString();

          const source: IPTVSource = {
            id: sourceId, name: sourceName, type: 'jellyfin',
            host, apiKey: accessToken, userId, serverName,
            addedAt: Date.now(), channelCount: 0,
          };
          if (editingSourceId) updateSource(sourceId, source); else addSource(source);
          setEditingSourceId(null);
          setShowQC(false);

          setIsLoadingLocal(true);
          try {
            const { channels: jfChannels, groups: jfGroups } = await loadJellyfinContent(host, accessToken, userId, sourceName);
            if (jfChannels.length > 0) {
              replaceSourceChannels(sourceId, jfChannels, jfGroups);
              updateSource(sourceId, { channelCount: jfChannels.length });
            }
            setConnectionResult({ success: true, channels: jfChannels.length, vod: 0, latency: 0 });
          } catch {
            setConnectionResult({ success: true, channels: 0, vod: 0, latency: 0 });
          } finally {
            setIsLoadingLocal(false);
          }

          showAlert('Jellyfin conectado!', `Servidor "${serverName}" adicionado com sucesso.`, [
            { text: 'OK', onPress: () => navigation.goBack() },
          ]);
        } catch (authErr: any) {
          stopQCPoll();
          setQcError(authErr?.message ?? 'Erro ao autenticar');
          setQcStatus('error');
        }
      }, 2000);
    } catch (err: any) {
      setQcError(err?.message ?? 'Não foi possível iniciar Quick Connect. Verifique o endereço do servidor.');
      setQcStatus('error');
    }
  };

  const deleteSource = (id: string, name: string) => {
    if (IS_WEB) {
      if (window.confirm(`Remover "${name}"?`)) {
        removeSource(id);
      }
      return;
    }
    setDeleteTarget({ id, name });
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    removeSource(deleteTarget.id);
    setDeleteTarget(null);
  };

  // Salva a correção manual de categoria de um grupo e reconstrói o índice —
  // sem isso a mudança não aparece nas abas até o próximo reload de canais.
  const saveGroupTypeOverride = (source: IPTVSource, group: string, type: 'live' | 'movies' | 'series' | null) => {
    const next = { ...(source.groupTypeOverrides ?? {}) };
    if (type) next[group] = type; else delete next[group];
    updateSource(source.id, { groupTypeOverrides: next });
    refreshChannelIndex();
  };

  // Recarrega os canais de uma fonte do zero, usando a conexão já salva.
  const reloadSource = async (source: IPTVSource) => {
    if (reloadingIds.includes(source.id)) return;
    setReloadingIds(prev => [...prev, source.id]);
    try {
      const { channels, groups } = await loadSourceChannels(source);
      if (channels.length > 0) {
        replaceSourceChannels(source.id, channels, groups);
        updateSource(source.id, { channelCount: channels.length });
      } else {
        showAlert('Nada carregado', `Não foi possível recarregar "${source.name}".`);
      }
    } catch {
      showAlert('Erro', `Falha ao recarregar "${source.name}". Verifique a conexão.`);
    } finally {
      setReloadingIds(prev => prev.filter(id => id !== source.id));
    }
  };

  // ─── Form section (shared between TV panels and mobile scroll) ───

  const xtreamForm = (
    <View style={IS_TV ? tvStyles.formGroup : styles.form}>
      <FormField
        label="SERVIDOR (HOST)"
        value={xHost}
        onChangeText={setXHost}
        placeholder="http://iptv.skaphos.tv:8080"
        keyboardType="url"
        returnKeyType="next"
        inputRef={xHostRef}
        onSubmitEditing={() => xUserRef.current?.focus()}
      />
      {IS_TV ? (
        // TV: stack fields vertically with more space
        <>
          <FormField label="USUÁRIO" value={xUser} onChangeText={setXUser} placeholder="seu_usuario" returnKeyType="next"
            inputRef={xUserRef} onSubmitEditing={() => xPassRef.current?.focus()} />
          <FormField
            label="SENHA"
            value={xPass}
            onChangeText={setXPass}
            placeholder="sua_senha"
            secureTextEntry={!showPassword}
            returnKeyType="next"
            inputRef={xPassRef}
            onSubmitEditing={() => xNameRef.current?.focus()}
            trailing={
              <Pressable onPress={() => setShowPassword(!showPassword)} style={{ padding: 4 }}>
                <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={IS_TV ? 22 : 16} color={colors.text3} />
              </Pressable>
            }
          />
          <FormField label="APELIDO (OPCIONAL)" value={xName} onChangeText={setXName} placeholder="Minha TV" returnKeyType="done"
            inputRef={xNameRef} onSubmitEditing={() => xSubmitRef.current?.focus()} />
        </>
      ) : (
        <>
          <View style={styles.formRow}>
            <View style={{ flex: 1 }}>
              <FormField
                label="USUÁRIO"
                value={xUser}
                onChangeText={setXUser}
                placeholder="seu_usuario"
                returnKeyType="next"
                inputRef={xUserRef}
                onSubmitEditing={() => xPassRef.current?.focus()}
              />
            </View>
            <View style={{ flex: 1 }}>
              <FormField
                label="SENHA"
                value={xPass}
                onChangeText={setXPass}
                placeholder="sua_senha"
                secureTextEntry={!showPassword}
                returnKeyType="next"
                inputRef={xPassRef}
                onSubmitEditing={() => xNameRef.current?.focus()}
                trailing={
                  <Pressable onPress={() => setShowPassword(!showPassword)} style={{ padding: 4 }}>
                    <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={16} color={colors.text3} />
                  </Pressable>
                }
              />
            </View>
          </View>
          <FormField
            label="APELIDO (OPCIONAL)"
            value={xName}
            onChangeText={setXName}
            placeholder="Ex: Minha TV, Casa..."
            returnKeyType="done"
            inputRef={xNameRef}
            onSubmitEditing={() => xSubmitRef.current?.focus()}
          />
        </>
      )}

      {connectionResult?.success && (
        <View style={styles.successBox}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark" size={14} color={colors.green} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.successTitle}>Conexão verificada</Text>
            <Text style={styles.successMeta}>
              {connectionResult.channels} CANAIS · {connectionResult.latency}ms
            </Text>
          </View>
        </View>
      )}

      <TVFocusable
        ref={xSubmitRef}
        onPress={isLoading ? undefined : loadXtream}
        style={[IS_TV ? tvStyles.submitBtn : styles.submitBtn, isLoading && styles.submitBtnDisabled]}
        focusStyle={styles.submitBtnFocused}
        hasTVPreferredFocus={false}
        borderRadius={IS_TV ? 12 : 14}
      >
        {isLoading ? (
          <ActivityIndicator color={colors.textInverse} />
        ) : (
          <>
            <Text style={[styles.submitText, IS_TV && tvStyles.submitText]}>
              {editingSourceId ? 'Atualizar' : 'Continuar'}
            </Text>
            <Ionicons name="chevron-forward" size={IS_TV ? 20 : 16} color={colors.textInverse} />
          </>
        )}
      </TVFocusable>

      {showPhases && (
        <PhasesPanel phases={phases} />
      )}
    </View>
  );

  const jellyfinForm = (
    <View style={IS_TV ? tvStyles.formGroup : styles.form}>
      <FormField
        label="ENDEREÇO DO SERVIDOR"
        value={jHost}
        onChangeText={setJHost}
        placeholder="http://192.168.1.100:8096"
        keyboardType="url"
        returnKeyType="next"
        inputRef={jHostRef}
        onSubmitEditing={() => jNameRef.current?.focus()}
      />
      <FormField
        label="APELIDO (OPCIONAL)"
        value={jName}
        onChangeText={setJName}
        placeholder="Ex: Casa, Servidor Pessoal..."
        returnKeyType="done"
        inputRef={jNameRef}
        onSubmitEditing={() => jSubmitRef.current?.focus()}
      />

      {connectionResult?.success && (
        <View style={styles.successBox}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark" size={14} color={colors.green} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.successTitle}>Servidor conectado</Text>
            <Text style={styles.successMeta}>Jellyfin autenticado com sucesso</Text>
          </View>
        </View>
      )}

      <TVFocusable
        ref={jSubmitRef}
        onPress={isLoading ? undefined : startQuickConnect}
        style={[IS_TV ? tvStyles.submitBtn : styles.submitBtn, isLoading && styles.submitBtnDisabled]}
        focusStyle={styles.submitBtnFocused}
        hasTVPreferredFocus={false}
        borderRadius={IS_TV ? 12 : 14}
      >
        {isLoading ? (
          <ActivityIndicator color={colors.textInverse} />
        ) : (
          <>
            <Ionicons name="phone-portrait-outline" size={IS_TV ? 20 : 16} color={colors.textInverse} />
            <Text style={[styles.submitText, IS_TV && tvStyles.submitText]}>
              {editingSourceId ? 'Reconectar com Quick Connect' : 'Conectar com Quick Connect'}
            </Text>
          </>
        )}
      </TVFocusable>

      <Text style={styles.qcFormHint}>
        Você verá um código para inserir no Jellyfin (Painel → Quick Connect, ou no app oficial).
      </Text>
    </View>
  );

  const m3uForm = (
    <View style={IS_TV ? tvStyles.formGroup : styles.form}>
      <FormField
        label="URL DA LISTA M3U"
        value={m3uUrl}
        onChangeText={setM3uUrl}
        placeholder="http://servidor.com/lista.m3u"
        keyboardType="url"
        returnKeyType="next"
        inputRef={m3uUrlRef}
        onSubmitEditing={() => m3uNameRef.current?.focus()}
      />
      <FormField
        label="NOME (OPCIONAL)"
        value={m3uName}
        onChangeText={setM3uName}
        placeholder="Minha Lista"
        returnKeyType="done"
        inputRef={m3uNameRef}
        onSubmitEditing={() => m3uSubmitRef.current?.focus()}
      />

      {connectionResult?.success && (
        <View style={styles.successBox}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark" size={14} color={colors.green} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.successTitle}>Conexão verificada</Text>
            <Text style={styles.successMeta}>
              {connectionResult.channels} CANAIS · {connectionResult.latency}ms
            </Text>
          </View>
        </View>
      )}

      <TVFocusable
        ref={m3uSubmitRef}
        onPress={isLoading ? undefined : loadAndSaveM3U}
        style={[IS_TV ? tvStyles.submitBtn : styles.submitBtn, isLoading && styles.submitBtnDisabled]}
        focusStyle={styles.submitBtnFocused}
        hasTVPreferredFocus={false}
        borderRadius={IS_TV ? 12 : 14}
      >
        {isLoading ? (
          <ActivityIndicator color={colors.textInverse} />
        ) : (
          <>
            <Text style={[styles.submitText, IS_TV && tvStyles.submitText]}>
              {editingSourceId ? 'Atualizar' : 'Continuar'}
            </Text>
            <Ionicons name="chevron-forward" size={IS_TV ? 20 : 16} color={colors.textInverse} />
          </>
        )}
      </TVFocusable>
    </View>
  );

  // ─── TV two-panel layout ─────────────────────────────────────────

  if (IS_TV) {
    const activeMeta = SOURCE_TYPES.find(t => t.key === activeTab)!;
    return (
      <View style={tvStyles.root}>
        <View style={tvStyles.main}>
          {/* Trilho esquerdo — conectores (mesma anatomia da sidebar dos Ajustes) */}
          <View style={tvStyles.rail}>
            <View style={tvStyles.railHeader}>
              <TVFocusable accessibilityLabel="Voltar"
                onPress={() => navigation.goBack()}
                style={tvStyles.backBtn}
                borderRadius={999}
              >
                <Ionicons name="chevron-back" size={20} color={colors.text2} />
              </TVFocusable>
              <Text style={tvStyles.railTitle}>Adicionar fonte</Text>
            </View>

            <View style={tvStyles.railList}>
              {SOURCE_TYPES.map((t, i) => {
                const active = activeTab === t.key;
                return (
                  <TVFocusable
                    key={t.key}
                    onPress={() => setActiveTab(t.key)}
                    style={[tvStyles.railItem, active && tvStyles.railItemActive]}
                    hasTVPreferredFocus={i === 0}
                    borderRadius={radius.lg}
                  >
                    <View style={[tvStyles.railIcon, { backgroundColor: t.tintSoft }]}>
                      <Ionicons name={t.icon as any} size={18} color={t.tint} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[tvStyles.railLabel, active && tvStyles.railLabelActive]}>{t.label}</Text>
                      <Text style={tvStyles.railDesc} numberOfLines={1}>{t.desc}</Text>
                    </View>
                  </TVFocusable>
                );
              })}

              {/* Sincronizar dispositivos — QR pro celular enviar fonte (+ favoritos
                  e assistidos, conforme o escopo). No web o modal explica a limitação. */}
              <TVFocusable
                onPress={() => setShowPairing(true)}
                style={tvStyles.pairCard}
                borderRadius={radius.lg}
              >
                <View style={[tvStyles.railIcon, { backgroundColor: colors.accentSoft }]}>
                  <Ionicons name="qr-code-outline" size={18} color={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={tvStyles.railLabel}>Sincronizar dispositivos</Text>
                  <Text style={tvStyles.railDesc} numberOfLines={1}>Receber do celular via QR code</Text>
                </View>
              </TVFocusable>
            </View>

            <View style={tvStyles.railFooter}>
              <Ionicons name="lock-closed" size={12} color={colors.text3} />
              <Text style={tvStyles.securityText}>Credenciais ficam só neste aparelho</Text>
            </View>
          </View>

          {/* Painel central — formulário do conector ativo */}
          <View style={tvStyles.panel}>
            <LinearGradient
              colors={['rgba(124,58,237,0.10)', 'rgba(10,8,16,0)']}
              style={tvStyles.panelGlow}
              pointerEvents="none"
            />
            <View style={[tvStyles.panelHeader, { paddingHorizontal: padH }]}>
              <Text style={tvStyles.panelTitle}>Conectar {activeMeta.label}</Text>
              <Text style={tvStyles.panelSub}>{activeMeta.hint}</Text>
            </View>
            <ScrollView
              contentContainerStyle={[tvStyles.panelContent, { paddingHorizontal: padH }]}
              showsVerticalScrollIndicator={false}
            >
              <View style={{ width: '100%', maxWidth: formMaxW }}>
                {activeTab === 'xtream' ? xtreamForm : activeTab === 'jellyfin' ? jellyfinForm : m3uForm}
              </View>
            </ScrollView>
          </View>

          {/* Coluna direita — fontes ativas (some quando vazia) */}
          {sources.length > 0 && (
            <>
              <View style={tvStyles.divider} />
              <ScrollView
                style={tvStyles.sourcesPanel}
                contentContainerStyle={[tvStyles.sourcesPanelInner, { paddingHorizontal: padH }]}
                showsVerticalScrollIndicator={false}
              >
                <View style={tvStyles.sectionHeader}>
                  <Text style={tvStyles.sectionTitle}>Fontes ativas</Text>
                  <SonarLine />
                </View>
                <View style={tvStyles.sourcesGroup}>
                  {sources.map(source => (
                    <View key={source.id} style={tvStyles.sourceCard}>
                      <View style={tvStyles.sourceCardTop}>
                        <View style={[tvStyles.sourceIcon, { backgroundColor: typeTintSoft(source.type) }]}>
                          <Ionicons name={source.type === 'xtream' ? 'server' : source.type === 'jellyfin' ? 'play-circle' : 'document-text'} size={20} color={typeTint(source.type)} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={tvStyles.sourceName} numberOfLines={1}>{source.name}</Text>
                          <Text style={tvStyles.sourceType} numberOfLines={1}>
                            {source.type === 'xtream' ? 'Xtream API' : source.type === 'jellyfin' ? `Jellyfin · ${source.serverName ?? source.host}` : 'Lista M3U'} · {source.channelCount || 0} itens
                          </Text>
                        </View>
                      </View>
                      {/* Ações numa linha própria — alvos de foco maiores no D-pad */}
                      <View style={tvStyles.sourceActions}>
                        <TVFocusable
                          accessibilityLabel="Recarregar fonte"
                          onPress={() => reloadSource(source)}
                          style={tvStyles.actionBtn}
                          borderRadius={10}
                        >
                          {reloadingIds.includes(source.id)
                            ? <ActivityIndicator size="small" color={colors.accent} />
                            : <Ionicons name="refresh-outline" size={18} color={colors.text2} />}
                        </TVFocusable>
                        <TVFocusable
                          accessibilityLabel="Categorias da fonte"
                          onPress={() => setCategoryTarget(source)}
                          style={tvStyles.actionBtn}
                          borderRadius={10}
                        >
                          <Ionicons name="pricetags-outline" size={18} color={colors.text2} />
                        </TVFocusable>
                        <TVFocusable
                          accessibilityLabel="Editar fonte"
                          onPress={() => startEdit(source)}
                          style={tvStyles.actionBtn}
                          borderRadius={10}
                        >
                          <Ionicons name="pencil-outline" size={18} color={colors.accent} />
                        </TVFocusable>
                        <TVFocusable
                          accessibilityLabel="Excluir fonte"
                          onPress={() => deleteSource(source.id, source.name)}
                          style={tvStyles.actionBtn}
                          borderRadius={10}
                        >
                          <Ionicons name="trash-outline" size={18} color={colors.red} />
                        </TVFocusable>
                      </View>
                    </View>
                  ))}
                </View>
              </ScrollView>
            </>
          )}
        </View>

        <RemoteHints
          hints={[
            { key: 'OK', label: 'Selecionar / Digitar' },
            { key: '↑↓←→', label: 'Navegar' },
            { key: '⬅', label: 'Voltar' },
          ]}
        />

        <QuickConnectModal
          visible={showQC}
          code={qcCode}
          status={qcStatus}
          error={qcError}
          onCancel={cancelQuickConnect}
        />

        <PairingSetupModal
          visible={showPairing}
          onClose={() => setShowPairing(false)}
          onSource={handlePairedSource}
        />

        {/* Delete confirmation modal */}
        <Modal visible={!!deleteTarget} transparent animationType="fade" onRequestClose={() => setDeleteTarget(null)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              <View style={styles.modalIconWrap}>
                <Ionicons name="trash-outline" size={22} color={colors.red} />
              </View>
              <Text style={styles.modalTitle}>Remover fonte</Text>
              <Text style={styles.modalDesc}>
                Remover <Text style={styles.modalName}>"{deleteTarget?.name}"</Text>?{'\n'}
                Os canais desta fonte serão removidos.
              </Text>
              <View style={styles.modalActions}>
                <TVFocusable onPress={() => setDeleteTarget(null)} style={[styles.modalBtn, styles.modalBtnCancel]} hasTVPreferredFocus>
                  <Text style={styles.modalBtnCancelText}>Cancelar</Text>
                </TVFocusable>
                <TVFocusable onPress={confirmDelete} style={[styles.modalBtn, styles.modalBtnDelete]}>
                  <Ionicons name="trash-outline" size={14} color={colors.white} />
                  <Text style={styles.modalBtnDeleteText}>Remover</Text>
                </TVFocusable>
              </View>
            </View>
          </View>
        </Modal>

        <CategoryOverrideModal
          source={categoryTarget}
          channelIndex={channelIndex}
          onClose={() => setCategoryTarget(null)}
          onChange={saveGroupTypeOverride}
        />
      </View>
    );
  }

  // ─── Mobile layout (unchanged) ───────────────────────────────────

  const activeMeta = SOURCE_TYPES.find(t => t.key === activeTab)!;
  const backFromForm = () => {
    setMobileStep('pick');
    setEditingSourceId(null);
    setConnectionResult(null);
    setShowPhases(false);
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Névoa violeta descendo do topo — mesma linguagem dos Ajustes */}
      <LinearGradient
        colors={['rgba(124,58,237,0.14)', 'rgba(10,8,16,0)']}
        style={styles.headerGlow}
        pointerEvents="none"
      />
      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>

        {/* Header — no passo do formulário, o voltar retorna à escolha */}
        <View style={styles.headerRow}>
          <TVFocusable
            accessibilityLabel="Voltar"
            onPress={mobileStep === 'form' ? backFromForm : () => navigation.goBack()}
            style={styles.backBtn}
            borderRadius={999}
          >
            <Ionicons name="chevron-back" size={20} color={colors.text2} />
          </TVFocusable>
          <View style={{ flex: 1 }} />
        </View>

        {mobileStep === 'pick' ? (
          <>
            {/* Passo 1 — escolher o conector */}
            <Text style={styles.mainTitle}>Adicionar fonte</Text>
            <Text style={styles.mainDesc}>De onde vem o seu conteúdo?</Text>

            <View style={styles.pickList}>
              {SOURCE_TYPES.map(t => (
                <TVFocusable
                  key={t.key}
                  onPress={() => { setActiveTab(t.key); setMobileStep('form'); }}
                  style={styles.pickCard}
                  borderRadius={16}
                >
                  <View style={[styles.typeIcon, { backgroundColor: t.tintSoft }]}>
                    <Ionicons name={t.icon as any} size={20} color={t.tint} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickLabel}>{t.label}</Text>
                    <Text style={styles.pickDesc} numberOfLines={2}>{t.hint}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.text3} />
                </TVFocusable>
              ))}

              {/* Celular → TV: leitor de QR dentro do app. Só faz sentido aqui —
                  este layout é exclusivo do mobile nativo (web e TV usam o de TV). */}
              <TVFocusable
                onPress={() => setShowScanner(true)}
                style={styles.sendTvCard}
                borderRadius={16}
              >
                <View style={[styles.typeIcon, { backgroundColor: colors.accentSoft }]}>
                  <Ionicons name="scan-outline" size={20} color={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pickLabel}>Sincronizar dispositivos</Text>
                  <Text style={styles.pickDesc} numberOfLines={2}>
                    Leia o QR code da TV e envie uma fonte daqui
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.text3} />
              </TVFocusable>
            </View>
          </>
        ) : (
          <>
            {/* Passo 2 — formulário do conector escolhido */}
            <Text style={styles.mainTitle}>
              {editingSourceId ? `Editar ${activeMeta.label}` : `Conectar ${activeMeta.label}`}
            </Text>
            <Text style={styles.mainDesc}>{activeMeta.hint}</Text>

            {activeTab === 'xtream' ? xtreamForm : activeTab === 'jellyfin' ? jellyfinForm : m3uForm}

            <View style={styles.securityNote}>
              <Ionicons name="lock-closed" size={12} color={colors.text3} />
              <Text style={styles.securityText}>Suas credenciais ficam apenas neste dispositivo</Text>
            </View>
          </>
        )}

        {/* Active sources — só no passo de escolha */}
        {mobileStep === 'pick' && sources.length > 0 && (
          <View style={styles.sourcesSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Fontes ativas</Text>
              <SonarLine />
            </View>
            {sources.map(source => (
              <View key={source.id} style={styles.sourceCard}>
                <View style={[styles.sourceIcon, { backgroundColor: typeTintSoft(source.type) }]}>
                  <Ionicons name={source.type === 'xtream' ? 'server' : source.type === 'jellyfin' ? 'play-circle' : 'document-text'} size={18} color={typeTint(source.type)} />
                </View>
                <View style={styles.sourceMeta}>
                  <Text style={styles.sourceName}>{source.name}</Text>
                  <Text style={styles.sourceType}>
                    {source.type === 'xtream' ? 'Xtream API' : source.type === 'jellyfin' ? `Jellyfin · ${source.serverName ?? source.host}` : 'Lista M3U'} · {source.channelCount || 0} itens
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Recarregar fonte"
                  hitSlop={5}
                  onPress={() => reloadSource(source)}
                  style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.6 }]}
                >
                  {reloadingIds.includes(source.id)
                    ? <ActivityIndicator size="small" color={colors.accent} />
                    : <Ionicons name="refresh-outline" size={18} color={colors.text2} />}
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Categorias da fonte"
                  hitSlop={5}
                  onPress={() => setCategoryTarget(source)}
                  style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.6 }]}
                >
                  <Ionicons name="pricetags-outline" size={18} color={colors.text2} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Editar fonte"
                  hitSlop={5}
                  onPress={() => startEdit(source)}
                  style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.6 }]}
                >
                  <Ionicons name="pencil-outline" size={18} color={colors.accent} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Excluir fonte"
                  hitSlop={5}
                  onPress={() => deleteSource(source.id, source.name)}
                  style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.6 }]}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.red} />
                </Pressable>
              </View>
            ))}
          </View>
        )}

      </ScrollView>

      <QuickConnectModal
        visible={showQC}
        code={qcCode}
        status={qcStatus}
        error={qcError}
        onCancel={cancelQuickConnect}
      />

      {/* Celular → TV: escaneia o QR da TV e envia uma fonte deste aparelho */}
      <SendToTVModal
        visible={showScanner}
        onClose={() => setShowScanner(false)}
      />

      {/* Delete confirmation modal */}
      <Modal visible={!!deleteTarget} transparent animationType="fade" onRequestClose={() => setDeleteTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalIconWrap}>
              <Ionicons name="trash-outline" size={22} color={colors.red} />
            </View>
            <Text style={styles.modalTitle}>Remover fonte</Text>
            <Text style={styles.modalDesc}>
              Remover <Text style={styles.modalName}>"{deleteTarget?.name}"</Text>?{'\n'}
              Os canais desta fonte serão removidos.
            </Text>
            <View style={styles.modalActions}>
              <TVFocusable onPress={() => setDeleteTarget(null)} style={[styles.modalBtn, styles.modalBtnCancel]}>
                <Text style={styles.modalBtnCancelText}>Cancelar</Text>
              </TVFocusable>
              <TVFocusable onPress={confirmDelete} style={[styles.modalBtn, styles.modalBtnDelete]}>
                <Ionicons name="trash-outline" size={14} color={colors.white} />
                <Text style={styles.modalBtnDeleteText}>Remover</Text>
              </TVFocusable>
            </View>
          </View>
        </View>
      </Modal>

      <CategoryOverrideModal
        source={categoryTarget}
        channelIndex={channelIndex}
        onClose={() => setCategoryTarget(null)}
        onChange={saveGroupTypeOverride}
      />
    </KeyboardAvoidingView>
  );
}

// ─── PhasesPanel ─────────────────────────────────────────────────

function PhasesPanel({ phases }: { phases: Record<XtreamPhase, PhaseStatus> }) {
  const order: XtreamPhase[] = ['live', 'vod', 'series'];
  return (
    <View style={ppStyles.container}>
      <Text style={ppStyles.title}>Importando em fases</Text>
      {order.map(phase => {
        const p = phases[phase];
        const icon = PHASE_ICONS[phase] as any;
        const isDone    = p.state === 'done';
        const isLoading = p.state === 'loading';
        const isError   = p.state === 'error';
        return (
          <View key={phase} style={ppStyles.row}>
            <View style={[ppStyles.iconWrap,
              isDone    && ppStyles.iconDone,
              isLoading && ppStyles.iconLoading,
              isError   && ppStyles.iconError,
            ]}>
              {isLoading ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Ionicons
                  name={isDone ? 'checkmark' : isError ? 'close' : icon}
                  size={16}
                  color={isDone ? colors.green : isError ? colors.red : colors.text3}
                />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[ppStyles.label, isDone && ppStyles.labelDone]}>
                {PHASE_LABELS[phase]}
              </Text>
              {(isLoading || isDone) && (
                <Text style={ppStyles.count}>
                  {isDone ? `${p.count.toLocaleString()} itens` : `${p.count.toLocaleString()} carregando…`}
                </Text>
              )}
              {isError && <Text style={ppStyles.error}>Falhou — continuando…</Text>}
            </View>
            {isDone && (
              <View style={ppStyles.badge}>
                <Text style={ppStyles.badgeText}>OK</Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const ppStyles = StyleSheet.create({
  container: {
    backgroundColor: colors.bg1,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 10,
  },
  title: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text3,
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 999,
    backgroundColor: colors.bg2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconDone:    { borderColor: colors.green,  backgroundColor: 'rgba(34,197,94,0.12)' },
  iconLoading: { borderColor: colors.accent, backgroundColor: 'rgba(167,139,250,0.12)' },
  iconError:   { borderColor: colors.red,    backgroundColor: 'rgba(239,68,68,0.12)' },
  label:    { fontSize: 13, fontWeight: '500', color: colors.text2 },
  labelDone:{ color: colors.text1 },
  count:    { fontSize: 11, color: colors.text3, marginTop: 1 },
  error:    { fontSize: 11, color: colors.red,   marginTop: 1 },
  badge: {
    backgroundColor: 'rgba(34,197,94,0.15)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: { fontSize: 10, color: colors.green, fontWeight: '700' },
});

// ─── CategoryOverrideModal ────────────────────────────────────────
// Corrige manualmente o tipo (Ao Vivo/Filme/Série) de cada grupo de UMA fonte —
// pra listas M3U de outros provedores que a heurística automática (detectType)
// não classifica bem. Some sozinho se a fonte ainda não tem canais carregados.

const TYPE_OPTIONS: { key: 'live' | 'movies' | 'series'; label: string }[] = [
  { key: 'live',   label: 'Ao Vivo' },
  { key: 'movies', label: 'Filme'   },
  { key: 'series', label: 'Série'   },
];

function CategoryOverrideModal({ source, channelIndex, onClose, onChange }: {
  source: IPTVSource | null;
  channelIndex: ChannelIndex | null;
  onClose: () => void;
  onChange: (source: IPTVSource, group: string, type: 'live' | 'movies' | 'series' | null) => void;
}) {
  if (!source || !channelIndex) return null;

  // Grupos desta fonte + o tipo já resolvido (auto ou override) de cada um —
  // usa o primeiro canal do grupo como amostra representativa.
  const rows: { group: string; type: 'live' | 'movies' | 'series'; overridden: boolean }[] = [];
  for (const [group, chans] of channelIndex.byGroup) {
    const sample = chans.find(c => c.sourceId === source.id);
    if (!sample) continue;
    const overridden = !!source.groupTypeOverrides?.[group];
    const type = overridden
      ? source.groupTypeOverrides![group]
      : (sample.streamType === 'live' ? 'live' : sample.streamType === 'movie' ? 'movies' : sample.streamType === 'series' ? 'series' : undefined) ?? 'live';
    rows.push({ group, type, overridden });
  }
  rows.sort((a, b) => cleanGroupName(a.group).localeCompare(cleanGroupName(b.group)));

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalBox, coStyles.box]}>
          <Text style={styles.modalTitle}>Corrigir categorias</Text>
          <Text style={styles.modalDesc}>
            {source.name} — toque num tipo pra corrigir manualmente um grupo
            classificado errado. "Auto" volta a deixar a detecção automática decidir.
          </Text>
          <ScrollView style={coStyles.list}>
            {rows.length === 0 && (
              <Text style={coStyles.empty}>Nenhum grupo carregado ainda pra esta fonte.</Text>
            )}
            {rows.map(({ group, type, overridden }) => (
              <View key={group} style={coStyles.row}>
                <Text style={coStyles.groupName} numberOfLines={1}>{cleanGroupName(group)}</Text>
                <View style={coStyles.options}>
                  {TYPE_OPTIONS.map(opt => (
                    <TVFocusable
                      key={opt.key}
                      onPress={() => onChange(source, group, opt.key === type && overridden ? null : opt.key)}
                      style={[coStyles.optionBtn, type === opt.key && coStyles.optionBtnActive]}
                      focusStyle={type === opt.key ? coStyles.optionBtnActiveFocused : undefined}
                      borderRadius={6}
                    >
                      <Text style={[coStyles.optionText, type === opt.key && coStyles.optionTextActive]}>
                        {opt.label}
                      </Text>
                    </TVFocusable>
                  ))}
                  {overridden && (
                    <TVFocusable accessibilityLabel="Restaurar categoria" onPress={() => onChange(source, group, null)} style={coStyles.resetBtn} hitSlop={11} borderRadius={6}>
                      <Ionicons name="refresh-outline" size={14} color={colors.text3} />
                    </TVFocusable>
                  )}
                </View>
              </View>
            ))}
          </ScrollView>
          <View style={styles.modalActions}>
            <TVFocusable onPress={onClose} style={[styles.modalBtn, styles.modalBtnCancel]} hasTVPreferredFocus>
              <Text style={styles.modalBtnCancelText}>Fechar</Text>
            </TVFocusable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const coStyles = StyleSheet.create({
  box: { maxHeight: '80%' },
  list: { marginTop: spacing.sm, marginBottom: spacing.sm },
  empty: { fontSize: 13, color: colors.text3, textAlign: 'center', paddingVertical: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  groupName: { flex: 1, fontSize: 13, color: colors.text1 },
  options: { flexDirection: 'row', gap: 4 },
  optionBtn: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radius.sm,
    backgroundColor: colors.bg2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionBtnActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  // Foco CLAREIA o chip ativo — o FOCUS_BG translúcido padrão o escurecia
  optionBtnActiveFocused: { backgroundColor: colors.accent2, borderColor: colors.accent2 },
  optionText: { fontSize: 11, color: colors.text3, fontWeight: '600' },
  optionTextActive: { color: colors.textInverse },
  resetBtn: {
    width: 26, height: 26, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.bg2, borderRadius: radius.sm,
  },
});

// ─── FormField ───────────────────────────────────────────────────

function FormField({ label, value, onChangeText, placeholder, secureTextEntry, keyboardType, trailing, returnKeyType, inputRef: externalInputRef, onSubmitEditing }: {
  label: string; value: string; onChangeText: (t: string) => void; placeholder: string;
  secureTextEntry?: boolean; keyboardType?: any; trailing?: React.ReactNode; returnKeyType?: any;
  inputRef?: React.RefObject<TextInput>;
  onSubmitEditing?: () => void;
}) {
  const [isFocused, setIsFocused] = useState(false);
  const internalRef = useRef<TextInput>(null);
  const inputRef = externalInputRef ?? internalRef;
  const containerRef = useRef<TVFocusableHandle>(null);
  // Flag para não refocar o container quando o blur foi causado por onSubmitEditing
  const isSubmittingRef = useRef(false);

  const handleTVPress = useCallback(() => {
    inputRef.current?.focus();
  }, [inputRef]);

  const handleSubmitEditing = useCallback(() => {
    isSubmittingRef.current = true;
    onSubmitEditing?.();
    setTimeout(() => { isSubmittingRef.current = false; }, 150);
  }, [onSubmitEditing]);

  const handleBlurTV = useCallback(() => {
    setIsFocused(false);
    // Devolve o foco ao TVFocusable container para não pular para o topo da tela
    if (!isSubmittingRef.current) {
      containerRef.current?.focus();
    }
  }, []);

  // TV: enquanto digita, o "voltar" fecha o teclado e devolve o foco a ESTE
  // campo (via blur → handleBlurTV), em vez de sair da tela. O primeiro voltar
  // o IME consome sozinho (fecha o teclado sem avisar o JS) — por isso também
  // ouvimos keyboardDidHide, que dispara o mesmo blur e realinha o foco na hora.
  useEffect(() => {
    if (!IS_TV || !isFocused) return;
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      if (!isSubmittingRef.current) inputRef.current?.blur();
    });
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      inputRef.current?.blur();
      return true; // consome — não navega pra fora da tela
    });
    return () => { hide.remove(); back.remove(); };
  }, [isFocused, inputRef]);

  if (IS_TV) {
    return (
      <TVFocusable
        ref={containerRef}
        onPress={handleTVPress}
        style={[tvStyles.fieldWrap, isFocused && tvStyles.fieldWrapFocused]}
        borderRadius={12}
      >
        <Text style={tvStyles.fieldLabel}>{label}</Text>
        <View style={tvStyles.fieldRow}>
          <TextInput
            ref={inputRef}
            style={[tvStyles.fieldInput, isFocused && tvStyles.fieldInputFocused]}
            placeholder={placeholder}
            placeholderTextColor={colors.text3}
            value={value}
            onChangeText={onChangeText}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry={secureTextEntry}
            keyboardType={keyboardType}
            returnKeyType={returnKeyType}
            blurOnSubmit={returnKeyType === 'done'}
            onSubmitEditing={handleSubmitEditing}
            onFocus={() => setIsFocused(true)}
            onBlur={handleBlurTV}
          />
          {trailing}
        </View>
        {isFocused && (
          <View style={tvStyles.cursorHint}>
            <Ionicons name="pencil" size={12} color={colors.accent} />
            <Text style={tvStyles.cursorHintText}>digitando</Text>
          </View>
        )}
      </TVFocusable>
    );
  }

  return (
    <View style={[styles.fieldWrap, isFocused && styles.fieldWrapFocused]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldRow}>
        <TextInput
          ref={inputRef}
          style={styles.fieldInput}
          placeholder={placeholder}
          placeholderTextColor={colors.text3}
          value={value}
          onChangeText={onChangeText}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          returnKeyType={returnKeyType}
          blurOnSubmit={returnKeyType === 'done'}
          onSubmitEditing={onSubmitEditing}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
        />
        {trailing}
      </View>
    </View>
  );
}

// ─── Mobile styles ────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg0 },
  headerGlow: { position: 'absolute', top: 0, left: 0, right: 0, height: 220 },
  content: { flex: 1 },
  contentInner: { padding: spacing.xl, gap: spacing.lg, maxWidth: 480, alignSelf: 'center', width: '100%' },

  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { width: 36, height: 36, borderRadius: radius.full, backgroundColor: 'rgba(20,17,28,0.72)', borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  skipText: { fontSize: 12, color: colors.text2, textDecorationLine: 'underline' },

  mainTitle: { fontSize: fontSize.xxl, fontWeight: '700', color: colors.text1, letterSpacing: -0.7, lineHeight: 34, marginTop: spacing.xxl },
  mainDesc: { fontSize: 13.5, color: colors.text2, lineHeight: 20 },

  // Passo 1 — lista de conectores (cards horizontais com identidade por serviço)
  pickList: { gap: 10, marginTop: spacing.md },
  pickCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 14, paddingHorizontal: 14,
    borderRadius: 16, backgroundColor: colors.bg1,
  },
  typeIcon: {
    width: 42, height: 42, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
  },
  pickLabel: { fontSize: 15, fontWeight: '600', color: colors.text1 },
  pickDesc: { fontSize: fontSize.xs, color: colors.text3, marginTop: 2, lineHeight: 16 },
  // Celular → TV: borda tracejada sinaliza "caminho alternativo"
  sendTvCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 14, paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(167,139,250,0.4)',
  },

  optionsBox: { backgroundColor: colors.bg1, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },

  form: { gap: spacing.md },
  formRow: { flexDirection: 'row', gap: spacing.md },

  // Field — mobile (filled: superfície tonal sem borda; a borda só acende no foco)
  fieldWrap: {
    borderWidth: 1, borderColor: 'transparent',
    borderRadius: radius.lg, padding: spacing.md, paddingTop: 10,
    backgroundColor: colors.bg1,
  },
  fieldWrapFocused: {
    borderColor: colors.accent,
    backgroundColor: colors.bg2,
    shadowColor: colors.accent,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  fieldLabel: { fontSize: 10.5, color: colors.text3, letterSpacing: 0.6, fontWeight: '500', marginBottom: 2 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  fieldInput: { flex: 1, fontSize: fontSize.md, color: colors.text1, padding: 0 },

  successBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: 'rgba(34,197,94,0.08)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.25)' },
  successIcon: { width: 28, height: 28, borderRadius: radius.full, backgroundColor: 'rgba(34,197,94,0.15)', alignItems: 'center', justifyContent: 'center' },
  successTitle: { fontSize: 12.5, color: colors.text1, fontWeight: '600' },
  successMeta: { fontSize: 10, color: colors.text3, letterSpacing: 0.3, marginTop: 2 },

  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.accent, borderRadius: radius.lg, height: 50, marginTop: spacing.sm },
  submitBtnDisabled: { opacity: 0.6 },
  // Foco CLAREIA o botão accent — o FOCUS_BG translúcido padrão o escurecia
  submitBtnFocused: { backgroundColor: colors.accent2 },
  submitText: { color: colors.textInverse, fontSize: fontSize.md, fontWeight: '600', letterSpacing: -0.2 },

  securityNote: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  securityText: { fontSize: 11, color: colors.text3 },

  sourcesSection: { gap: spacing.md, marginTop: spacing.lg, paddingTop: spacing.lg, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 2 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: colors.text1, letterSpacing: -0.2 },
  sourceCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.bg1, borderRadius: 16, padding: spacing.md },
  sourceIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sourceMeta: { flex: 1 },
  sourceName: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text1 },
  sourceType: { fontSize: fontSize.xs, color: colors.text2, marginTop: 2 },
  deleteBtn: { padding: 10 },

  debugBox: { backgroundColor: colors.bg0, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, padding: 12, marginTop: spacing.sm },
  debugHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  debugTitle: { fontSize: 12, fontWeight: '700', color: colors.accent },
  debugClear: { fontSize: 11, color: colors.text3 },
  debugScroll: { maxHeight: 300 },
  debugText: { fontSize: 11, color: colors.text2, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', lineHeight: 18 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  modalBox: { width: '100%', maxWidth: 420, backgroundColor: colors.bg1, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.xl, gap: spacing.md },
  modalIconWrap: { width: 44, height: 44, borderRadius: radius.full, backgroundColor: 'rgba(239,68,68,0.12)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)', alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  modalTitle: { fontSize: fontSize.lg, fontWeight: '600', color: colors.text1 },
  modalDesc: { fontSize: 13.5, color: colors.text2, lineHeight: 20 },
  modalName: { color: colors.text1, fontWeight: '500' },
  modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  modalBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, borderRadius: radius.md },
  modalBtnCancel: { backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.border },
  modalBtnCancelText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text2 },
  modalBtnDelete: { backgroundColor: colors.red },
  modalBtnDeleteText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.white },

  qcBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 50, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.accent, backgroundColor: 'transparent', marginTop: 4 },
  qcBtnText: { color: colors.accent, fontSize: fontSize.md, fontWeight: '600' },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  orLine: { flex: 1, height: 1, backgroundColor: colors.border },
  orLabel: { fontSize: 10, color: colors.text3, letterSpacing: 0.3 },
  qcFormHint: { fontSize: 12, color: colors.text3, lineHeight: 17, marginTop: 10, textAlign: 'center' },
});

// ─── TV styles ────────────────────────────────────────────────────

const tvStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg0 },
  main: { flex: 1, flexDirection: 'row' },

  // Trilho esquerdo — conectores (mesma anatomia da sidebar dos Ajustes)
  rail: {
    width: 264,
    borderRightWidth: 1, borderRightColor: colors.borderSoft,
    paddingTop: 28,
    gap: spacing.xl,
  },
  railHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: spacing.lg,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 999,
    backgroundColor: colors.bg1, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  railTitle: { fontSize: 19, fontWeight: '700', color: colors.text1, letterSpacing: -0.4 },
  railList: { flex: 1, paddingHorizontal: spacing.sm, gap: 4 },
  railItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 12,
    borderRadius: radius.lg,
  },
  railItemActive: { backgroundColor: colors.accentSoft },
  railIcon: {
    width: 38, height: 38, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  railLabel: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text2 },
  railLabelActive: { color: colors.text1 },
  railDesc: { fontSize: 10.5, color: colors.text3, marginTop: 2 },
  // "Pelo celular" — caminho alternativo: borda tracejada, não card de tipo
  pairCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 12,
    marginTop: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(167,139,250,0.4)',
  },
  railFooter: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    padding: spacing.lg,
    borderTopWidth: 1, borderTopColor: colors.borderSoft,
  },

  // Painel central — formulário
  panel: { flex: 3 },
  panelGlow: { position: 'absolute', top: 0, left: 0, right: 0, height: 160 },
  panelHeader: { paddingTop: 28, paddingBottom: spacing.lg },
  panelTitle: { fontSize: 24, fontWeight: '700', color: colors.text1, letterSpacing: -0.5 },
  panelSub: { fontSize: fontSize.sm, color: colors.text3, marginTop: 4, lineHeight: 19 },
  panelContent: { paddingBottom: 24 },

  // Coluna direita — fontes ativas
  divider: { width: 1, backgroundColor: colors.borderSoft },
  sourcesPanel: { flex: 2 },
  sourcesPanelInner: { paddingVertical: 28 },

  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: colors.text1, letterSpacing: -0.2 },

  formGroup: { gap: 12 },

  // Field — TV (filled: superfície tonal; a borda acende no foco de digitação)
  fieldWrap: {
    borderWidth: 1.5, borderColor: 'transparent',
    borderRadius: 14, padding: 12,
    backgroundColor: colors.bg1,
  },
  fieldWrapFocused: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(167,139,250,0.06)',
    shadowColor: colors.accent,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  fieldLabel: {
    fontSize: 11, color: colors.text3, letterSpacing: 0.8, fontWeight: '600', marginBottom: 6,
  },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fieldInput: {
    flex: 1, fontSize: 16, color: colors.text1, padding: 0,
    minHeight: 24,
  },
  fieldInputFocused: { color: colors.text1 },
  cursorHint: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginTop: 6,
  },
  cursorHintText: { fontSize: 11, color: colors.accent, letterSpacing: 0.3 },

  // Submit — TV
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: colors.accent,
    borderRadius: 12, height: 48, marginTop: 6,
  },
  submitText: { color: colors.textInverse, fontSize: 15, fontWeight: '700', letterSpacing: -0.3 },

  // Options — TV
  optionsBox: {
    backgroundColor: colors.bg1, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },

  // Sources — TV: identidade em cima, ações numa linha própria (alvos maiores)
  sourcesGroup: { gap: 10 },
  sourceCard: {
    backgroundColor: colors.bg1, borderRadius: 16,
    padding: 12, gap: 10,
  },
  sourceCardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sourceIcon: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  sourceName: { fontSize: 14, fontWeight: '600', color: colors.text1 },
  sourceType: { fontSize: 12, color: colors.text2, marginTop: 3 },
  sourceActions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flex: 1, height: 38, borderRadius: 10,
    backgroundColor: colors.bg2,
    alignItems: 'center', justifyContent: 'center',
  },

  securityText: { fontSize: 12, color: colors.text3 },

  qcBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 48, borderRadius: 12, borderWidth: 1.5, borderColor: colors.accent, backgroundColor: 'transparent' },
  qcBtnText: { color: colors.accent, fontSize: 15, fontWeight: '700' },
});

// ─── QuickConnectModal ───────────────────────────────────────────

function QuickConnectModal({
  visible, code, status, error, onCancel,
}: {
  visible: boolean;
  code: string;
  status: 'loading' | 'waiting' | 'error';
  error: string;
  onCancel: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={qcStyles.overlay}>
        <View style={qcStyles.sheet}>
          <View style={qcStyles.header}>
            <Ionicons name="phone-portrait-outline" size={IS_TV ? 22 : 18} color={colors.accent} />
            <Text style={qcStyles.title}>Quick Connect</Text>
          </View>

          <View style={qcStyles.body}>
            {status === 'loading' && (
              <>
                <ActivityIndicator color={colors.accent} size="large" />
                <Text style={qcStyles.desc}>Conectando ao servidor...</Text>
              </>
            )}

            {status === 'waiting' && (
              <>
                <View style={qcStyles.codeBox}>
                  <Text style={qcStyles.code}>{code}</Text>
                </View>
                <Text style={qcStyles.desc}>
                  No app Jellyfin no seu celular ou computador,{'\n'}
                  vá em <Text style={qcStyles.bold}>Painel → Quick Connect</Text>{'\n'}
                  e insira este código.
                </Text>
                <View style={qcStyles.pulseRow}>
                  <ActivityIndicator color={colors.text3} size="small" />
                  <Text style={qcStyles.waiting}>Aguardando aprovação...</Text>
                </View>
              </>
            )}

            {status === 'error' && (
              <>
                <Ionicons name="alert-circle-outline" size={IS_TV ? 52 : 40} color={colors.red} />
                <Text style={qcStyles.errorText}>{error || 'Erro ao iniciar Quick Connect'}</Text>
                <Text style={qcStyles.desc}>Verifique se o servidor está acessível e tente novamente.</Text>
              </>
            )}
          </View>

          <View style={qcStyles.actions}>
            <TVFocusable onPress={onCancel} style={qcStyles.cancelBtn} hasTVPreferredFocus>
              <Text style={qcStyles.cancelText}>Cancelar</Text>
            </TVFocusable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const qcStyles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center', alignItems: 'center',
  },
  sheet: {
    width: IS_TV ? 500 : 340,
    backgroundColor: colors.bg1,
    borderRadius: radius.xl,
    borderWidth: 1, borderColor: colors.border,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: IS_TV ? 28 : 20,
    paddingVertical: IS_TV ? 20 : 16,
    borderBottomWidth: 1, borderBottomColor: colors.borderSoft,
  },
  title: { fontSize: IS_TV ? 19 : 15, fontWeight: '600', color: colors.text1 },
  body: {
    alignItems: 'center',
    padding: IS_TV ? 40 : 28,
    gap: IS_TV ? 20 : 14,
  },
  codeBox: {
    backgroundColor: colors.bg2,
    borderRadius: radius.lg,
    borderWidth: 1.5, borderColor: colors.accent,
    paddingHorizontal: IS_TV ? 40 : 28,
    paddingVertical: IS_TV ? 18 : 14,
  },
  code: {
    fontSize: IS_TV ? 56 : 42,
    fontWeight: '700',
    color: colors.text1,
    letterSpacing: IS_TV ? 14 : 10,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  desc: {
    fontSize: IS_TV ? 15 : 13, color: colors.text2,
    textAlign: 'center', lineHeight: IS_TV ? 24 : 20,
  },
  bold: { color: colors.text1, fontWeight: '600' },
  pulseRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  waiting: { fontSize: IS_TV ? 14 : 12, color: colors.text3 },
  errorText: { fontSize: IS_TV ? 16 : 14, color: colors.red, fontWeight: '600', textAlign: 'center' },
  actions: {
    padding: IS_TV ? 20 : 14,
    borderTopWidth: 1, borderTopColor: colors.borderSoft,
  },
  cancelBtn: {
    height: IS_TV ? 56 : 44,
    borderRadius: radius.md,
    backgroundColor: colors.bg2,
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  cancelText: { fontSize: IS_TV ? 16 : 13, fontWeight: '500', color: colors.text2 },
});
