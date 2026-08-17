import { useRef } from 'react';
import { create } from 'zustand';
import { useIsFocused } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Channel } from '../types';
import { resolveChannelType } from './useStore';

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
  /** Marca vários de uma vez (ex.: "este e todos os anteriores") — um único set/save. */
  markManyWatched: (ids: string[]) => void;
  /** Mescla entradas vindas de outro aparelho (pareamento) — a mais recente vence. */
  importEntries: (incoming: Record<string, WatchEntry>) => void;
  clear: (id: string) => void;
  get: (id: string) => WatchEntry | undefined;
}

const STORAGE_KEY = 'skaphostv_watch_progress';
const MAX_ENTRIES = 600;        // teto de itens guardados (LRU por updatedAt)
const WATCHED_RATIO = 0.9;      // ≥90% assistido → "watched"
const MIN_RESUME_SEC = 15;      // abaixo disto não vale a pena retomar
const SAVE_DEBOUNCE_MS = 1500;

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pending: Record<string, WatchEntry> | null = null;

/**
 * Grava AGORA o que estiver pendente no debounce. Chamado ao mandar o app pra
 * background / fechar a aba — sem isso, marcar episódios e sair em menos de
 * SAVE_DEBOUNCE_MS perdia tudo (o timer morria com o processo).
 */
export function flushWatchProgress() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  const entries = pending;
  pending = null;
  if (!entries) return;
  // Poda LRU: mantém só os MAX_ENTRIES mais recentes
  let toSave = entries;
  const keys = Object.keys(entries);
  if (keys.length > MAX_ENTRIES) {
    const sorted = keys.sort((a, b) => entries[b].updatedAt - entries[a].updatedAt).slice(0, MAX_ENTRIES);
    toSave = Object.fromEntries(sorted.map(k => [k, entries[k]]));
  }
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(toSave)).catch(err => {
    // Nunca engolir em silêncio: no navegador o AsyncStorage é localStorage, e uma
    // cota cheia (cache de canais grande) rejeitava a gravação — os "assistidos"
    // sumiam no reload sem nenhum sinal. Devolve pro pending: o próximo flush
    // retenta (só se nada mais novo entrou na fila nesse meio-tempo).
    console.warn('[watchProgress] falha ao gravar progresso (cota cheia?):', err);
    if (!pending) pending = toSave;
  });
}

function scheduleSave(entries: Record<string, WatchEntry>) {
  pending = entries;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushWatchProgress, SAVE_DEBOUNCE_MS);
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
    flushWatchProgress(); // ação explícita do usuário — não espera o debounce
  },

  markManyWatched: (ids) => {
    if (ids.length === 0) return;
    set(state => {
      const now = Date.now();
      const entries = { ...state.entries };
      for (const id of ids) {
        if (!id) continue;
        const prev = entries[id];
        entries[id] = {
          positionSec: prev?.positionSec ?? 0,
          durationSec: prev?.durationSec ?? 0,
          watched: true,
          updatedAt: now,
        };
      }
      scheduleSave(entries);
      return { entries };
    });
    flushWatchProgress(); // ação explícita do usuário — não espera o debounce
  },

  importEntries: (incoming) => {
    if (!incoming || typeof incoming !== 'object') return;
    set(state => {
      const entries = { ...state.entries };
      for (const [id, e] of Object.entries(incoming)) {
        if (!e || typeof e.positionSec !== 'number' || typeof e.updatedAt !== 'number') continue;
        const prev = entries[id];
        if (!prev || e.updatedAt > prev.updatedAt) {
          entries[id] = {
            positionSec: e.positionSec,
            durationSec: e.durationSec ?? 0,
            watched: !!e.watched,
            updatedAt: e.updatedAt,
          };
        }
      }
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
    flushWatchProgress(); // ação explícita do usuário — não espera o debounce
  },

  get: (id) => get().entries[id],
}));

/**
 * `entries` para telas de catálogo — CONGELADO enquanto a tela está fora de foco.
 *
 * O player grava progresso a cada ~10s (onProgress → record). Como o Stack mantém
 * a tela de baixo MONTADA atrás do player, cada gravação trocava a identidade de
 * `entries` e re-renderizava a Home/Série inteira: renderCard novo → todas as
 * fileiras memoizadas invalidadas → varredura de catálogo a cada 10 segundos.
 * Numa Fire Stick esse pico de JS a cada 10s rouba CPU do decode do ExoPlayer —
 * é o microtravamento periódico no vídeo. Sem foco ninguém vê os badges mesmo;
 * ao voltar o foco o seletor devolve o valor fresco e a tela atualiza.
 */
export function useWatchEntries(): Record<string, WatchEntry> {
  const focused = useIsFocused();
  const frozen = useRef<Record<string, WatchEntry> | null>(null);
  return useWatchProgress(s => {
    if (focused || !frozen.current) frozen.current = s.entries;
    return frozen.current;
  });
}

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

export interface ContinueWatchingItem {
  channel: Channel;
  progress: number;
  entry?: WatchEntry;
}

/**
 * "Continue assistindo": itens em curso primeiro (mais recentes antes), depois
 * os demais recentes na ordem original. Compartilhado entre HomeContent (fileira
 * da Home) e o sync do widget de tela inicial (Android) — mesma regra nos dois.
 */
export function computeContinueWatching(
  recentChannels: Channel[],
  watchEntries: Record<string, WatchEntry>,
  max = 20,
): ContinueWatchingItem[] {
  const inProgress: Array<{ channel: Channel; progress: number; entry: WatchEntry }> = [];
  const rest: Channel[] = [];
  for (const ch of recentChannels) {
    const entry = watchEntries[ch.id];
    // Ao vivo nunca entra como "em curso" (entradas antigas podem existir de quando
    // streams live com duração reportada gravavam progresso indevidamente)
    const isLiveCh = resolveChannelType(ch) === 'live';
    if (!isLiveCh && entry && !entry.watched && resumePositionFor(entry) > 0) {
      inProgress.push({ channel: ch, progress: progressFractionFor(entry), entry });
    } else {
      rest.push(ch);
    }
  }
  inProgress.sort((a, b) => b.entry.updatedAt - a.entry.updatedAt);
  return [
    ...inProgress,
    ...rest.map(channel => ({ channel, progress: 0, entry: undefined as WatchEntry | undefined })),
  ].slice(0, max);
}

/** Status pra badge de card: "assistido" (check) OU "assistindo" (barra), nunca os dois. */
export function watchStatusFor(entry: WatchEntry | undefined): { watched: boolean; progress: number } {
  if (!entry) return { watched: false, progress: 0 };
  if (entry.watched) return { watched: true, progress: 0 };
  return { watched: false, progress: resumePositionFor(entry) > 0 ? progressFractionFor(entry) : 0 };
}
