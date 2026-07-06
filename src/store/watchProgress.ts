import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Progresso de reprodução LOCAL (por dispositivo) ─────────────────────────
// Guarda, por id de mídia (filme/episódio), a posição em que o usuário parou e se
// o item já foi assistido. Usado para "continuar assistindo" (retomar no tempo) e
// para badges de progresso/assistido nas listas e na tela da série.
//
// Jellyfin tem resume no servidor (resumePositionTicks); este store cobre TODAS as
// fontes (Xtream/M3U inclusos) e funciona offline, no dispositivo. É a fonte usada
// para os badges; o resume do player prefere o maior entre local e servidor.

export interface WatchEntry {
  /** Posição salva, em segundos. */
  positionSec: number;
  /** Duração total conhecida, em segundos (0 se desconhecida / conteúdo ao vivo). */
  durationSec: number;
  /** true quando o item passou de ~90% — tratado como "assistido". */
  watched: boolean;
  /** epoch ms da última atualização — usado para LRU e ordenar "continuar assistindo". */
  updatedAt: number;
}

interface WatchProgressState {
  entries: Record<string, WatchEntry>;
  hydrated: boolean;
  load: () => Promise<void>;
  /** Registra progresso; marca watched ao passar de WATCHED_RATIO. */
  record: (id: string, positionSec: number, durationSec: number) => void;
  markWatched: (id: string) => void;
  clear: (id: string) => void;
  get: (id: string) => WatchEntry | undefined;
}

const STORAGE_KEY = 'skaphostv_watch_progress';
const MAX_ENTRIES = 600;        // teto de itens guardados (LRU por updatedAt)
const WATCHED_RATIO = 0.9;      // ≥90% assistido → "watched"
const MIN_RESUME_SEC = 15;      // abaixo disto não vale a pena retomar
const SAVE_DEBOUNCE_MS = 1500;

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave(entries: Record<string, WatchEntry>) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    // Poda LRU: mantém só os MAX_ENTRIES mais recentes
    let toSave = entries;
    const keys = Object.keys(entries);
    if (keys.length > MAX_ENTRIES) {
      const sorted = keys.sort((a, b) => entries[b].updatedAt - entries[a].updatedAt).slice(0, MAX_ENTRIES);
      toSave = Object.fromEntries(sorted.map(k => [k, entries[k]]));
    }
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(toSave)).catch(() => {});
  }, SAVE_DEBOUNCE_MS);
}

export const useWatchProgress = create<WatchProgressState>((set, get) => ({
  entries: {},
  hydrated: false,

  load: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const entries = raw ? JSON.parse(raw) : {};
      set({ entries, hydrated: true });
    } catch (_) {
      set({ hydrated: true });
    }
  },

  record: (id, positionSec, durationSec) => {
    if (!id || !isFinite(positionSec) || positionSec < 0) return;
    // Sem duração (ao vivo) ou posição irrelevante → não guarda
    if (!durationSec || durationSec <= 0) return;
    const watched = positionSec / durationSec >= WATCHED_RATIO;
    set(state => {
      const entries = {
        ...state.entries,
        [id]: { positionSec, durationSec, watched, updatedAt: Date.now() },
      };
      scheduleSave(entries);
      return { entries };
    });
  },

  markWatched: (id) => {
    if (!id) return;
    set(state => {
      const prev = state.entries[id];
      const entries = {
        ...state.entries,
        [id]: {
          positionSec: prev?.positionSec ?? 0,
          durationSec: prev?.durationSec ?? 0,
          watched: true,
          updatedAt: Date.now(),
        },
      };
      scheduleSave(entries);
      return { entries };
    });
  },

  clear: (id) => {
    set(state => {
      if (!state.entries[id]) return state;
      const { [id]: _, ...rest } = state.entries;
      scheduleSave(rest);
      return { entries: rest };
    });
  },

  get: (id) => get().entries[id],
}));

/** Posição (segundos) para retomar um item, ou 0 se não vale retomar (curto/assistido). */
export function resumePositionFor(entry: WatchEntry | undefined): number {
  if (!entry || entry.watched) return 0;
  if (entry.positionSec < MIN_RESUME_SEC) return 0;
  // Não retoma se está quase no fim (margem de 5s antes do limiar de watched)
  if (entry.durationSec > 0 && entry.positionSec >= entry.durationSec - 5) return 0;
  return entry.positionSec;
}

/** Fração 0–1 para a barra de progresso, ou 0 se não houver progresso útil. */
export function progressFractionFor(entry: WatchEntry | undefined): number {
  if (!entry || entry.durationSec <= 0) return 0;
  return Math.max(0, Math.min(1, entry.positionSec / entry.durationSec));
}

/** Status pra badge de card: "assistido" (check) OU "assistindo" (barra), nunca os dois. */
export function watchStatusFor(entry: WatchEntry | undefined): { watched: boolean; progress: number } {
  if (!entry) return { watched: false, progress: 0 };
  if (entry.watched) return { watched: true, progress: 0 };
  return { watched: false, progress: resumePositionFor(entry) > 0 ? progressFractionFor(entry) : 0 };
}
