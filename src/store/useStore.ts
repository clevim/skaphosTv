import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Channel } from '../types';
import { ChannelIndex, buildChannelIndex, mergeChannelIndexes } from './channelIndex';
import { saveSourceSecrets, loadSourceSecrets, deleteSourceSecrets } from '../utils/secrets';
import { resolveContentType, yieldToUI } from '../utils/channelUtils';
import { notify } from '../utils/notifications';

export interface IPTVSource {
  id: string;
  name: string;
  type: 'm3u' | 'xtream' | 'jellyfin';
  url?: string;
  host?: string;
  username?: string;
  password?: string;
  // Jellyfin
  apiKey?: string;
  userId?: string;
  serverName?: string;
  addedAt: number;
  channelCount?: number;
  /** URL do guia XMLTV (M3U: capturada do url-tvg/x-tvg-url do cabeçalho). */
  epgUrl?: string;
  /** Correção manual de tipo por group-title cru — sobrepõe a heurística
   *  automática (detectType) pra listas M3U que ela classifica errado. */
  groupTypeOverrides?: Record<string, 'live' | 'movies' | 'series'>;
}

interface AppState {
  sources: IPTVSource[];
  activeSourceId: string | null;
  channels: Channel[];
  /** Quando o cache de canais foi gravado/atualizado pela última vez (epoch ms).
   *  Painéis rotacionam ids de VOD — cache velho = URLs mortas (HTTP 406/404). */
  channelsSavedAt: number;
  channelIndex: ChannelIndex | null;
  groups: string[];
  selectedGroup: string | null;
  isLoading: boolean;
  loadError: string | null;
  currentChannel: Channel | null;
  recentChannels: Channel[];
  favorites: string[];
  settings: {
    autoPlay: boolean;
    /** Buffer máximo do player em ms (15000 | 30000 | 60000). */
    bufferSize: number;
    /** Relógio na top bar da TV. */
    showClock: boolean;
    language: string;
    /** Ativa legendas automaticamente quando o conteúdo tiver (Jellyfin). */
    subtitleEnabled: boolean;
    subtitleSize: 'small' | 'medium' | 'large';
    /** Mostra o Guia (EPG) na navegação. (chave nova — o antigo epgEnabled ficava false) */
    showEpg: boolean;
    jellyfinPreferredAudio: string;
    jellyfinPreferredSubtitle: string;
    /** URL do dev-update-server (só usado em build de dev — ver debugLog.ts). Editável
     *  em Ajustes pra não precisar rebuildar quando o IP do PC muda. */
    devUpdateUrl: string;
    /** Escala de fonte da UI — aplicada em telas de texto denso (Ajustes, busca,
     *  guia). Não é um multiplicador global de todo o app de propósito (ver
     *  useUiFontScale em theme.ts). */
    uiFontScale: 'small' | 'medium' | 'large';
    /** Liga/desliga o resumo "Wrapped" do ano e as conquistas/badges em Ajustes. */
    showWrapped: boolean;
    showAchievements: boolean;
    /** Notificações locais — cada uma liga/desliga um dos 3 tipos que o app dispara. */
    notifyChannelOffline: boolean;
    notifyCatalogUpdate: boolean;
    notifySourceExpiring: boolean;
    /** Ordenação das grades (Ao Vivo/Filmes/Séries/Favoritos/Ano) — 'default' é a ordem do catálogo. */
    sortMode: 'default' | 'az' | 'popular';
  };

  addSource: (source: IPTVSource) => void;
  updateSource: (id: string, patch: Partial<IPTVSource>) => void;
  // ponytail: async porque buildChannelIndex agora cede o event loop (catálogos
  // grandes travavam a thread) — chamadores que não esperam continuam ok
  // (fire-and-forget), quem precisa de ordem (fases do Xtream) já aguarda.
  removeSource: (id: string) => Promise<void>;
  /** Adiciona canais à lista existente sem apagar os anteriores (carregamento faseado).
   *  Se `sourceId` for informado, marca cada canal com a fonte de origem. */
  appendChannels: (channels: Channel[], groups: string[], sourceId?: string) => Promise<void>;
  /** Substitui todos os canais de UMA fonte, preservando os das demais fontes.
   *  Usado ao adicionar/atualizar/recarregar uma fonte específica. */
  replaceSourceChannels: (sourceId: string, channels: Channel[], groups: string[]) => Promise<void>;
  /** Reconstrói só o channelIndex a partir do channels/sources atuais — usado
   *  depois que o usuário edita um groupTypeOverrides (não mexe em channels/disco). */
  refreshChannelIndex: () => Promise<void>;
  setSelectedGroup: (group: string | null) => void;
  setLoading: (loading: boolean) => void;
  setLoadError: (error: string | null) => void;
  setCurrentChannel: (channel: Channel) => void;
  toggleFavorite: (channelId: string) => void;
  updateSettings: (settings: Partial<AppState['settings']>) => void;
  loadFromStorage: () => Promise<void>;
  saveToStorage: () => Promise<void>;
  saveChannelsToStorage: () => Promise<void>;
}

// Canais são salvos em chunks de 500 para não exceder o limite do AsyncStorage (2MB por item)
const CHUNK_SIZE = 500;
// Formato v1 (legado): chunks únicos pro catálogo inteiro — migrado no boot.
const CHANNELS_KEY = 'skaphostv_channels';
const CHANNELS_META_KEY = 'skaphostv_channels_meta';
// Formato v2: chunks POR FONTE — recarregar uma fonte regrava só os chunks dela,
// em vez de re-serializar o catálogo inteiro (a maior fonte de jank em multi-fonte).
const V2_META_KEY = 'skaphostv_channels2_meta';
const v2ChunkKey = (bucket: string, i: number) => `skaphostv_channels2_${bucket}_${i}`;
// Canais sem sourceId (cache muito antigo que a migração não conseguiu inferir)
// caem num bucket próprio pra não se perderem.
const bucketOf = (c: Channel) => c.sourceId || '_';

interface V2Meta {
  groups: string[];
  savedAt: number;
  /** bucket (sourceId ou '_') → nº de chunks gravados */
  sources: Record<string, { chunks: number }>;
}

/** Particiona canais por fonte — usado pelo save v2 e pelos índices parciais. */
function partitionBySource(channels: Channel[]): Map<string, Channel[]> {
  const buckets = new Map<string, Channel[]>();
  for (const c of channels) {
    const b = bucketOf(c);
    let arr = buckets.get(b);
    if (!arr) { arr = []; buckets.set(b, arr); }
    arr.push(c);
  }
  return buckets;
}

// ─── Serialização das mutações de canais em memória ──────────────────────────
// setChannels/appendChannels/replaceSourceChannels/removeSource leem `get()`,
// esperam buildChannelIndex (async — yields pra não travar a thread em catálogos
// grandes) e só then chamam `set()`. Múltiplas fontes carregando em paralelo
// (boot, refresh em background) podiam disparar duas dessas em overlap: a
// segunda lê o estado ANTES do `set()` da primeira e, ao gravar, apaga a
// atualização dela. A fila garante que cada mutação sempre parte do estado
// mais recente, não importa quantos chamadores concorrentes existam.
let channelsMutationChain: Promise<void> = Promise.resolve();
function serializeChannelsMutation<T>(fn: () => Promise<T>): Promise<T> {
  const run = channelsMutationChain.then(fn, fn);
  channelsMutationChain = run.then(() => undefined, () => undefined);
  return run;
}

// ─── Índice incremental por fonte ─────────────────────────────────────────────
// Cache dos índices PARCIAIS (um por bucket/fonte). Uma mutação que só toca a
// fonte X reconstrói apenas o parcial de X (O(fonte), com regex/heurística) e
// deriva o global via mergeChannelIndexes (O(refs), sem regex). Antes, cada
// fase do Xtream reconstruía o índice do catálogo INTEIRO — 3 rebuilds O(total)
// por carga, multiplicado pelo nº de fontes.
// Só é lido/escrito dentro de serializeChannelsMutation (ou no boot, que também
// passa pela fila) — sem concorrência.
let partialIndexes = new Map<string, ChannelIndex>();

/**
 * Reconstrói os parciais dos buckets em `dirty` (null = todos, ex.: overrides
 * de categoria mudaram) e devolve o índice global. Buckets que sumiram
 * (fonte removida) são descartados; os intocados reusam o parcial em cache.
 */
async function rebuildIndex(
  channels: Channel[],
  sources: IPTVSource[],
  dirty: Set<string> | null,
): Promise<ChannelIndex> {
  const buckets = partitionBySource(channels);
  const next = new Map<string, ChannelIndex>();
  for (const [b, chans] of buckets) {
    const prev = partialIndexes.get(b);
    if (prev && dirty && !dirty.has(b)) { next.set(b, prev); continue; }
    next.set(b, await buildChannelIndex(chans, sources));
  }
  partialIndexes = next;
  return mergeChannelIndexes(Array.from(next.values()));
}

// ─── Persistência serializada de canais ──────────────────────────────────────
// Saves são SERIALIZADOS (encadeados) e com DEBOUNCE. Isso evita a corrida em que
// dois saves concorrentes (load faseado do Xtream, multi-fonte em paralelo) gravam
// um `meta.chunks` defasado e "perdem" canais no próximo restart.
const SAVE_DEBOUNCE_MS = 600;
let pendingSave: { channels: Channel[]; groups: string[]; sources: IPTVSource[]; dirty: Set<string> } | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let saveChain: Promise<void> = Promise.resolve();
// Chunks por bucket em disco — para apagar órfãos quando uma fonte encolhe/some.
let chunksOnDisk: Record<string, number> = {};
// >= 0: cache v1 (legado) foi lido no boot com esse nº de chunks — apagar as
// chaves antigas DEPOIS do primeiro flush v2 completo (nunca antes, pra não
// perder dados se o app morrer no meio da migração).
let legacyChunksToClear = -1;

// ─── Mascaramento de segredos no cache de canais ─────────────────────────────
// As URLs de canais embutem credenciais (Xtream user/pass, Jellyfin apiKey).
// No DISCO elas são substituídas por sentinelas; em MEMÓRIA permanecem completas
// (player/imagens funcionam sem tocar nas telas). A operação é simétrica/lossless.
function maskSecret(s: string | undefined, src: IPTVSource, mode: 'redact' | 'restore'): string | undefined {
  if (!s) return s;
  const pairs: [string, string][] =
    src.type === 'jellyfin'
      ? (src.apiKey ? [[src.apiKey, '{{K}}']] : [])
      : [
          ...(src.username ? ([[src.username, '{{U}}']] as [string, string][]) : []),
          ...(src.password ? ([[src.password, '{{P}}']] as [string, string][]) : []),
        ];
  let out = s;
  for (const [secret, token] of pairs) {
    out = mode === 'redact' ? out.split(secret).join(token) : out.split(token).join(secret);
  }
  return out;
}

function sourceHasSecret(s: IPTVSource): boolean {
  return s.type === 'jellyfin' ? !!s.apiKey : (!!s.username || !!s.password);
}

function transformChannelSecrets(channels: Channel[], sources: IPTVSource[], mode: 'redact' | 'restore'): Channel[] {
  // Atalho: nada a (des)mascarar se nenhuma fonte tem segredo (ex.: só M3U)
  if (channels.length === 0 || !sources.some(sourceHasSecret)) return channels;
  const byId = new Map(sources.map(s => [s.id, s]));
  let changed = false;
  const out = channels.map(c => {
    const src = c.sourceId ? byId.get(c.sourceId) : undefined;
    if (!src || !sourceHasSecret(src)) return c;
    const url = maskSecret(c.url, src, mode) ?? c.url;
    const logo = maskSecret(c.logo, src, mode);
    const backdrop = maskSecret(c.backdrop, src, mode);
    if (url === c.url && logo === c.logo && backdrop === c.backdrop) return c;
    changed = true;
    return { ...c, url, logo, backdrop };
  });
  return changed ? out : channels;
}

async function flushChannelsSave(
  channels: Channel[],
  groups: string[],
  sources: IPTVSource[],
  dirty: Set<string>,
): Promise<void> {
  const buckets = partitionBySource(channels);
  const bySrc = new Map(sources.map(s => [s.id, s]));
  const meta: V2Meta = { groups, savedAt: Date.now(), sources: {} };
  const writes: Promise<void>[] = [];
  const nextOnDisk: Record<string, number> = {};

  for (const [b, chans] of buckets) {
    const prevChunks = chunksOnDisk[b];
    const nChunks = Math.ceil(chans.length / CHUNK_SIZE);
    meta.sources[b] = { chunks: nChunks };
    nextOnDisk[b] = nChunks;
    // Bucket intocado e já em disco → nada a regravar (só entra no meta).
    if (!dirty.has(b) && prevChunks !== undefined) continue;
    // Redação de segredos SÓ nos canais desta fonte (antes: catálogo inteiro)
    const src = b === '_' ? undefined : bySrc.get(b);
    const safe = src ? transformChannelSecrets(chans, [src], 'redact') : chans;
    // Chunks ANTES do meta e em paralelo — se o app morrer no meio, o meta
    // antigo ainda aponta pra chunks válidos (dados completos, só defasados).
    for (let i = 0; i < nChunks; i++) {
      writes.push(AsyncStorage.setItem(v2ChunkKey(b, i), JSON.stringify(safe.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE))));
    }
    // Órfãos deste bucket (fonte encolheu)
    for (let k = nChunks; k < (prevChunks ?? 0); k++) {
      writes.push(AsyncStorage.removeItem(v2ChunkKey(b, k)));
    }
  }

  // Buckets que sumiram (fonte removida) — apaga todos os chunks deles
  for (const [b, n] of Object.entries(chunksOnDisk)) {
    if (buckets.has(b)) continue;
    for (let k = 0; k < n; k++) writes.push(AsyncStorage.removeItem(v2ChunkKey(b, k)));
  }

  await Promise.all(writes);
  await AsyncStorage.setItem(V2_META_KEY, JSON.stringify(meta));
  chunksOnDisk = nextOnDisk;

  // Migração v1→v2 concluída: agora (e só agora) é seguro apagar o formato antigo
  if (legacyChunksToClear >= 0) {
    const n = legacyChunksToClear;
    legacyChunksToClear = -1;
    Promise.all([
      AsyncStorage.removeItem(CHANNELS_META_KEY),
      ...Array.from({ length: n }, (_, i) => AsyncStorage.removeItem(`${CHANNELS_KEY}_${i}`)),
    ]).catch(() => {});
  }
}

/** Agenda um save com debounce — coalesce rajadas (ex.: 3 fases) num único flush,
 *  unindo os buckets sujos de cada rajada. */
function scheduleChannelsSave(channels: Channel[], groups: string[], sources: IPTVSource[], dirty: Set<string>): void {
  if (pendingSave) for (const b of pendingSave.dirty) dirty.add(b);
  pendingSave = { channels, groups, sources, dirty };
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const job = pendingSave;
    pendingSave = null;
    if (!job) return;
    saveChain = saveChain
      .then(() => flushChannelsSave(job.channels, job.groups, job.sources, job.dirty))
      .catch(e => console.warn('Erro ao salvar canais no cache:', e));
  }, SAVE_DEBOUNCE_MS);
}

/** Persiste imediatamente (serializado), cancelando qualquer save pendente.
 *  Usado em ações destrutivas (remover fonte) onde a gravação não pode atrasar. */
function saveChannelsNow(channels: Channel[], groups: string[], sources: IPTVSource[], dirty: Set<string>): Promise<void> {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  if (pendingSave) for (const b of pendingSave.dirty) dirty.add(b);
  pendingSave = null;
  saveChain = saveChain
    .then(() => flushChannelsSave(channels, groups, sources, dirty))
    .catch(e => console.warn('Erro ao salvar canais no cache:', e));
  return saveChain;
}

/**
 * Antecipa um save JÁ AGENDADO (debounced) — nunca escreve o estado atual "do
 * nada". Usado ao esconder/fechar a aba (visibilitychange/pagehide/AppState).
 *
 * Por quê: reconstruir e persistir `get().channels` incondicionalmente é
 * perigoso com múltiplas abas — uma aba mais antiga, com uma lista de canais
 * desatualizada em memória, pode ficar oculta (perder foco) DEPOIS de outra
 * aba já ter atualizado o disco, e sobrescrever o cache novo com o snapshot
 * velho. Como só existe UM `pendingSave` por módulo (compartilhado entre
 * todas as instâncias do store nesta aba), essa função só adianta uma escrita
 * que ESTA aba já ia fazer de qualquer forma — nunca inventa uma nova.
 */
function flushPendingChannelsSave(): Promise<void> {
  if (!pendingSave) return Promise.resolve();
  const job = pendingSave;
  pendingSave = null;
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  saveChain = saveChain
    .then(() => flushChannelsSave(job.channels, job.groups, job.sources, job.dirty))
    .catch(e => console.warn('Erro ao salvar canais no cache:', e));
  return saveChain;
}

// Parse dos chunks com yields — JSON.parse de ~100 chunks num flatMap síncrono
// bloqueava a thread por segundos bem no boot (era o "app abre travado").
async function parseChunks(raws: (string | null)[], into: Channel[]): Promise<void> {
  for (let i = 0; i < raws.length; i++) {
    const raw = raws[i];
    if (raw) for (const c of JSON.parse(raw) as Channel[]) into.push(c);
    if (i % 6 === 5) await yieldToUI();
  }
}

async function loadChannelsChunked(): Promise<{ channels: Channel[]; groups: string[]; savedAt: number } | null> {
  // Formato v2 (por fonte)
  const v2Raw = await AsyncStorage.getItem(V2_META_KEY);
  if (v2Raw) {
    const meta: V2Meta = JSON.parse(v2Raw);
    const channels: Channel[] = [];
    chunksOnDisk = {};
    for (const [b, info] of Object.entries(meta.sources ?? {})) {
      chunksOnDisk[b] = info.chunks;
      const raws = await Promise.all(
        Array.from({ length: info.chunks }, (_, i) => AsyncStorage.getItem(v2ChunkKey(b, i))),
      );
      await parseChunks(raws, channels);
    }
    return { channels, groups: meta.groups || [], savedAt: meta.savedAt ?? 0 };
  }

  // Formato v1 (legado) — lê e marca pra migrar: o próximo flush grava em v2
  // e só então apaga estas chaves (ver flushChannelsSave).
  const metaRaw = await AsyncStorage.getItem(CHANNELS_META_KEY);
  if (!metaRaw) return null;
  const meta = JSON.parse(metaRaw);
  const chunkRaws = await Promise.all(
    Array.from({ length: meta.chunks }, (_, i) =>
      AsyncStorage.getItem(`${CHANNELS_KEY}_${i}`)
    )
  );
  const channels: Channel[] = [];
  await parseChunks(chunkRaws, channels);
  legacyChunksToClear = meta.chunks;
  return { channels, groups: meta.groups || [], savedAt: meta.savedAt ?? 0 };
}

/** Atribui sourceId a canais legados (cache anterior à introdução do campo). */
function migrateChannelSourceIds(channels: Channel[], sources: IPTVSource[]): Channel[] {
  if (channels.length === 0 || channels.every(c => c.sourceId)) return channels;

  const jellyfin = sources.filter(s => s.type === 'jellyfin');
  const others   = sources.filter(s => s.type !== 'jellyfin');
  const onlyJf    = jellyfin.length === 1 ? jellyfin[0].id : null;
  const onlyOther = others.length === 1 ? others[0].id : null;
  const onlyOne   = sources.length === 1 ? sources[0].id : null;

  return channels.map(c => {
    if (c.sourceId) return c;
    if (onlyOne) return { ...c, sourceId: onlyOne };
    // jf-* → fonte Jellyfin; demais (live-/vod-/series-/M3U) → fonte não-Jellyfin
    const inferred = c.id.startsWith('jf-') ? onlyJf : onlyOther;
    return inferred ? { ...c, sourceId: inferred } : c;
  });
}

/** resolveContentType já considerando o override manual de categoria (Ajustes >
 *  Corrigir categorias) da fonte do canal — helper único pra não repetir o
 *  lookup sourceId→groupTypeOverrides em cada tela que precisa do tipo real. */
export function resolveChannelType(channel: Channel): 'live' | 'movies' | 'series' {
  const overrides = channel.sourceId
    ? useStore.getState().sources.find(s => s.id === channel.sourceId)?.groupTypeOverrides
    : undefined;
  return resolveContentType(channel, overrides);
}

export const useStore = create<AppState>((set, get) => ({
  sources: [],
  activeSourceId: null,
  channels: [],
  channelsSavedAt: 0,
  channelIndex: null,
  groups: [],
  selectedGroup: null,
  isLoading: false,
  loadError: null,
  currentChannel: null,
  recentChannels: [],
  favorites: [],
  settings: {
    autoPlay: true,
    bufferSize: 30000,
    showClock: true,
    language: 'pt-BR',
    subtitleEnabled: false,
    subtitleSize: 'medium',
    showEpg: true,
    jellyfinPreferredAudio: 'pt-BR',
    jellyfinPreferredSubtitle: 'pt-BR',
    devUpdateUrl: '',
    uiFontScale: 'medium',
    showWrapped: true,
    showAchievements: true,
    notifyChannelOffline: true,
    notifyCatalogUpdate: true,
    notifySourceExpiring: true,
    sortMode: 'default',
  },

  addSource: (source) => {
    set(state => ({ sources: [...state.sources, source] }));
    saveSourceSecrets(source.id, {
      username: source.username, password: source.password, apiKey: source.apiKey,
    });
    get().saveToStorage();
  },

  updateSource: (id, patch) => {
    set(state => ({
      sources: state.sources.map(s => s.id === id ? { ...s, ...patch } : s),
    }));
    // Reescreve os segredos a partir do estado já mesclado (cobre patch parcial)
    const merged = get().sources.find(s => s.id === id);
    if (merged) {
      saveSourceSecrets(id, {
        username: merged.username, password: merged.password, apiKey: merged.apiKey,
      });
    }
    get().saveToStorage();
  },

  removeSource: (id) => serializeChannelsMutation(async () => {
    const state = get();
    // Remove apenas os canais desta fonte; preserva os das demais
    const channels = state.channels.filter(c => c.sourceId !== id);
    const groups = Array.from(
      new Set(channels.map(c => c.group).filter(Boolean) as string[]),
    ).sort();
    // Nada sujo: o bucket removido some da partição e os demais reusam o parcial
    const channelIndex = await rebuildIndex(channels, state.sources, new Set());
    set({
      sources: state.sources.filter(s => s.id !== id),
      channels,
      groups,
      channelIndex,
      currentChannel: state.currentChannel?.sourceId === id ? null : state.currentChannel,
      recentChannels: state.recentChannels.filter(c => c.sourceId !== id),
      activeSourceId: state.activeSourceId === id ? null : state.activeSourceId,
      selectedGroup: groups.includes(state.selectedGroup ?? '') ? state.selectedGroup : null,
    });
    // Ação destrutiva: grava imediatamente (o flush apaga os chunks do bucket sumido)
    saveChannelsNow(get().channels, get().groups, get().sources, new Set());
    deleteSourceSecrets(id);
    get().saveToStorage();
  }),

  appendChannels: (newChannels, newGroups, sourceId) => serializeChannelsMutation(async () => {
    const state = get();
    // ponytail: tag in-place — os canais chegam recém-criados dos loaders; copiar
    // {...c} dezenas de milhares de vezes só pra setar um campo dobrava o pico
    // de memória do merge.
    if (sourceId) for (const c of newChannels) c.sourceId = sourceId;
    const dirty = new Set<string>();
    for (const c of newChannels) dirty.add(bucketOf(c));
    // Deduplica por id — novos dados sobrescrevem os antigos (útil para re-fetch Jellyfin)
    const newIds = new Set(newChannels.map(c => c.id));
    const existing = state.channels.filter(c => {
      if (!newIds.has(c.id)) return true;
      dirty.add(bucketOf(c)); // o dedup pode tirar canal de OUTRA fonte
      return false;
    });
    const merged = [...existing, ...newChannels];
    const groupSet = new Set([...state.groups, ...newGroups]);
    const groups = Array.from(groupSet).sort();
    const channelIndex = await rebuildIndex(merged, state.sources, dirty);
    scheduleChannelsSave(merged, groups, state.sources, dirty);
    set({ channels: merged, groups, channelIndex, channelsSavedAt: Date.now() });
  }),

  replaceSourceChannels: (sourceId, newChannels, newGroups) => serializeChannelsMutation(async () => {
    const state = get();
    const oldSource = state.sources.find(s => s.id === sourceId);
    const oldCount = oldSource?.channelCount ?? 0;
    for (const c of newChannels) c.sourceId = sourceId; // in-place (ver appendChannels)
    const newIds = new Set(newChannels.map(c => c.id));
    const dirty = new Set<string>([sourceId]);
    // Remove os canais antigos desta fonte (por sourceId) e quaisquer duplicados por id
    const kept = state.channels.filter(c => {
      if (c.sourceId === sourceId) return false;
      if (newIds.has(c.id)) { dirty.add(bucketOf(c)); return false; }
      return true;
    });
    const merged = [...kept, ...newChannels];
    const groups = Array.from(
      new Set([...merged.map(c => c.group).filter(Boolean) as string[], ...newGroups]),
    ).sort();
    const channelIndex = await rebuildIndex(merged, state.sources, dirty);
    // Atualiza o total real da fonte: este é o baseline que a reconciliação do boot
    // usa para detectar cache parcial. Sem isto, um catálogo que mudou de tamanho
    // deixaria o channelCount defasado e a fonte recarregaria da rede a cada boot.
    const sources = state.sources.map(s =>
      s.id === sourceId ? { ...s, channelCount: newChannels.length } : s,
    );
    scheduleChannelsSave(merged, groups, sources, dirty);
    set({ channels: merged, groups, channelIndex, sources, channelsSavedAt: Date.now() });
    get().saveToStorage();

    // Notifica só em RECARGA de uma fonte já existente (oldCount>0) — na
    // primeira adição (oldCount===0) o "aumento" é o catálogo inteiro, óbvio
    // demais pra virar notificação. Limiar de +10 evita ruído por flutuação
    // normal do provedor entre reloads.
    const added = newChannels.length - oldCount;
    if (oldCount > 0 && added >= 10 && get().settings.notifyCatalogUpdate) {
      notify('Catálogo atualizado', `${oldSource?.name ?? 'Sua fonte'}: ${added} itens novos desde a última atualização.`);
    }
  }),

  refreshChannelIndex: () => serializeChannelsMutation(async () => {
    const state = get();
    // Overrides de categoria mudaram → todos os parciais precisam recomputar tipos
    const channelIndex = await rebuildIndex(state.channels, state.sources, null);
    set({ channelIndex });
  }),

  setSelectedGroup: (group) => set({ selectedGroup: group }),
  setLoading: (loading) => set({ isLoading: loading }),
  setLoadError: (error) => set({ loadError: error }),

  setCurrentChannel: (channel) => {
    set(state => {
      // Para episódios de série (Xtream/Jellyfin), guarda a SÉRIE-pai nos recentes —
      // o episódio solto não tem como rebuscar a lista de episódios (id/URL são do ep).
      // seriesRef é plano (canal da série, com sourceId) → a redação de segredos funciona.
      const recentCh = channel.seriesRef ?? channel;
      const recent = [recentCh, ...state.recentChannels.filter(c => c.id !== recentCh.id)].slice(0, 20);
      return { currentChannel: channel, recentChannels: recent };
    });
    get().saveToStorage();
  },

  toggleFavorite: (channelId) => {
    set(state => {
      const isFav = state.favorites.includes(channelId);
      return {
        favorites: isFav
          ? state.favorites.filter(id => id !== channelId)
          : [...state.favorites, channelId],
      };
    });
    get().saveToStorage();
  },

  updateSettings: (newSettings) => {
    set(state => ({ settings: { ...state.settings, ...newSettings } }));
    get().saveToStorage();
  },

  // Antecipa um save JÁ DEBOUNCED (ver flushPendingChannelsSave) — nunca
  // reconstrói/reescreve o estado atual do zero. Chamada ao esconder a aba.
  saveChannelsToStorage: () => flushPendingChannelsSave(),

  loadFromStorage: async () => {
    try {
      const [sourcesRaw, favRaw, recentRaw, settingsRaw] = await Promise.all([
        AsyncStorage.getItem('skaphostv_sources'),
        AsyncStorage.getItem('skaphostv_favorites'),
        AsyncStorage.getItem('skaphostv_recent'),
        AsyncStorage.getItem('skaphostv_settings'),
      ]);

      // Mescla os segredos (SecureStore) de volta nas fontes. Migra também o
      // formato antigo, onde os segredos vinham embutidos no próprio JSON.
      const storedSources: IPTVSource[] = sourcesRaw ? JSON.parse(sourcesRaw) : [];
      let needsResave = false;
      const sources = await Promise.all(storedSources.map(async (s) => {
        const secrets = await loadSourceSecrets(s.id);
        if (secrets) {
          return { ...s, ...secrets };
        }
        // Formato legado: segredos ainda em texto puro no AsyncStorage → migra
        if (s.username || s.password || s.apiKey) {
          needsResave = true;
          await saveSourceSecrets(s.id, { username: s.username, password: s.password, apiKey: s.apiKey });
        }
        return s;
      }));

      const storedRecent: Channel[] = recentRaw ? JSON.parse(recentRaw) : [];
      const mergedSettings = settingsRaw ? { ...get().settings, ...JSON.parse(settingsRaw) } : get().settings;
      // Migração: bufferSize antigo era 3000 (sem efeito); agora é o maxBuffer real em ms
      if (!mergedSettings.bufferSize || mergedSettings.bufferSize < 15000) mergedSettings.bufferSize = 30000;
      set({
        sources,
        favorites: favRaw ? JSON.parse(favRaw) : [],
        recentChannels: transformChannelSecrets(storedRecent, sources, 'restore'),
        settings: mergedSettings,
      });

      // Reescreve as fontes em AsyncStorage já sem segredos (limpa texto puro legado)
      if (needsResave) get().saveToStorage();

      // Carrega canais do cache
      const cached = await loadChannelsChunked();
      if (cached && cached.channels.length > 0) {
        // Na fila de mutações: rebuildIndex compartilha os parciais com as
        // mutações — não pode rodar em overlap com uma carga de fonte.
        await serializeChannelsMutation(async () => {
          // Migra canais legados (sem sourceId) para que removeSource funcione por fonte
          const migrated = migrateChannelSourceIds(cached.channels, sources);
          // Restaura os segredos mascarados nas URLs (player/imagens precisam delas em memória)
          const rehydrated = transformChannelSecrets(migrated, sources, 'restore');
          const channelIndex = await rebuildIndex(rehydrated, sources, null);
          set({ channels: rehydrated, groups: cached.groups, channelIndex, channelsSavedAt: cached.savedAt });
          // Regrava se algo mudou na forma (sourceIds inferidos) ou se veio do
          // formato v1 — este save é o que materializa a migração pra v2.
          if (migrated !== cached.channels || legacyChunksToClear >= 0) {
            scheduleChannelsSave(rehydrated, cached.groups, sources, new Set(rehydrated.map(bucketOf)));
          }
        });
        return; // Cache encontrado — não precisa baixar da rede
      }
    } catch (e) {
      console.warn('Erro ao carregar dados:', e);
    }
  },

  saveToStorage: async () => {
    try {
      const state = get();
      // Remove segredos das fontes antes de gravar em AsyncStorage (ficam só no SecureStore)
      const safeSources = state.sources.map(({ username, password, apiKey, ...rest }) => rest);
      // Recentes embutem credenciais na URL → mascara igual ao cache de canais
      const safeRecent = transformChannelSecrets(state.recentChannels.slice(0, 20), state.sources, 'redact');
      await Promise.all([
        AsyncStorage.setItem('skaphostv_sources', JSON.stringify(safeSources)),
        AsyncStorage.setItem('skaphostv_favorites', JSON.stringify(state.favorites)),
        AsyncStorage.setItem('skaphostv_recent', JSON.stringify(safeRecent)),
        AsyncStorage.setItem('skaphostv_settings', JSON.stringify(state.settings)),
      ]);
    } catch (e) {
      console.warn('Erro ao salvar dados:', e);
    }
  },
}));