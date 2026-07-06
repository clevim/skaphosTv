import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Channel } from '../types';
import { useWatchProgress } from './watchProgress';

// ─── Métricas de uso por FONTE (local, no dispositivo) ───────────────────────
// Tempo assistido (acumulado a cada ~10s de reprodução, ao vivo incluso — ao
// contrário do watchProgress, que ignora ao vivo por não ter duração) e
// contagem de "plays" por canal, pra saber qual é o mais usado de cada fonte.

export interface SourceUsage {
  watchSeconds: number;
  /** channelId → nome exibido (guardado aqui pra não precisar re-achar o canal depois). */
  playCounts: Record<string, { name: string; count: number }>;
}

interface UsageStatsState {
  bySource: Record<string, SourceUsage>;
  load: () => Promise<void>;
  recordPlay: (sourceId: string | undefined, channelId: string, channelName: string) => void;
  addWatchSeconds: (sourceId: string | undefined, seconds: number) => void;
}

const STORAGE_KEY = 'skaphostv_usage_stats';
const SAVE_DEBOUNCE_MS = 3000;

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave(bySource: Record<string, SourceUsage>) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(bySource)).catch(() => {});
  }, SAVE_DEBOUNCE_MS);
}

const emptyUsage = (): SourceUsage => ({ watchSeconds: 0, playCounts: {} });

// Teto generosíssimo (bem além de qualquer uso real num só dispositivo) — usado
// pra rejeitar incrementos malucos e pra "curar" dados antigos já corrompidos
// por um bug de throttle que somava o timestamp unix inteiro de uma vez.
const MAX_SANE_WATCH_SECONDS = 100_000 * 3600;

export const useUsageStats = create<UsageStatsState>((set, get) => ({
  bySource: {},

  load: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed: Record<string, SourceUsage> = JSON.parse(raw);
      for (const usage of Object.values(parsed)) {
        if (usage.watchSeconds > MAX_SANE_WATCH_SECONDS) usage.watchSeconds = 0;
      }
      set({ bySource: parsed });
    } catch { /* noop */ }
  },

  recordPlay: (sourceId, channelId, channelName) => {
    if (!sourceId) return;
    set(state => {
      const usage = state.bySource[sourceId] ?? emptyUsage();
      const prev = usage.playCounts[channelId];
      const bySource = {
        ...state.bySource,
        [sourceId]: {
          ...usage,
          playCounts: { ...usage.playCounts, [channelId]: { name: channelName, count: (prev?.count ?? 0) + 1 } },
        },
      };
      scheduleSave(bySource);
      return { bySource };
    });
  },

  addWatchSeconds: (sourceId, seconds) => {
    // Throttle real é ~10s; nada plausível passa de 1h numa tacada só — corta
    // qualquer futura variante do bug de elapsed calculado errado.
    if (!sourceId || seconds <= 0 || seconds > 3600) return;
    set(state => {
      const usage = state.bySource[sourceId] ?? emptyUsage();
      const bySource = { ...state.bySource, [sourceId]: { ...usage, watchSeconds: usage.watchSeconds + seconds } };
      scheduleSave(bySource);
      return { bySource };
    });
  },
}));

/** Canal mais assistido de uma fonte, ou null se não houver dados. */
export function topChannelFor(usage: SourceUsage | undefined): { name: string; count: number } | null {
  if (!usage) return null;
  let best: { name: string; count: number } | null = null;
  for (const entry of Object.values(usage.playCounts)) {
    if (!best || entry.count > best.count) best = entry;
  }
  return best;
}

/** "3h 20min" / "45min" a partir de segundos acumulados. */
export function formatWatchTime(seconds: number): string {
  const totalMin = Math.round(seconds / 60);
  if (totalMin < 60) return `${totalMin}min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

export interface WrappedSummary {
  year: number;
  totalWatchSeconds: number;
  itemsWatched: number;
  topGenre: string | null;
  topChannel: { name: string; count: number } | null;
}

/**
 * Resumo "Wrapped" do ano: tempo assistido total (usageStats, todas as fontes),
 * itens marcados como assistidos NESTE ano (watchProgress, cruzado com o
 * catálogo atual pra achar o gênero), e o canal mais tocado no geral.
 * Calculado sob demanda (não fica em memória o tempo todo) — abre a tela,
 * cruza os dados, mostra.
 */
export function computeWrapped(channels: Channel[]): WrappedSummary {
  const year = new Date().getFullYear();
  const { entries } = useWatchProgress.getState();
  const { bySource } = useUsageStats.getState();

  let totalWatchSeconds = 0;
  for (const usage of Object.values(bySource)) totalWatchSeconds += usage.watchSeconds;

  const channelById = new Map(channels.map(c => [c.id, c]));
  const genreCounts = new Map<string, number>();
  let itemsWatched = 0;
  for (const [id, entry] of Object.entries(entries)) {
    if (!entry.watched) continue;
    if (new Date(entry.updatedAt).getFullYear() !== year) continue;
    itemsWatched++;
    const genre = channelById.get(id)?.genre;
    if (genre) {
      for (const g of genre.split(',').map(s => s.trim()).filter(Boolean)) {
        genreCounts.set(g, (genreCounts.get(g) ?? 0) + 1);
      }
    }
  }
  let topGenre: string | null = null;
  let topGenreCount = 0;
  for (const [g, c] of genreCounts) {
    if (c > topGenreCount) { topGenre = g; topGenreCount = c; }
  }

  let topChannel: { name: string; count: number } | null = null;
  for (const usage of Object.values(bySource)) {
    const t = topChannelFor(usage);
    if (t && (!topChannel || t.count > topChannel.count)) topChannel = t;
  }

  return { year, totalWatchSeconds, itemsWatched, topGenre, topChannel };
}
