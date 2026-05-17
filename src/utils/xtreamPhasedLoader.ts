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

import axios from 'axios';
import { Channel } from '../types';

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
const HEADERS  = { 'User-Agent': 'okhttp/4.9.0' };

type CatMap = Map<string, string>;

// ─── helpers ────────────────────────────────────────────────────────────────

async function fetchJson<T>(url: string, timeout = TIMEOUT): Promise<T> {
  const res = await axios.get<T>(url, { timeout, headers: HEADERS });
  if (res.data === false || res.data === null || res.data === undefined) {
    throw new Error('Credenciais inválidas ou servidor indisponível');
  }
  return res.data;
}


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

function detectQuality(name: string, url = ''): string {
  const s = (name + ' ' + url).toUpperCase();
  if (s.includes('4K') || s.includes('UHD') || s.includes('2160')) return '4K';
  if (s.includes('FHD') || s.includes('1080')) return 'FHD';
  if (s.includes('HD') || s.includes('720')) return 'HD';
  if (s.includes('SD') || s.includes('480')) return 'SD';
  return 'HD';
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
    const name  = String(s.name ?? '').trim() || 'Canal';
    const url   = `${host}/live/${user}/${pass}/${s.stream_id}.ts`;
    groupSet.add(group);
    channels.push({
      id: `live-${s.stream_id}`,
      name,
      url,
      logo:       s.stream_icon || undefined,
      group,
      tvgId:      s.epg_channel_id || undefined,
      quality:    detectQuality(name, url),
      isFavorite: false,
      streamType: 'live',
    });
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
    const ext   = (s.container_extension ?? 'mp4').replace(/^\./, '') || 'mp4';
    const name  = String(s.name ?? '').trim() || 'Filme';
    const url   = `${host}/movie/${user}/${pass}/${s.stream_id}.${ext}`;
    groupSet.add(group);
    channels.push({
      id: `vod-${s.stream_id}`,
      name,
      url,
      logo:       s.stream_icon || s.cover || undefined,
      group,
      quality:    detectQuality(name, url),
      isFavorite: false,
      streamType:  'movie',
      rating:      s.rating ? String(s.rating) : undefined,
      genre:       s.genre || undefined,
      plot:        s.plot || undefined,
      releaseDate: s.releaseDate || undefined,
    });
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
    const name    = String(s.name ?? '').trim() || 'Série';
    // URL é sempre o endpoint da API — cover é imagem de capa (TMDB), não stream
    const url     = `${host}/series/${user}/${pass}/${s.series_id}`;
    groupSet.add(group);
    // backdrop_path pode ser array ou string
    const backdropRaw = s.backdrop_path;
    const backdrop = Array.isArray(backdropRaw) ? backdropRaw[0] : (backdropRaw || undefined);

    channels.push({
      id: `series-${s.series_id}`,
      name,
      url,
      logo:        s.cover || undefined,
      group,
      tvgId:       String(s.series_id),
      quality:     'HD',
      isFavorite:  false,
      streamType:  'series',
      plot:        s.plot || undefined,
      cast:        s.cast || undefined,
      director:    s.director || undefined,
      genre:       s.genre || undefined,
      rating:      s.rating ? String(s.rating) : undefined,
      releaseDate: s.releaseDate || undefined,
      backdrop:    backdrop || undefined,
    });
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
