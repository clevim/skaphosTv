import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Buscas recentes — persistidas localmente, exibidas como chips quando a busca está vazia.
const STORAGE_KEY = 'skaphostv_recent_searches';
const MAX = 8;

interface RecentSearchesState {
  queries: string[];
  hydrated: boolean;
  load: () => Promise<void>;
  add: (q: string) => void;
  remove: (q: string) => void;
  clear: () => void;
}

export const useRecentSearches = create<RecentSearchesState>((set) => ({
  queries: [],
  hydrated: false,

  load: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      set({ queries: raw ? JSON.parse(raw) : [], hydrated: true });
    } catch (_) {
      set({ hydrated: true });
    }
  },

  add: (q) => {
    const query = q.trim();
    if (!query) return;
    set(state => {
      const next = [query, ...state.queries.filter(x => x.toLowerCase() !== query.toLowerCase())].slice(0, MAX);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return { queries: next };
    });
  },

  remove: (q) => {
    set(state => {
      const next = state.queries.filter(x => x !== q);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return { queries: next };
    });
  },

  clear: () => {
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
    set({ queries: [] });
  },
}));
