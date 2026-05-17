/**
 * xtreamEnricher.ts
 *
 * Detecta canais M3U com URLs no padrão Xtream Codes e os enriquece com
 * metadados da JSON API (stream_type, plot, rating, genre, cast, backdrop…).
 *
 * Fluxo:
 *   1. Detecta credenciais Xtream nos canais M3U (host/user/pass/id/type)
 *   2. Agrupa por servidor (host+user+pass)
 *   3. Busca todos os streams de cada servidor via API JSON
 *   4. Mescla metadados nos canais existentes por stream_id
 *   5. Chama onEnriched com o lote atualizado
 *
 * Roda em background após o carregamento do M3U — não bloqueia a UI.
 */

import axios from 'axios';
import { Channel } from '../types';

// ─── Padrões de URL Xtream ───────────────────────────────────────────────────

// /live/USER/PASS/ID.ts  ou  /live/USER/PASS/ID
const LIVE_RE   = /^(.+?)\/live\/([^/]+)\/([^/]+)\/(\d+)(?:\.\w+)?$/;
// /movie/USER/PASS/ID.ext
const MOVIE_RE  = /^(.+?)\/movie\/([^/]+)\/([^/]+)\/(\d+)(?:\.\w+)?$/;
// /series/USER/PASS/ID  (sem extensão)
const SERIES_RE = /^(.+?)\/series\/([^/]+)\/([^/]+)\/(\d+)(?:\.\w+)?$/;

interface ParsedXtream {
  host: string;
  user: string;
  pass: string;
  id:   string;
  type: 'live' | 'movie' | 'series';
}

function parseXtreamUrl(url: string): ParsedXtream | null {
  let m = LIVE_RE.exec(url);
  if (m) return { host: m[1], user: m[2], pass: m[3], id: m[4], type: 'live' };
  m = MOVIE_RE.exec(url);
  if (m) return { host: m[1], user: m[2], pass: m[3], id: m[4], type: 'movie' };
  m = SERIES_RE.exec(url);
  if (m) return { host: m[1], user: m[2], pass: m[3], id: m[4], type: 'series' };
  return null;
}

// ─── Fetch helpers ───────────────────────────────────────────────────────────

const TIMEOUT = 60_000;
const HEADERS = { 'User-Agent': 'okhttp/4.9.0' };

async function fetchJson<T>(url: string): Promise<T> {
  const res = await axios.get<T>(url, { timeout: TIMEOUT, headers: HEADERS });
  if (res.data === false || res.data === null || res.data === undefined) {
    throw new Error('Resposta inválida do servidor');
  }
  return res.data;
}

// ─── Tipos de metadados da API ───────────────────────────────────────────────

interface ApiStream {
  stream_id: number;
  stream_type?: string;
  name?: string;
  stream_icon?: string;
  cover?: string;
  epg_channel_id?: string;
  category_id?: string;
  rating?: string | number;
  genre?: string;
  plot?: string;
  cast?: string;
  director?: string;
  releaseDate?: string;
  container_extension?: string;
  backdrop_path?: string | string[];
}

interface ApiSeries {
  series_id: number;
  name?: string;
  cover?: string;
  category_id?: string;
  rating?: string | number;
  genre?: string;
  plot?: string;
  cast?: string;
  director?: string;
  releaseDate?: string;
  backdrop_path?: string | string[];
}

// ─── Construção do mapa de metadados ─────────────────────────────────────────

type MetaMap = Map<string, Partial<Channel>>;

async function buildMetaMap(
  host: string,
  user: string,
  pass: string,
  neededTypes: Set<'live' | 'movie' | 'series'>,
): Promise<MetaMap> {
  const base = `${host}/player_api.php?username=${user}&password=${pass}`;
  const map: MetaMap = new Map();

  const fetches: Promise<void>[] = [];

  if (neededTypes.has('live')) {
    fetches.push(
      fetchJson<ApiStream[]>(`${base}&action=get_live_streams`)
        .then(list => {
          if (!Array.isArray(list)) return;
          for (const s of list) {
            if (!s.stream_id) continue;
            map.set(`live-${s.stream_id}`, {
              streamType: 'live',
              logo: s.stream_icon || undefined,
              tvgId: s.epg_channel_id || undefined,
            });
          }
        })
        .catch(() => {}),
    );
  }

  if (neededTypes.has('movie')) {
    fetches.push(
      fetchJson<ApiStream[]>(`${base}&action=get_vod_streams`)
        .then(list => {
          if (!Array.isArray(list)) return;
          for (const s of list) {
            if (!s.stream_id) continue;
            map.set(`movie-${s.stream_id}`, {
              streamType: 'movie',
              logo:   s.stream_icon || s.cover || undefined,
              rating: s.rating ? String(s.rating) : undefined,
              genre:  s.genre || undefined,
              plot:   s.plot || undefined,
            });
          }
        })
        .catch(() => {}),
    );
  }

  if (neededTypes.has('series')) {
    fetches.push(
      fetchJson<ApiSeries[]>(`${base}&action=get_series`)
        .then(list => {
          if (!Array.isArray(list)) return;
          for (const s of list) {
            if (!s.series_id) continue;
            const backdropRaw = s.backdrop_path;
            const backdrop = Array.isArray(backdropRaw)
              ? backdropRaw[0]
              : backdropRaw || undefined;
            map.set(`series-${s.series_id}`, {
              streamType:  'series',
              logo:        s.cover || undefined,
              rating:      s.rating ? String(s.rating) : undefined,
              genre:       s.genre || undefined,
              plot:        s.plot || undefined,
              cast:        s.cast || undefined,
              director:    s.director || undefined,
              releaseDate: s.releaseDate || undefined,
              backdrop:    backdrop || undefined,
            });
          }
        })
        .catch(() => {}),
    );
  }

  await Promise.all(fetches);
  return map;
}

// ─── Entrada pública ─────────────────────────────────────────────────────────

export interface EnricherOptions {
  channels: Channel[];
  /** Chamado com o array enriquecido assim que cada servidor termina */
  onEnriched: (updated: Channel[]) => void;
  /** Chamado se não houver URLs Xtream detectadas */
  onSkipped?: () => void;
  /** Chamado em caso de erro por servidor */
  onError?: (host: string, message: string) => void;
}

/**
 * Enriquece canais M3U com metadados da Xtream API.
 * Retorna imediatamente — o trabalho real acontece em background.
 */
export function enrichM3UChannels(opts: EnricherOptions): void {
  const { channels, onEnriched, onSkipped, onError } = opts;

  // Agrupa índices de canais por servidor (host+user+pass)
  type ServerKey = string;
  const serverMap = new Map<ServerKey, {
    host: string; user: string; pass: string;
    indices: number[];
    neededTypes: Set<'live' | 'movie' | 'series'>;
    idMap: Map<string, number>; // "type-id" → channel index
  }>();

  for (let i = 0; i < channels.length; i++) {
    const c = channels[i];
    // Só enriquece canais sem streamType já definido (i.e. vieram de M3U)
    if (c.streamType) continue;
    const parsed = parseXtreamUrl(c.url);
    if (!parsed) continue;

    const key = `${parsed.host}|${parsed.user}|${parsed.pass}`;
    let entry = serverMap.get(key);
    if (!entry) {
      entry = {
        host: parsed.host,
        user: parsed.user,
        pass: parsed.pass,
        indices: [],
        neededTypes: new Set(),
        idMap: new Map(),
      };
      serverMap.set(key, entry);
    }
    entry.indices.push(i);
    entry.neededTypes.add(parsed.type);
    entry.idMap.set(`${parsed.type}-${parsed.id}`, i);
  }

  if (serverMap.size === 0) {
    onSkipped?.();
    return;
  }

  // Processa cada servidor em background (não bloqueia a chamada)
  const run = async () => {
    for (const entry of serverMap.values()) {
      try {
        const meta = await buildMetaMap(
          entry.host, entry.user, entry.pass, entry.neededTypes,
        );
        if (meta.size === 0) continue;

        // Cria cópia rasa do array de canais e aplica metadados
        const updated = [...channels];
        let changed = false;

        for (const [key, idx] of entry.idMap) {
          const patch = meta.get(key);
          if (!patch) continue;
          updated[idx] = { ...updated[idx], ...patch };
          changed = true;
        }

        if (changed) onEnriched(updated);
      } catch (e: any) {
        onError?.(entry.host, e?.message ?? 'Erro ao enriquecer canais');
      }
    }
  };

  run();
}
