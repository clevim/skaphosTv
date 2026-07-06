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
import { yieldToUI } from './channelUtils';
import { dlog } from './debugLog';

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
  onPhaseComplete: (result: PhaseResult) => void | Promise<void>;
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

  // ponytail: zera cada item cru já mapeado — o array de resposta (list) fica
  // vivo até a função retornar; sem isso, o objeto bruto E o Channel mapeado
  // coexistem na memória o loop inteiro. Catálogos grandes pareciam travar em
  // yieldToUI (setTimeout de 0ms levando dezenas de segundos) — sintoma de GC
  // sob pressão de memória, não da CPU do loop em si (mapear é sub-ms/item).
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    list[i] = null as any;
    if (!s.stream_id) continue;
    const group = catMap.get(String(s.category_id)) ?? 'Ao Vivo';
    groupSet.add(group);
    channels.push(mapLiveStream(s, host, user, pass, group));
    if (channels.length % 3000 === 0) { onProgress(channels.length); await yieldToUI(); }
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
  const t0 = Date.now();
  const [catMap, streams] = await Promise.all([
    fetchCategories(base, 'get_vod_categories'),
    fetchJson<any[]>(`${base}&action=get_vod_streams`),
  ]);
  dlog(`[perf][vod] fetch resolvido em ${Date.now() - t0}ms, ${Array.isArray(streams) ? streams.length : 0} streams`);

  const channels: Channel[] = [];
  const groupSet = new Set<string>();
  const list = Array.isArray(streams) ? streams : [];

  const tLoop = Date.now();
  let tChunk = tLoop;
  // ponytail: zera cada item cru já mapeado (ver comentário em loadLive) — reduz
  // o pico de memória do transform (raw + Channel coexistindo o loop inteiro).
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    list[i] = null as any;
    if (!s.stream_id) continue;
    const group = catMap.get(String(s.category_id)) ?? 'Filmes';
    groupSet.add(group);
    channels.push(mapVodStream(s, host, user, pass, group));
    if (channels.length % 3000 === 0) {
      const tMap = Date.now();
      dlog(`[perf][vod] ${channels.length} mapeados — mapear estes 3000: ${tMap - tChunk}ms`);
      onProgress(channels.length);
      await yieldToUI();
      dlog(`[perf][vod] yieldToUI (setTimeout 0) levou ${Date.now() - tMap}ms`);
      tChunk = Date.now();
    }
  }
  onProgress(channels.length);
  dlog(`[perf][vod] loop total: ${Date.now() - tLoop}ms para ${channels.length} itens`);

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

  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    list[i] = null as any;
    if (!s.series_id) continue;
    const catName = catMap.get(String(s.category_id)) ?? 'Séries';
    const group   = `♦ ${catName}`;
    groupSet.add(group);
    channels.push(mapSeriesStream(s, host, user, pass, group));
    if (channels.length % 1500 === 0) { onProgress(channels.length); await yieldToUI(); }
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
    dlog(`[perf][${id}] fase iniciada`);
    opts.onPhaseStart(id, label);
    let result;
    try {
      result = await fn(base, host, user, pass, n => opts.onProgress(id, n));
    } catch (e: any) {
      const msg = e?.response?.status
        ? `HTTP ${e.response.status}: ${e?.message ?? label}`
        : (e?.code === 'ECONNABORTED' ? `Timeout ao carregar ${label}`
        : (e?.message ?? `Erro ao carregar ${label}`));
      dlog(`[perf][${id}] ERRO: ${msg}`);
      opts.onError(id, msg);
      continue;
    }
    // Aguarda a fase persistir antes de seguir pra próxima — o índice agora é
    // construído de forma assíncrona (yields), então sem isso a fase seguinte
    // poderia ler o estado antes da anterior terminar de gravar.
    await opts.onPhaseComplete(result);
  }
}
