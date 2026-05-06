import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Channel } from '../../App';

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
  // Sources
  sources: IPTVSource[];
  activeSourceId: string | null;

  // Channels
  channels: Channel[];
  groups: string[];
  selectedGroup: string | null;
  isLoading: boolean;
  loadError: string | null;

  // Player
  currentChannel: Channel | null;
  recentChannels: Channel[];
  playerState: PlayerState;

  // Favorites
  favorites: string[];

  // Settings
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

  // Actions
  addSource: (source: IPTVSource) => void;
  removeSource: (id: string) => void;
  setChannels: (channels: Channel[], groups: string[]) => void;
  setSelectedGroup: (group: string | null) => void;
  setLoading: (loading: boolean) => void;
  setLoadError: (error: string | null) => void;
  setCurrentChannel: (channel: Channel) => void;
  toggleFavorite: (channelId: string) => void;
  updatePlayerState: (state: Partial<PlayerState>) => void;
  updateSettings: (settings: Partial<AppState['settings']>) => void;
  loadFromStorage: () => Promise<void>;
  saveToStorage: () => Promise<void>;
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

export const useStore = create<AppState>((set, get) => ({
  sources: [],
  activeSourceId: null,
  channels: [],
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

  removeSource: (id) => {
    set(state => ({ sources: state.sources.filter(s => s.id !== id) }));
    get().saveToStorage();
  },

  setChannels: (channels, groups) => {
    set({ channels, groups });
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

  loadFromStorage: async () => {
    try {
      const [sourcesRaw, favRaw, recentRaw, settingsRaw] = await Promise.all([
        AsyncStorage.getItem('fluxtv_sources'),
        AsyncStorage.getItem('fluxtv_favorites'),
        AsyncStorage.getItem('fluxtv_recent'),
        AsyncStorage.getItem('fluxtv_settings'),
      ]);
      set({
        sources: sourcesRaw ? JSON.parse(sourcesRaw) : [],
        favorites: favRaw ? JSON.parse(favRaw) : [],
        recentChannels: recentRaw ? JSON.parse(recentRaw) : [],
        settings: settingsRaw ? { ...get().settings, ...JSON.parse(settingsRaw) } : get().settings,
      });
    } catch (e) {
      console.warn('Erro ao carregar dados:', e);
    }
  },

  saveToStorage: async () => {
    try {
      const state = get();
      await Promise.all([
        AsyncStorage.setItem('fluxtv_sources', JSON.stringify(state.sources)),
        AsyncStorage.setItem('fluxtv_favorites', JSON.stringify(state.favorites)),
        AsyncStorage.setItem('fluxtv_recent', JSON.stringify(state.recentChannels.slice(0, 20))),
        AsyncStorage.setItem('fluxtv_settings', JSON.stringify(state.settings)),
      ]);
    } catch (e) {
      console.warn('Erro ao salvar dados:', e);
    }
  },
}));
