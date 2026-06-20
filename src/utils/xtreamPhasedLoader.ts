/**
 * xtreamPhasedLoader.ts
 *
 * Baixa conteúdo Xtream em 3 fases sequenciais usando a JSON API:
 *   Fase 1 → Ao Vivo   (get_live_streams)
 *   Fase 2 → Filmes    (get_vod_streams)
 *   Fase 3 → Séries    (get_series)
 *
 * Cada fase chama `onPhaseComplete` assim que termina, permitindo que o app
 * mostre o conteúdo disponível enquanto as fases seguintes ainda são baixadas.
 * Isso evita OOM por não criar arrays gigantes de uma vez.
 */

import { Channel } from '../types';
import { fetchJson as fetchJsonHttp } from './httpJson';
import { mapLiveStream, mapVodStream, mapSeriesStream } from './xtreamMappers';

export type XtreamPhase = 'live' | 'vod' | 'series';

export interface PhaseResult {
  phase: XtreamPhase;
  label: string;
  channels: Channel[];
  groups: string[];
}

export interface XtreamPhasedOptions {
  host: string;
  username: string;
  password: string;
  /** Chamado quando uma fase começa */
  onPhaseStart: (phase: XtreamPhase, label: string) => void;
  /** Chamado quando uma fase termina — adicione ao store aqui */
  onPhaseComplete: (result: PhaseResult) => void;
  /** Chamado periodicamente durante o parse de cada fase */
  onProgress: (phase: XtreamPhase, count: number) => void;
  /** Chamado se uma fase falhar (não interrompe as demais) */
  onError: (phase: XtreamPhase, message: string) => void;
}

const TIMEOUT        = 60_000;   // live / vod
const TIMEOUT_SERIES = 180_000;  // séries: resposta pode passar de 10 MB

type CatMap = Map<string, string>;

// ─── helpers ────────────────────────────────────────────────────────────────

const fetchJson = <T>(url: string, timeout = TIMEOUT): Promise<T> => fetchJsonHttp<T>(url, timeout);

async function fetchCategories(base: string, action: string): Promise<CatMap> {
  try {
    const cats = await fetchJson<{ category_id: string; category_name: string }[]>(
      `${base}&action=${action}`,
    );
    const map = new Map<string, string>();
    if (Array.isArray(cats)) {
      for (const c of cats) map.set(String(c.category_id), c.category_name ?? 'Sem Categoria');
    }
    return map;
  } catch {
    return new Map();
  }
}

// ─── Fase 1: Ao Vivo ────────────────────────────────────────────────────────

async function loadLive(
  base: string,
  host: string,
  user: string,
  pass: string,
  onProgress: (n: number) => void,
): Promise<PhaseResult> {
  const [catMap, streams] = await Promise.all([
    fetchCategories(base, 'get_live_categories'),
    fetchJson<any[]>(`${base}&action=get_live_streams`),
  ]);

  const channels: Channel[] = [];
  const groupSet = new Set<string>();
  const list = Array.isArray(streams) ? streams : [];

  for (const s of list) {
    if (!s.stream_id) continue;
    const group = catMap.get(String(s.category_id)) ?? 'Ao Vivo';
    groupSet.add(group);
    channels.push(mapLiveStream(s, host, user, pass, group));
    if (channels.length % 500 === 0) onProgress(channels.length);
  }
  onProgress(channels.length);

  return {
    phase: 'live',
    label: 'Ao Vivo',
    channels,
    groups: Array.from(groupSet).sort(),
  };
}

// ─── Fase 2: Filmes ─────────────────────────────────────────────────────────

async function loadVod(
  base: string,
  host: string,
  user: string,
  pass: string,
  onProgress: (n: number) => void,
): Promise<PhaseResult> {
  const [catMap, streams] = await Promise.all([
    fetchCategories(base, 'get_vod_categories'),
    fetchJson<any[]>(`${base}&action=get_vod_streams`),
  ]);

  const channels: Channel[] = [];
  const groupSet = new Set<string>();
  const list = Array.isArray(streams) ? streams : [];

  for (const s of list) {
    if (!s.stream_id) continue;
    const group = catMap.get(String(s.category_id)) ?? 'Filmes';
    groupSet.add(group);
    channels.push(mapVodStream(s, host, user, pass, group));
    if (channels.length % 500 === 0) onProgress(channels.length);
  }
  onProgress(channels.length);

  return {
    phase: 'vod',
    label: 'Filmes',
    channels,
    groups: Array.from(groupSet).sort(),
  };
}

// ─── Fase 3: Séries ─────────────────────────────────────────────────────────

async function loadSeries(
  base: string,
  host: string,
  user: string,
  pass: string,
  onProgress: (n: number) => void,
): Promise<PhaseResult> {
  const [catMap, seriesList] = await Promise.all([
    fetchCategories(base, 'get_series_categories'),
    fetchJson<any[]>(`${base}&action=get_series`, TIMEOUT_SERIES),
  ]);

  const channels: Channel[] = [];
  const groupSet = new Set<string>();
  const list = Array.isArray(seriesList) ? seriesList : [];

  for (const s of list) {
    if (!s.series_id) continue;
    const catName = catMap.get(String(s.category_id)) ?? 'Séries';
    const group   = `♦ ${catName}`;
    groupSet.add(group);
    channels.push(mapSeriesStream(s, host, user, pass, group));
    if (channels.length % 200 === 0) onProgress(channels.length);
  }
  onProgress(channels.length);

  return {
    phase: 'series',
    label: 'Séries',
    channels,
    groups: Array.from(groupSet).sort(),
  };
}

// ─── Entrada pública ─────────────────────────────────────────────────────────

export async function loadXtreamPhased(opts: XtreamPhasedOptions): Promise<void> {
  const { host, username: user, password: pass } = opts;
  const base = `${host}/player_api.php?username=${user}&password=${pass}`;

  const phases: Array<{
    id: XtreamPhase;
    label: string;
    fn: typeof loadLive;
  }> = [
    { id: 'live',   label: 'Ao Vivo', fn: loadLive },
    { id: 'vod',    label: 'Filmes',  fn: loadVod },
    { id: 'series', label: 'Séries',  fn: loadSeries },
  ];

  for (const { id, label, fn } of phases) {
    opts.onPhaseStart(id, label);
    let result;
    try {
      result = await fn(base, host, user, pass, n => opts.onProgress(id, n));
    } catch (e: any) {
      const msg = e?.response?.status
        ? `HTTP ${e.response.status}: ${e?.message ?? label}`
        : (e?.code === 'ECONNABORTED' ? `Timeout ao carregar ${label}`
        : (e?.message ?? `Erro ao carregar ${label}`));
      opts.onError(id, msg);
      continue;
    }
    opts.onPhaseComplete(result);
  }
}
