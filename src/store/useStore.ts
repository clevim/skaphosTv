import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Channel } from '../types';
import { ChannelIndex, buildChannelIndex } from './channelIndex';

export interface IPTVSource {
  id: string;
  name: string;
  type: 'm3u' | 'xtream';
  url?: string;
  host?: string;
  username?: string;
  password?: string;
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
  };

  addSource: (source: IPTVSource) => void;
  updateSource: (id: string, patch: Partial<IPTVSource>) => void;
  removeSource: (id: string) => void;
  setChannels: (channels: Channel[], groups: string[]) => void;
  /** Adiciona canais à lista existente sem apagar os anteriores (carregamento faseado) */
  appendChannels: (channels: Channel[], groups: string[]) => void;
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

async function saveChannelsChunked(channels: Channel[], groups: string[]): Promise<void> {
  const chunks: Channel[][] = [];
  for (let i = 0; i < channels.length; i += CHUNK_SIZE) {
    chunks.push(channels.slice(i, i + CHUNK_SIZE));
  }
  // Salva metadados primeiro
  await AsyncStorage.setItem(CHANNELS_META_KEY, JSON.stringify({ chunks: chunks.length, groups }));
  // Salva chunks sequencialmente para não OOM (Promise.all com 100+ writes explode no Firestick)
  for (let i = 0; i < chunks.length; i++) {
    await AsyncStorage.setItem(`${CHANNELS_KEY}_${i}`, JSON.stringify(chunks[i]));
  }
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
  const channels: Channel[] = chunkRaws.flatMap(raw => (raw ? JSON.parse(raw) : []));
  return { channels, groups: meta.groups || [] };
}

async function clearChannelsChunked(numChunks: number): Promise<void> {
  await AsyncStorage.removeItem(CHANNELS_META_KEY);
  await Promise.all(
    Array.from({ length: numChunks }, (_, i) =>
      AsyncStorage.removeItem(`${CHANNELS_KEY}_${i}`)
    )
  );
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
  },

  addSource: (source) => {
    set(state => ({ sources: [...state.sources, source] }));
    get().saveToStorage();
  },

  updateSource: (id, patch) => {
    set(state => ({
      sources: state.sources.map(s => s.id === id ? { ...s, ...patch } : s),
    }));
    get().saveToStorage();
  },

  removeSource: (id) => {
    set(state => ({ sources: state.sources.filter(s => s.id !== id) }));
    clearChannelsChunked(Math.ceil(get().channels.length / CHUNK_SIZE)).catch(() => {});
    set({
      channels: [],
      groups: [],
      channelIndex: null,
      currentChannel: null,
      recentChannels: [],
      activeSourceId: null,
      selectedGroup: null,
    });
    get().saveToStorage();
  },

  setChannels: (channels, groups) => {
    const channelIndex = buildChannelIndex(channels);
    set({ channels, groups, channelIndex });
    saveChannelsChunked(channels, groups).catch(e =>
      console.warn('Erro ao salvar canais no cache:', e)
    );
  },

  appendChannels: (newChannels, newGroups) => {
    set(state => {
      const merged = [...state.channels, ...newChannels];
      const groupSet = new Set([...state.groups, ...newGroups]);
      const groups = Array.from(groupSet).sort();
      const channelIndex = buildChannelIndex(merged);
      saveChannelsChunked(merged, groups).catch(e =>
        console.warn('Erro ao salvar canais no cache:', e)
      );
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
    const { channels, groups } = get();
    await saveChannelsChunked(channels, groups);
  },

  loadFromStorage: async () => {
    try {
      const [sourcesRaw, favRaw, recentRaw, settingsRaw] = await Promise.all([
        AsyncStorage.getItem('skaphostv_sources'),
        AsyncStorage.getItem('skaphostv_favorites'),
        AsyncStorage.getItem('skaphostv_recent'),
        AsyncStorage.getItem('skaphostv_settings'),
      ]);

      set({
        sources: sourcesRaw ? JSON.parse(sourcesRaw) : [],
        favorites: favRaw ? JSON.parse(favRaw) : [],
        recentChannels: recentRaw ? JSON.parse(recentRaw) : [],
        settings: settingsRaw ? { ...get().settings, ...JSON.parse(settingsRaw) } : get().settings,
      });

      // Carrega canais do cache
      const cached = await loadChannelsChunked();
      if (cached && cached.channels.length > 0) {
        const channelIndex = buildChannelIndex(cached.channels);
        set({ channels: cached.channels, groups: cached.groups, channelIndex });
        return; // Cache encontrado — não precisa baixar da rede
      }
    } catch (e) {
      console.warn('Erro ao carregar dados:', e);
    }
  },

  saveToStorage: async () => {
    try {
      const state = get();
      await Promise.all([
        AsyncStorage.setItem('skaphostv_sources', JSON.stringify(state.sources)),
        AsyncStorage.setItem('skaphostv_favorites', JSON.stringify(state.favorites)),
        AsyncStorage.setItem('skaphostv_recent', JSON.stringify(state.recentChannels.slice(0, 20))),
        AsyncStorage.setItem('skaphostv_settings', JSON.stringify(state.settings)),
      ]);
    } catch (e) {
      console.warn('Erro ao salvar dados:', e);
    }
  },
}));