import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, Pressable,
  ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView,
  Platform, Modal, Share,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useStore, IPTVSource } from '../store/useStore';
import TVFocusable, { TVFocusableHandle } from '../components/TVFocusable';
import RemoteHints from '../components/RemoteHints';
import { parseM3U } from '../utils/m3uParser';
import { loadXtreamPhased, XtreamPhase } from '../utils/xtreamPhasedLoader';
import { enrichM3UChannels } from '../utils/xtreamEnricher';
import { normalizeHost as normalizeHostUtil } from '../utils/xtreamApi';
import { loadJellyfinContent } from '../utils/jellyfinLoader';
import { colors, spacing, fontSize, radius } from '../utils/theme';
import { IS_TV } from '../utils/tvDetect';

type TabType = 'm3u' | 'xtream' | 'jellyfin';

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
  const { addSource, updateSource, sources, removeSource, setChannels, appendChannels } = useStore();

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
  const [jApiKey, setJApiKey] = useState('');
  const [jName, setJName] = useState('');

  // Quick Connect
  const [showQC, setShowQC] = useState(false);
  const [qcCode, setQcCode] = useState('');
  const [qcStatus, setQcStatus] = useState<'loading' | 'waiting' | 'error'>('loading');
  const [qcError, setQcError] = useState('');
  const qcSecretRef = useRef('');
  const qcPollRef = useRef<NodeJS.Timeout | null>(null);

  // Logs Jellyfin
  type JfStepState = 'waiting' | 'loading' | 'done' | 'error';
  interface JfStep { label: string; url: string; state: JfStepState; detail: string }
  const [jfSteps, setJfSteps] = useState<JfStep[]>([]);
  const [showJfLogs, setShowJfLogs] = useState(false);
  const jfRawLog = useRef<string[]>([]);

  const jfLog = (msg: string) => { jfRawLog.current.push(msg); };
  const updateJfStep = (idx: number, patch: Partial<JfStep>) =>
    setJfSteps(prev => prev.map((s, i) => i === idx ? { ...s, ...patch } : s));

  // Refs para encadeamento de foco entre campos no TV
  const xHostRef = useRef<TextInput>(null);
  const xUserRef = useRef<TextInput>(null);
  const xPassRef = useRef<TextInput>(null);
  const xNameRef = useRef<TextInput>(null);
  const jHostRef = useRef<TextInput>(null);
  const jApiKeyRef = useRef<TextInput>(null);
  const jNameRef = useRef<TextInput>(null);

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);

  const updatePhase = (phase: XtreamPhase, patch: Partial<PhaseStatus>) =>
    setPhases(prev => ({ ...prev, [phase]: { ...prev[phase], ...patch } }));

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
      setJApiKey(source.apiKey ?? '');
      setJName(source.name);
    } else {
      setActiveTab('m3u');
      setM3uUrl(source.url ?? '');
      setM3uName(source.name);
    }
    setEditingSourceId(source.id);
    setConnectionResult(null);
    setShowPhases(false);
  }, []);

  const loadAndSaveM3U = async () => {
    if (!m3uUrl.trim()) { Alert.alert('Erro', 'Digite a URL da lista M3U'); return; }
    setIsLoadingLocal(true);
    setConnectionResult(null);
    const start = Date.now();
    try {
      const response = await fetchWithRedirect(m3uUrl.trim(), 30000, () => {});
      const result = parseM3U(response.data);
      if (result.channels.length === 0) throw new Error('Nenhum canal encontrado na lista');
      const latency = Date.now() - start;
      setConnectionResult({ success: true, channels: result.channels.length, vod: 0, latency });
      // Regra: uma lista por vez — remove anterior(es) antes de adicionar
      sources.forEach(s => removeSource(s.id));
      const source: IPTVSource = {
        id: editingSourceId ?? Date.now().toString(),
        name: m3uName.trim() || 'Minha Lista M3U',
        type: 'm3u',
        url: m3uUrl.trim(),
        addedAt: Date.now(),
        channelCount: result.channels.length,
      };
      addSource(source);
      setEditingSourceId(null);
      setChannels(result.channels, result.groups);
      // Enriquece canais M3U com Xtream API em background (se URLs forem Xtream)
      enrichM3UChannels({
        channels: result.channels,
        onEnriched: (updated) => {
          const { groups } = useStore.getState();
          useStore.getState().setChannels(updated, groups);
        },
      });
      Alert.alert('Sucesso!', `${result.channels.length} canais carregados`, [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch (e: any) {
      setConnectionResult(null);
      Alert.alert('Erro ao carregar lista', e.message || 'Verifique a URL e tente novamente');
    } finally {
      setIsLoadingLocal(false);
    }
  };

  const loadXtream = async () => {
    if (!xHost.trim() || !xUser.trim() || !xPass.trim()) {
      Alert.alert('Erro', 'Preencha todos os campos');
      return;
    }

    const host = normalizeHostUtil(xHost);
    const user = xUser.trim();
    const pass = xPass.trim();

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
        Alert.alert('Credenciais inválidas', `O servidor respondeu mas rejeitou o login.\n\nURL testada:\n${testUrl}`);
        return;
      }
    } catch (e: any) {
      setIsLoadingLocal(false);
      const reason = e?.code === 'ECONNABORTED'
        ? 'Timeout — servidor demorou mais de 15s para responder'
        : e?.code
        ? `Erro de rede: ${e.code}`
        : e?.message ?? 'Sem resposta do servidor';
      Alert.alert('Servidor inacessível', `${reason}\n\nURL tentada:\n${testUrl}`);
      return;
    }

    const sourceId = editingSourceId ?? Date.now().toString();
    const sourceName = xName.trim() || `Xtream: ${host}`;
    let totalLoaded = 0;
    let sourceAdded = false;
    const phaseErrors: string[] = [];

    // Regra: uma lista por vez — remove anteriores antes de adicionar
    sources.forEach(s => removeSource(s.id));

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
      onPhaseComplete: (result) => {
        updatePhase(result.phase, { state: 'done', count: result.channels.length });
        totalLoaded += result.channels.length;

        if (result.channels.length === 0) return;

        if (!sourceAdded) {
          // Primeira fase com conteúdo: registra a fonte e substitui canais anteriores
          sourceAdded = true;
          addSource({
            id: sourceId,
            name: sourceName,
            type: 'xtream',
            host,
            username: user,
            password: pass,
            addedAt: Date.now(),
            channelCount: 0, // atualizado ao final
          });
          setChannels(result.channels, result.groups);
        } else {
          // Fases seguintes: merge incremental
          appendChannels(result.channels, result.groups);
        }
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
      Alert.alert('Falha na importação', detail);
      setShowPhases(false);
    } else {
      // Atualiza o channelCount da fonte com o total real carregado
      updateSource(sourceId, { channelCount: totalLoaded });
      setEditingSourceId(null);
      setConnectionResult({ success: true, channels: totalLoaded, vod: 0, latency: 0 });
      Alert.alert(
        'Pronto!',
        `${totalLoaded} itens carregados em 3 fases.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    }
  };

  const connectJellyfin = async () => {
    const host = jHost.trim().replace(/\/$/, '');
    const apiKey = jApiKey.trim();
    if (!host || host === 'http://' || !apiKey) {
      Alert.alert('Erro', 'Preencha o endereço do servidor e a chave de API');
      return;
    }

    const steps: JfStep[] = [
      { label: 'Ping do servidor',    url: `${host}/System/Ping`, state: 'waiting', detail: '' },
      { label: 'Validar chave de API', url: `${host}/Users`,       state: 'waiting', detail: '' },
      { label: 'Info do servidor',     url: `${host}/System/Info`, state: 'waiting', detail: '' },
    ];
    jfRawLog.current = [];
    setJfSteps(steps);
    setShowJfLogs(true);
    setIsLoadingLocal(true);
    setConnectionResult(null);

    const reqHeaders = {
      'X-Emby-Token': apiKey,
      'Authorization': `MediaBrowser Client="SkaphosTV", Device="App", DeviceId="skaphostv-app", Version="1.0.0", Token="${apiKey}"`,
    };

    const doStep = async (idx: number, fn: () => Promise<any>): Promise<any> => {
      updateJfStep(idx, { state: 'loading', detail: '' });
      jfLog(`[${idx + 1}] GET ${steps[idx].url}`);
      try {
        const res = await fn();
        const detail = `HTTP ${res.status}`;
        updateJfStep(idx, { state: 'done', detail });
        jfLog(`    ✓ ${detail}`);
        return res;
      } catch (e: any) {
        const status = e?.response?.status;
        const body = e?.response?.data;
        const detail = status
          ? `HTTP ${status}${body ? ' — ' + (typeof body === 'string' ? body.slice(0, 120) : JSON.stringify(body).slice(0, 120)) : ''}`
          : e?.code === 'ECONNABORTED' ? 'Timeout (10s)' : e?.message ?? 'Erro desconhecido';
        updateJfStep(idx, { state: 'error', detail });
        jfLog(`    ✗ ${detail}`);
        throw e;
      }
    };

    try {
      await doStep(0, () => axios.get(`${host}/System/Ping`, { timeout: 10_000, headers: reqHeaders }));
      const userRes = await doStep(1, () => axios.get(`${host}/Users`, { timeout: 10_000, headers: reqHeaders }));
      const users: any[] = Array.isArray(userRes.data) ? userRes.data : [];
      if (users.length === 0) throw new Error('Nenhum usuário encontrado no servidor');
      const userId: string = (users.find(u => u.Policy?.IsAdministrator) ?? users[0]).Id;
      jfLog(`    → userId: ${userId}`);
      const infoRes = await doStep(2, () => axios.get(`${host}/System/Info`, { timeout: 10_000, headers: reqHeaders }));
      const serverName: string = infoRes.data.ServerName ?? 'Jellyfin';
      jfLog(`    → serverName: ${serverName}`);

      const sourceName = jName.trim() || serverName;
      const sourceId = editingSourceId ?? Date.now().toString();
      sources.filter(s => s.id !== sourceId).forEach(s => { if (s.type === 'jellyfin') removeSource(s.id); });
      const source: IPTVSource = {
        id: sourceId, name: sourceName, type: 'jellyfin',
        host, apiKey, userId, serverName,
        addedAt: Date.now(), channelCount: 0,
      };
      if (editingSourceId) updateSource(sourceId, source); else addSource(source);
      setEditingSourceId(null);

      // Carrega conteúdo imediatamente e adiciona à lista de canais
      try {
        const { channels: jfChannels, groups: jfGroups } = await loadJellyfinContent(host, apiKey, userId, sourceName);
        if (jfChannels.length > 0) {
          appendChannels(jfChannels, jfGroups);
          updateSource(sourceId, { channelCount: jfChannels.length });
        }
        setConnectionResult({ success: true, channels: jfChannels.length, vod: 0, latency: 0 });
      } catch {
        setConnectionResult({ success: true, channels: 0, vod: 0, latency: 0 });
      }

      Alert.alert('Jellyfin conectado!', `Servidor "${serverName}" adicionado com sucesso.`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch {
      // erro já registrado no passo que falhou
    } finally {
      setIsLoadingLocal(false);
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
      Alert.alert('Erro', 'Preencha o endereço do servidor antes de usar o Quick Connect');
      return;
    }
    setShowQC(true);
    setQcCode('');
    setQcError('');
    setQcStatus('loading');
    stopQCPoll();

    const qcHeaders = {
      'X-Emby-Authorization': 'MediaBrowser Client="SkaphosTV", Device="App", DeviceId="skaphostv-qc", Version="1.0.0"',
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

          sources.filter(s => s.id !== sourceId).forEach(s => { if (s.type === 'jellyfin') removeSource(s.id); });
          const source: IPTVSource = {
            id: sourceId, name: sourceName, type: 'jellyfin',
            host, apiKey: accessToken, userId, serverName,
            addedAt: Date.now(), channelCount: 0,
          };
          if (editingSourceId) updateSource(sourceId, source); else addSource(source);
          setEditingSourceId(null);
          setJApiKey(accessToken);
          setShowQC(false);

          setIsLoadingLocal(true);
          try {
            const { channels: jfChannels, groups: jfGroups } = await loadJellyfinContent(host, accessToken, userId, sourceName);
            if (jfChannels.length > 0) {
              appendChannels(jfChannels, jfGroups);
              updateSource(sourceId, { channelCount: jfChannels.length });
            }
            setConnectionResult({ success: true, channels: jfChannels.length, vod: 0, latency: 0 });
          } catch {
            setConnectionResult({ success: true, channels: 0, vod: 0, latency: 0 });
          } finally {
            setIsLoadingLocal(false);
          }

          Alert.alert('Jellyfin conectado!', `Servidor "${serverName}" adicionado com sucesso.`, [
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
    if (Platform.OS === 'web') {
      if (window.confirm(`Remover "${name}"?`)) {
        removeSource(id);
        if (sources.filter(s => s.id !== id).length === 0) setChannels([], []);
      }
      return;
    }
    setDeleteTarget({ id, name });
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    removeSource(deleteTarget.id);
    if (sources.filter(s => s.id !== deleteTarget.id).length === 0) setChannels([], []);
    setDeleteTarget(null);
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
          <FormField label="USUARIO" value={xUser} onChangeText={setXUser} placeholder="seu_usuario" returnKeyType="next"
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
            inputRef={xNameRef} />
        </>
      ) : (
        <>
          <View style={styles.formRow}>
            <View style={{ flex: 1 }}>
              <FormField label="USUARIO" value={xUser} onChangeText={setXUser} placeholder="seu_usuario" returnKeyType="next" />
            </View>
            <View style={{ flex: 1 }}>
              <FormField
                label="SENHA"
                value={xPass}
                onChangeText={setXPass}
                placeholder="sua_senha"
                secureTextEntry={!showPassword}
                returnKeyType="next"
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
          />
        </>
      )}

      {connectionResult?.success && (
        <View style={styles.successBox}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark" size={14} color="#22c55e" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.successTitle}>Conexao verificada</Text>
            <Text style={styles.successMeta}>
              {connectionResult.channels} CANAIS · {connectionResult.latency}ms
            </Text>
          </View>
        </View>
      )}

      <TVFocusable
        onPress={isLoading ? undefined : loadXtream}
        style={[IS_TV ? tvStyles.submitBtn : styles.submitBtn, isLoading && styles.submitBtnDisabled]}
        hasTVPreferredFocus={false}
        borderRadius={IS_TV ? 12 : 14}
      >
        {isLoading ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <>
            <Text style={[styles.submitText, IS_TV && tvStyles.submitText]}>
              {editingSourceId ? 'Atualizar' : 'Continuar'}
            </Text>
            <Ionicons name="chevron-forward" size={IS_TV ? 20 : 16} color={colors.white} />
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
        onSubmitEditing={() => jApiKeyRef.current?.focus()}
      />
      <FormField
        label="CHAVE DE API"
        value={jApiKey}
        onChangeText={setJApiKey}
        placeholder="Cole sua API Key do Jellyfin"
        returnKeyType="next"
        inputRef={jApiKeyRef}
        onSubmitEditing={() => jNameRef.current?.focus()}
      />
      <FormField
        label="APELIDO (OPCIONAL)"
        value={jName}
        onChangeText={setJName}
        placeholder="Ex: Casa, Servidor Pessoal..."
        returnKeyType="done"
        inputRef={jNameRef}
      />

      {/* Quick Connect — alternativa sem precisar digitar a API Key */}
      <TVFocusable
        onPress={isLoading ? undefined : startQuickConnect}
        style={IS_TV ? tvStyles.qcBtn : styles.qcBtn}
        borderRadius={IS_TV ? 12 : 14}
      >
        <Ionicons name="phone-portrait-outline" size={IS_TV ? 22 : 18} color={colors.accent} />
        <Text style={IS_TV ? tvStyles.qcBtnText : styles.qcBtnText}>Conectar com Quick Connect</Text>
      </TVFocusable>

      <View style={styles.orRow}>
        <View style={styles.orLine} />
        <Text style={styles.orLabel}>ou use a chave de API abaixo</Text>
        <View style={styles.orLine} />
      </View>

      {connectionResult?.success && (
        <View style={styles.successBox}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark" size={14} color="#22c55e" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.successTitle}>Servidor conectado</Text>
            <Text style={styles.successMeta}>Jellyfin autenticado com sucesso</Text>
          </View>
        </View>
      )}

      <TVFocusable
        onPress={isLoading ? undefined : connectJellyfin}
        style={[IS_TV ? tvStyles.submitBtn : styles.submitBtn, isLoading && styles.submitBtnDisabled]}
        hasTVPreferredFocus={false}
        borderRadius={IS_TV ? 12 : 14}
      >
        {isLoading ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <>
            <Text style={[styles.submitText, IS_TV && tvStyles.submitText]}>
              {editingSourceId ? 'Atualizar' : 'Verificar e Conectar'}
            </Text>
            <Ionicons name="chevron-forward" size={IS_TV ? 20 : 16} color={colors.white} />
          </>
        )}
      </TVFocusable>

      {showJfLogs && <JellyfinLogsPanel steps={jfSteps} rawLog={jfRawLog} />}
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
      />
      <FormField
        label="NOME (OPCIONAL)"
        value={m3uName}
        onChangeText={setM3uName}
        placeholder="Minha Lista"
        returnKeyType="done"
      />

      {connectionResult?.success && (
        <View style={styles.successBox}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark" size={14} color="#22c55e" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.successTitle}>Conexao verificada</Text>
            <Text style={styles.successMeta}>
              {connectionResult.channels} CANAIS · {connectionResult.latency}ms
            </Text>
          </View>
        </View>
      )}

      <TVFocusable
        onPress={isLoading ? undefined : loadAndSaveM3U}
        style={[IS_TV ? tvStyles.submitBtn : styles.submitBtn, isLoading && styles.submitBtnDisabled]}
        hasTVPreferredFocus={false}
        borderRadius={IS_TV ? 12 : 14}
      >
        {isLoading ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <>
            <Text style={[styles.submitText, IS_TV && tvStyles.submitText]}>
              {editingSourceId ? 'Atualizar' : 'Continuar'}
            </Text>
            <Ionicons name="chevron-forward" size={IS_TV ? 20 : 16} color={colors.white} />
          </>
        )}
      </TVFocusable>
    </View>
  );

  // ─── TV two-panel layout ─────────────────────────────────────────

  if (IS_TV) {
    return (
      <View style={tvStyles.root}>
        {/* Header bar */}
        <View style={tvStyles.header}>
          <TVFocusable
            onPress={() => navigation.goBack()}
            style={tvStyles.backBtn}
            hasTVPreferredFocus
            borderRadius={999}
          >
            <Ionicons name="chevron-back" size={26} color={colors.text2} />
          </TVFocusable>
          <View style={tvStyles.headerTitles}>
            <Text style={tvStyles.mainTitle}>Conecte sua lista IPTV</Text>
            <Text style={tvStyles.mainDesc}>
              Conta <Text style={{ color: colors.text1 }}>Xtream Codes API</Text> ou{' '}
              <Text style={{ color: colors.text1 }}>lista M3U/M3U8</Text>.
            </Text>
          </View>
        </View>

        {/* Tab switcher */}
        <View style={tvStyles.tabContainer}>
          <TVFocusable
            onPress={() => setActiveTab('xtream')}
            style={[tvStyles.tab, activeTab === 'xtream' && tvStyles.tabActive]}
            borderRadius={10}
          >
            <Ionicons name="server-outline" size={20} color={activeTab === 'xtream' ? colors.accent : colors.text3} />
            <Text style={[tvStyles.tabText, activeTab === 'xtream' && tvStyles.tabTextActive]}>Xtream API</Text>
          </TVFocusable>
          <TVFocusable
            onPress={() => setActiveTab('m3u')}
            style={[tvStyles.tab, activeTab === 'm3u' && tvStyles.tabActive]}
            borderRadius={10}
          >
            <Ionicons name="document-text-outline" size={20} color={activeTab === 'm3u' ? colors.accent : colors.text3} />
            <Text style={[tvStyles.tabText, activeTab === 'm3u' && tvStyles.tabTextActive]}>Lista M3U / URL</Text>
          </TVFocusable>
          <TVFocusable
            onPress={() => setActiveTab('jellyfin')}
            style={[tvStyles.tab, activeTab === 'jellyfin' && tvStyles.tabActive]}
            borderRadius={10}
          >
            <Ionicons name="play-circle-outline" size={20} color={activeTab === 'jellyfin' ? colors.accent : colors.text3} />
            <Text style={[tvStyles.tabText, activeTab === 'jellyfin' && tvStyles.tabTextActive]}>Jellyfin</Text>
          </TVFocusable>
        </View>

        {/* Two-panel body */}
        <View style={tvStyles.body}>
          {/* Left panel — form */}
          <ScrollView
            style={tvStyles.leftPanel}
            contentContainerStyle={tvStyles.leftPanelInner}
            showsVerticalScrollIndicator={false}
          >
            {activeTab === 'xtream' ? xtreamForm : activeTab === 'jellyfin' ? jellyfinForm : m3uForm}
          </ScrollView>

          {/* Divider */}
          <View style={tvStyles.divider} />

          {/* Right panel — options + sources */}
          <ScrollView
            style={tvStyles.rightPanel}
            contentContainerStyle={tvStyles.rightPanelInner}
            showsVerticalScrollIndicator={false}
          >
            {sources.length > 0 && (
              <>
                <Text style={[tvStyles.panelLabel, { marginTop: 28 }]}>FONTES ATIVAS</Text>
                <View style={tvStyles.sourcesGroup}>
                  {sources.map(source => (
                    <View key={source.id} style={tvStyles.sourceCard}>
                      <View style={[tvStyles.sourceIcon, source.type === 'xtream' ? styles.sourceIconXtream : source.type === 'jellyfin' ? styles.sourceIconJellyfin : styles.sourceIconM3U]}>
                        <Ionicons name={source.type === 'xtream' ? 'server' : source.type === 'jellyfin' ? 'play-circle' : 'document-text'} size={20} color={colors.white} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={tvStyles.sourceName}>{source.name}</Text>
                        <Text style={tvStyles.sourceType}>
                          {source.type === 'xtream' ? 'Xtream API' : source.type === 'jellyfin' ? `Jellyfin · ${source.serverName ?? source.host}` : 'Lista M3U'} · {source.channelCount || 0} itens
                        </Text>
                      </View>
                      <TVFocusable
                        onPress={() => startEdit(source)}
                        style={tvStyles.editBtn}
                        borderRadius={8}
                      >
                        <Ionicons name="pencil-outline" size={20} color={colors.accent} />
                      </TVFocusable>
                      <TVFocusable
                        onPress={() => deleteSource(source.id, source.name)}
                        style={tvStyles.deleteBtn}
                        borderRadius={8}
                      >
                        <Ionicons name="trash-outline" size={20} color={colors.red} />
                      </TVFocusable>
                    </View>
                  ))}
                </View>
              </>
            )}

            <View style={tvStyles.securityNote}>
              <Ionicons name="lock-closed" size={14} color={colors.text3} />
              <Text style={tvStyles.securityText}>Suas credenciais ficam apenas neste dispositivo</Text>
            </View>
          </ScrollView>
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
                  <Ionicons name="trash-outline" size={14} color="#fff" />
                  <Text style={styles.modalBtnDeleteText}>Remover</Text>
                </TVFocusable>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // ─── Mobile layout (unchanged) ───────────────────────────────────

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>

        {/* Header */}
        <View style={styles.headerRow}>
          <TVFocusable onPress={() => navigation.goBack()} style={styles.backBtn} borderRadius={999}>
            <Ionicons name="chevron-back" size={20} color={colors.text2} />
          </TVFocusable>
          <View style={{ flex: 1 }} />
        </View>

        {/* Title */}
        <Text style={styles.mainTitle}>Conecte sua lista IPTV</Text>
        <Text style={styles.mainDesc}>
          Use uma conta <Text style={{ color: colors.text1 }}>Xtream Codes API</Text> ou aponte para uma{' '}
          <Text style={{ color: colors.text1 }}>lista M3U/M3U8</Text>.
        </Text>

        {/* Tab switch */}
        <View style={styles.tabContainer}>
          <TVFocusable
            onPress={() => setActiveTab('xtream')}
            style={[styles.tab, activeTab === 'xtream' && styles.tabActive]}
          >
            <Text style={[styles.tabText, activeTab === 'xtream' && styles.tabTextActive]}>Xtream API</Text>
          </TVFocusable>
          <TVFocusable
            onPress={() => setActiveTab('m3u')}
            style={[styles.tab, activeTab === 'm3u' && styles.tabActive]}
          >
            <Text style={[styles.tabText, activeTab === 'm3u' && styles.tabTextActive]}>M3U / URL</Text>
          </TVFocusable>
          <TVFocusable
            onPress={() => setActiveTab('jellyfin')}
            style={[styles.tab, activeTab === 'jellyfin' && styles.tabActive]}
          >
            <Text style={[styles.tabText, activeTab === 'jellyfin' && styles.tabTextActive]}>Jellyfin</Text>
          </TVFocusable>
        </View>

        {activeTab === 'xtream' ? xtreamForm : activeTab === 'jellyfin' ? jellyfinForm : m3uForm}

        {/* Security note */}
        <View style={styles.securityNote}>
          <Ionicons name="lock-closed" size={12} color={colors.text3} />
          <Text style={styles.securityText}>Suas credenciais ficam apenas neste dispositivo</Text>
        </View>

        {/* Active sources */}
        {sources.length > 0 && (
          <View style={styles.sourcesSection}>
            <Text style={styles.sectionLabel}>FONTES ATIVAS</Text>
            {sources.map(source => (
              <View key={source.id} style={styles.sourceCard}>
                <View style={[styles.sourceIcon, source.type === 'xtream' ? styles.sourceIconXtream : source.type === 'jellyfin' ? styles.sourceIconJellyfin : styles.sourceIconM3U]}>
                  <Ionicons name={source.type === 'xtream' ? 'server' : source.type === 'jellyfin' ? 'play-circle' : 'document-text'} size={18} color={colors.white} />
                </View>
                <View style={styles.sourceMeta}>
                  <Text style={styles.sourceName}>{source.name}</Text>
                  <Text style={styles.sourceType}>
                    {source.type === 'xtream' ? 'Xtream API' : source.type === 'jellyfin' ? `Jellyfin · ${source.serverName ?? source.host}` : 'Lista M3U'} · {source.channelCount || 0} itens
                  </Text>
                </View>
                <Pressable
                  onPress={() => startEdit(source)}
                  style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.6 }]}
                >
                  <Ionicons name="pencil-outline" size={18} color={colors.accent} />
                </Pressable>
                <Pressable
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
                <Ionicons name="trash-outline" size={14} color="#fff" />
                <Text style={styles.modalBtnDeleteText}>Remover</Text>
              </TVFocusable>
            </View>
          </View>
        </View>
      </Modal>
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

// ─── JellyfinLogsPanel ───────────────────────────────────────────

type JfStepState = 'waiting' | 'loading' | 'done' | 'error';
interface JfStep { label: string; url: string; state: JfStepState; detail: string }

function JellyfinLogsPanel({ steps, rawLog }: { steps: JfStep[]; rawLog: React.MutableRefObject<string[]> }) {
  const copyAll = () => {
    Share.share({ message: rawLog.current.join('\n'), title: 'Log Jellyfin' });
  };
  return (
    <View style={jfLogStyles.container}>
      <View style={jfLogStyles.header}>
        <Text style={jfLogStyles.title}>LOG DE CONEXÃO</Text>
        <Pressable onPress={copyAll} style={jfLogStyles.copyBtn}>
          <Ionicons name="copy-outline" size={14} color={colors.accent} />
          <Text style={jfLogStyles.copyText}>Copiar</Text>
        </Pressable>
      </View>
      {steps.map((step, i) => {
        const isDone    = step.state === 'done';
        const isLoading = step.state === 'loading';
        const isError   = step.state === 'error';
        return (
          <View key={i} style={jfLogStyles.row}>
            <View style={[jfLogStyles.dot,
              isDone    && jfLogStyles.dotDone,
              isLoading && jfLogStyles.dotLoading,
              isError   && jfLogStyles.dotError,
            ]}>
              {isLoading
                ? <ActivityIndicator size="small" color={colors.accent} />
                : <Ionicons
                    name={isDone ? 'checkmark' : isError ? 'close' : 'ellipse-outline'}
                    size={14}
                    color={isDone ? colors.green : isError ? colors.red : colors.text3}
                  />
              }
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[jfLogStyles.stepLabel, isDone && jfLogStyles.stepLabelDone, isError && jfLogStyles.stepLabelError]}>
                {step.label}
              </Text>
              <Text style={jfLogStyles.stepUrl} numberOfLines={1}>{step.url}</Text>
              {step.detail ? (
                <Text style={[jfLogStyles.stepDetail, isError && jfLogStyles.stepDetailError]} numberOfLines={3}>
                  {step.detail}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const jfLogStyles = StyleSheet.create({
  container: {
    backgroundColor: colors.bg0,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginTop: 8,
    gap: 10,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  title: { fontSize: 10, fontWeight: '700', color: colors.text3, letterSpacing: 0.6 },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 4 },
  copyText: { fontSize: 11, color: colors.accent },
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  dot: {
    width: 26, height: 26, borderRadius: 999,
    backgroundColor: colors.bg2,
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, marginTop: 1,
  },
  dotDone:    { borderColor: colors.green,  backgroundColor: 'rgba(34,197,94,0.12)' },
  dotLoading: { borderColor: colors.accent, backgroundColor: 'rgba(167,139,250,0.12)' },
  dotError:   { borderColor: colors.red,    backgroundColor: 'rgba(239,68,68,0.12)' },
  stepLabel:       { fontSize: 12, fontWeight: '600', color: colors.text2 },
  stepLabelDone:   { color: colors.text1 },
  stepLabelError:  { color: colors.red },
  stepUrl:         { fontSize: 10, color: colors.text3, marginTop: 1, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  stepDetail:      { fontSize: 10, color: colors.text2, marginTop: 3, lineHeight: 14, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  stepDetailError: { color: colors.red },
});

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
  content: { flex: 1 },
  contentInner: { padding: spacing.xl, gap: spacing.lg, maxWidth: 480, alignSelf: 'center', width: '100%' },

  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { width: 36, height: 36, borderRadius: radius.full, backgroundColor: colors.bg1, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  skipText: { fontSize: 12, color: colors.text2, textDecorationLine: 'underline' },

  mainTitle: { fontSize: fontSize.xxl, fontWeight: '600', color: colors.text1, letterSpacing: -0.7, lineHeight: 34, marginTop: spacing.xxl },
  mainDesc: { fontSize: 13.5, color: colors.text2, lineHeight: 20 },

  tabContainer: { flexDirection: 'row', backgroundColor: colors.bg1, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 3, marginTop: spacing.sm },
  tab: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 8 },
  tabActive: { backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.border },
  tabText: { fontSize: fontSize.sm, fontWeight: '500', color: colors.text3 },
  tabTextActive: { color: colors.text1, fontWeight: '600' },

  optionsBox: { backgroundColor: colors.bg1, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },

  form: { gap: spacing.md },
  formRow: { flexDirection: 'row', gap: spacing.md },

  // Field — mobile
  fieldWrap: {
    borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, padding: spacing.md, paddingTop: 10,
    backgroundColor: colors.bg1,
  },
  fieldWrapFocused: {
    borderColor: colors.accent,
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
  submitText: { color: colors.white, fontSize: fontSize.md, fontWeight: '600', letterSpacing: -0.2 },

  securityNote: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  securityText: { fontSize: 11, color: colors.text3 },

  sourcesSection: { gap: spacing.md, marginTop: spacing.lg, paddingTop: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border },
  sectionLabel: { fontSize: 10, fontWeight: '600', color: colors.text3, letterSpacing: 0.6 },
  sourceCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.bg1, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  sourceIcon: { width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  sourceIconM3U: { backgroundColor: colors.accent },
  sourceIconXtream: { backgroundColor: '#059669' },
  sourceIconJellyfin: { backgroundColor: '#00a4dc' },
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
  modalBtnDeleteText: { fontSize: fontSize.sm, fontWeight: '600', color: '#fff' },

  qcBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 50, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.accent, backgroundColor: 'transparent', marginTop: 4 },
  qcBtnText: { color: colors.accent, fontSize: fontSize.md, fontWeight: '600' },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  orLine: { flex: 1, height: 1, backgroundColor: colors.border },
  orLabel: { fontSize: 10, color: colors.text3, letterSpacing: 0.3 },
});

// ─── TV styles ────────────────────────────────────────────────────

const tvStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg0 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 56, paddingTop: 32, paddingBottom: 16,
    gap: 20,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: {
    width: 52, height: 52, borderRadius: 999,
    backgroundColor: colors.bg1, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  headerTitles: { flex: 1 },
  mainTitle: { fontSize: 28, fontWeight: '700', color: colors.text1, letterSpacing: -0.5 },
  mainDesc: { fontSize: 15, color: colors.text2, marginTop: 4 },
  skipBtn: {
    paddingHorizontal: 20, paddingVertical: 10,
    backgroundColor: colors.bg1, borderRadius: 8,
    borderWidth: 1, borderColor: colors.border,
  },
  skipText: { fontSize: 14, color: colors.text2 },

  // Tab
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 56, paddingVertical: 16,
    gap: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, paddingHorizontal: 24,
    borderRadius: 10,
    backgroundColor: colors.bg1,
    borderWidth: 1, borderColor: colors.border,
  },
  tabActive: { backgroundColor: colors.bg2, borderColor: colors.accent },
  tabText: { fontSize: 16, fontWeight: '500', color: colors.text3 },
  tabTextActive: { color: colors.text1, fontWeight: '600' },

  // Body
  body: { flex: 1, flexDirection: 'row' },
  leftPanel: { flex: 3 },
  leftPanelInner: { padding: 48, gap: 0 },
  divider: { width: 1, backgroundColor: colors.border },
  rightPanel: { flex: 2 },
  rightPanelInner: { padding: 40, gap: 0 },

  panelLabel: {
    fontSize: 11, fontWeight: '600', color: colors.text3, letterSpacing: 0.8,
    marginBottom: 12,
  },

  formGroup: { gap: 16 },

  // Field — TV
  fieldWrap: {
    borderWidth: 1.5, borderColor: colors.border,
    borderRadius: 12, padding: 16,
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
    flex: 1, fontSize: 20, color: colors.text1, padding: 0,
    minHeight: 32,
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
    gap: 10, backgroundColor: colors.accent,
    borderRadius: 12, height: 60, marginTop: 8,
  },
  submitText: { color: colors.white, fontSize: 18, fontWeight: '700', letterSpacing: -0.3 },

  // Options — TV
  optionsBox: {
    backgroundColor: colors.bg1, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },

  // Sources — TV
  sourcesGroup: { gap: 10 },
  sourceCard: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    backgroundColor: colors.bg1, borderRadius: 10,
    borderWidth: 1, borderColor: colors.border, padding: 16,
  },
  sourceIcon: {
    width: 48, height: 48, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  sourceName: { fontSize: 16, fontWeight: '600', color: colors.text1 },
  sourceType: { fontSize: 13, color: colors.text2, marginTop: 3 },
  editBtn: { padding: 10 },
  deleteBtn: { padding: 10 },

  // Security
  securityNote: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 28,
  },
  securityText: { fontSize: 13, color: colors.text3 },

  qcBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 60, borderRadius: 12, borderWidth: 1.5, borderColor: colors.accent, backgroundColor: 'transparent' },
  qcBtnText: { color: colors.accent, fontSize: 18, fontWeight: '700' },
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
