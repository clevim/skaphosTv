import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Channel } from '../types';
import { ChannelIndex, buildChannelIndex } from './channelIndex';
import { saveSourceSecrets, loadSourceSecrets, deleteSourceSecrets } from '../utils/secrets';

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
}

export interface PlayerState {
  isPlaying: boolean;
  isPaused: boolean;
  currentTime: number;
  duration: number;
  isMuted: boolean;
  volume: number;
  isFullscreen: boolean;
  isBuffering: boolean;
  error: string | null;
}

interface AppState {
  sources: IPTVSource[];
  activeSourceId: string | null;
  channels: Channel[];
  channelIndex: ChannelIndex | null;
  groups: string[];
  selectedGroup: string | null;
  isLoading: boolean;
  loadError: string | null;
  currentChannel: Channel | null;
  recentChannels: Channel[];
  playerState: PlayerState;
  favorites: string[];
  settings: {
    defaultPlayer: 'expo-av' | 'vlc';
    autoPlay: boolean;
    bufferSize: number;
    showClock: boolean;
    parentalPin: string | null;
    language: string;
    subtitleEnabled: boolean;
    epgEnabled: boolean;
    tmdbApiKey: string;
    jellyfinPreferredAudio: string;
    jellyfinPreferredSubtitle: string;
  };

  addSource: (source: IPTVSource) => void;
  updateSource: (id: string, patch: Partial<IPTVSource>) => void;
  removeSource: (id: string) => void;
  setChannels: (channels: Channel[], groups: string[]) => void;
  /** Adiciona canais à lista existente sem apagar os anteriores (carregamento faseado).
   *  Se `sourceId` for informado, marca cada canal com a fonte de origem. */
  appendChannels: (channels: Channel[], groups: string[], sourceId?: string) => void;
  /** Substitui todos os canais de UMA fonte, preservando os das demais fontes.
   *  Usado ao adicionar/atualizar/recarregar uma fonte específica. */
  replaceSourceChannels: (sourceId: string, channels: Channel[], groups: string[]) => void;
  setSelectedGroup: (group: string | null) => void;
  setLoading: (loading: boolean) => void;
  setLoadError: (error: string | null) => void;
  setCurrentChannel: (channel: Channel) => void;
  toggleFavorite: (channelId: string) => void;
  updatePlayerState: (state: Partial<PlayerState>) => void;
  updateSettings: (settings: Partial<AppState['settings']>) => void;
  loadFromStorage: () => Promise<void>;
  saveToStorage: () => Promise<void>;
  saveChannelsToStorage: () => Promise<void>;
}

const defaultPlayerState: PlayerState = {
  isPlaying: false,
  isPaused: false,
  currentTime: 0,
  duration: 0,
  isMuted: false,
  volume: 1.0,
  isFullscreen: false,
  isBuffering: false,
  error: null,
};

// Canais são salvos em chunks de 500 para não exceder o limite do AsyncStorage (2MB por item)
const CHUNK_SIZE = 500;
const CHANNELS_KEY = 'skaphostv_channels';
const CHANNELS_META_KEY = 'skaphostv_channels_meta';

// ─── Persistência serializada de canais ──────────────────────────────────────
// Saves são SERIALIZADOS (encadeados) e com DEBOUNCE. Isso evita a corrida em que
// dois saves concorrentes (load faseado do Xtream, multi-fonte em paralelo) gravam
// um `meta.chunks` defasado e "perdem" canais no próximo restart.
const SAVE_DEBOUNCE_MS = 600;
let pendingSave: { channels: Channel[]; groups: string[]; sources: IPTVSource[] } | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let saveChain: Promise<void> = Promise.resolve();
// Quantos chunks existem em disco — usado para apagar órfãos quando a lista encolhe.
let lastWrittenChunks = 0;

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

async function flushChannelsSave(channels: Channel[], groups: string[], sources: IPTVSource[]): Promise<void> {
  const safe = transformChannelSecrets(channels, sources, 'redact');
  const chunks: Channel[][] = [];
  for (let i = 0; i < safe.length; i += CHUNK_SIZE) {
    chunks.push(safe.slice(i, i + CHUNK_SIZE));
  }
  // Salva chunks ANTES dos metadados — se o app fechar no meio, o metadata antigo
  // ainda aponta para chunks válidos (dados completos, possivelmente desatualizados).
  for (let i = 0; i < chunks.length; i++) {
    await AsyncStorage.setItem(`${CHANNELS_KEY}_${i}`, JSON.stringify(chunks[i]));
  }
  await AsyncStorage.setItem(CHANNELS_META_KEY, JSON.stringify({ chunks: chunks.length, groups }));
  // Remove chunks órfãos remanescentes de uma lista anterior maior
  if (lastWrittenChunks > chunks.length) {
    await Promise.all(
      Array.from({ length: lastWrittenChunks - chunks.length }, (_, k) =>
        AsyncStorage.removeItem(`${CHANNELS_KEY}_${chunks.length + k}`),
      ),
    );
  }
  lastWrittenChunks = chunks.length;
}

/** Agenda um save com debounce — coalesce rajadas (ex.: 3 fases) num único flush. */
function scheduleChannelsSave(channels: Channel[], groups: string[], sources: IPTVSource[]): void {
  pendingSave = { channels, groups, sources };
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const job = pendingSave;
    pendingSave = null;
    if (!job) return;
    saveChain = saveChain
      .then(() => flushChannelsSave(job.channels, job.groups, job.sources))
      .catch(e => console.warn('Erro ao salvar canais no cache:', e));
  }, SAVE_DEBOUNCE_MS);
}

/** Persiste imediatamente (serializado), cancelando qualquer save pendente.
 *  Usado em ações destrutivas (remover fonte) onde a gravação não pode atrasar. */
function saveChannelsNow(channels: Channel[], groups: string[], sources: IPTVSource[]): Promise<void> {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  pendingSave = null;
  saveChain = saveChain
    .then(() => flushChannelsSave(channels, groups, sources))
    .catch(e => console.warn('Erro ao salvar canais no cache:', e));
  return saveChain;
}

async function loadChannelsChunked(): Promise<{ channels: Channel[]; groups: string[] } | null> {
  const metaRaw = await AsyncStorage.getItem(CHANNELS_META_KEY);
  if (!metaRaw) return null;
  const meta = JSON.parse(metaRaw);
  const chunkRaws = await Promise.all(
    Array.from({ length: meta.chunks }, (_, i) =>
      AsyncStorage.getItem(`${CHANNELS_KEY}_${i}`)
    )
  );
  lastWrittenChunks = meta.chunks; // sincroniza para limpeza de órfãos futura
  const channels: Channel[] = chunkRaws.flatMap(raw => (raw ? JSON.parse(raw) : []));
  return { channels, groups: meta.groups || [] };
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

export const useStore = create<AppState>((set, get) => ({
  sources: [],
  activeSourceId: null,
  channels: [],
  channelIndex: null,
  groups: [],
  selectedGroup: null,
  isLoading: false,
  loadError: null,
  currentChannel: null,
  recentChannels: [],
  playerState: defaultPlayerState,
  favorites: [],
  settings: {
    defaultPlayer: 'expo-av',
    autoPlay: true,
    bufferSize: 3000,
    showClock: true,
    parentalPin: null,
    language: 'pt-BR',
    subtitleEnabled: false,
    epgEnabled: false,
    tmdbApiKey: '',
    jellyfinPreferredAudio: 'pt-BR',
    jellyfinPreferredSubtitle: 'pt-BR',
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

  removeSource: (id) => {
    set(state => {
      // Remove apenas os canais desta fonte; preserva os das demais
      const channels = state.channels.filter(c => c.sourceId !== id);
      const groups = Array.from(
        new Set(channels.map(c => c.group).filter(Boolean) as string[]),
      ).sort();
      const channelIndex = buildChannelIndex(channels);
      return {
        sources: state.sources.filter(s => s.id !== id),
        channels,
        groups,
        channelIndex,
        currentChannel: state.currentChannel?.sourceId === id ? null : state.currentChannel,
        recentChannels: state.recentChannels.filter(c => c.sourceId !== id),
        activeSourceId: state.activeSourceId === id ? null : state.activeSourceId,
        selectedGroup: groups.includes(state.selectedGroup ?? '') ? state.selectedGroup : null,
      };
    });
    // Ação destrutiva: grava imediatamente (limpa órfãos automaticamente)
    saveChannelsNow(get().channels, get().groups, get().sources);
    deleteSourceSecrets(id);
    get().saveToStorage();
  },

  setChannels: (channels, groups) => {
    const channelIndex = buildChannelIndex(channels);
    set({ channels, groups, channelIndex });
    scheduleChannelsSave(channels, groups, get().sources);
  },

  appendChannels: (newChannels, newGroups, sourceId) => {
    set(state => {
      const tagged = sourceId
        ? newChannels.map(c => ({ ...c, sourceId }))
        : newChannels;
      // Deduplica por id — novos dados sobrescrevem os antigos (útil para re-fetch Jellyfin)
      const newIds = new Set(tagged.map(c => c.id));
      const existing = state.channels.filter(c => !newIds.has(c.id));
      const merged = [...existing, ...tagged];
      const groupSet = new Set([...state.groups, ...newGroups]);
      const groups = Array.from(groupSet).sort();
      const channelIndex = buildChannelIndex(merged);
      scheduleChannelsSave(merged, groups, state.sources);
      return { channels: merged, groups, channelIndex };
    });
  },

  replaceSourceChannels: (sourceId, newChannels, newGroups) => {
    set(state => {
      const tagged = newChannels.map(c => ({ ...c, sourceId }));
      const newIds = new Set(tagged.map(c => c.id));
      // Remove os canais antigos desta fonte (por sourceId) e quaisquer duplicados por id
      const kept = state.channels.filter(
        c => c.sourceId !== sourceId && !newIds.has(c.id),
      );
      const merged = [...kept, ...tagged];
      const groups = Array.from(
        new Set([...merged.map(c => c.group).filter(Boolean) as string[], ...newGroups]),
      ).sort();
      const channelIndex = buildChannelIndex(merged);
      scheduleChannelsSave(merged, groups, state.sources);
      return { channels: merged, groups, channelIndex };
    });
  },

  setSelectedGroup: (group) => set({ selectedGroup: group }),
  setLoading: (loading) => set({ isLoading: loading }),
  setLoadError: (error) => set({ loadError: error }),

  setCurrentChannel: (channel) => {
    set(state => {
      const recent = [channel, ...state.recentChannels.filter(c => c.id !== channel.id)].slice(0, 20);
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

  updatePlayerState: (playerState) => {
    set(state => ({ playerState: { ...state.playerState, ...playerState } }));
  },

  updateSettings: (newSettings) => {
    set(state => ({ settings: { ...state.settings, ...newSettings } }));
    get().saveToStorage();
  },

  saveChannelsToStorage: async () => {
    const { channels, groups, sources } = get();
    await saveChannelsNow(channels, groups, sources);
  },

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
      set({
        sources,
        favorites: favRaw ? JSON.parse(favRaw) : [],
        recentChannels: transformChannelSecrets(storedRecent, sources, 'restore'),
        settings: settingsRaw ? { ...get().settings, ...JSON.parse(settingsRaw) } : get().settings,
      });

      // Reescreve as fontes em AsyncStorage já sem segredos (limpa texto puro legado)
      if (needsResave) get().saveToStorage();

      // Carrega canais do cache
      const cached = await loadChannelsChunked();
      if (cached && cached.channels.length > 0) {
        // Migra canais legados (sem sourceId) para que removeSource funcione por fonte
        const migrated = migrateChannelSourceIds(cached.channels, sources);
        // Restaura os segredos mascarados nas URLs (player/imagens precisam delas em memória)
        const rehydrated = transformChannelSecrets(migrated, sources, 'restore');
        const channelIndex = buildChannelIndex(rehydrated);
        set({ channels: rehydrated, groups: cached.groups, channelIndex });
        if (migrated !== cached.channels) scheduleChannelsSave(rehydrated, cached.groups, sources);
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