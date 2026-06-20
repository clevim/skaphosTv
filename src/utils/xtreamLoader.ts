/**
 * xtreamLoader.ts
 * Loads channels from the Xtream API JSON endpoints in parallel.
 * Much faster than downloading the full M3U playlist.
 *
 * Flow:
 *  1. Fetch live + VOD + series categories and streams in parallel (6 requests)
 *  2. Convert to Channel objects using the same shape the rest of the app uses
 *  3. Return { channels, groups } — same as parseM3U
 */

import axios from 'axios';
import { Channel } from '../types';

const TIMEOUT = 30000;
const HEADERS = { 'User-Agent': 'okhttp/4.9.0' };

interface XtreamCategory {
  category_id: string;
  category_name: string;
}

interface XtreamStream {
  stream_id?: number;
  series_id?: number;
  num?: number;
  name: string;
  stream_icon?: string;
  cover?: string;
  category_id?: string;
  container_extension?: string;
  rating?: string;
  added?: string;
  epg_channel_id?: string;
  plot?: string;
  cast?: string;
  director?: string;
  genre?: string;
  releaseDate?: string;
  backdrop_path?: string | string[];
}

function buildCategoryMap(cats: XtreamCategory[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const c of cats) map.set(String(c.category_id), c.category_name);
  return map;
}

function detectQuality(name: string): string {
  const s = name.toUpperCase();
  if (s.includes('4K') || s.includes('UHD')) return '4K';
  if (s.includes('FHD') || s.includes('1080')) return 'FHD';
  if (s.includes('HD') || s.includes('720')) return 'HD';
  if (s.includes('SD') || s.includes('480')) return 'SD';
  return 'HD';
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await axios.get<T>(url, { timeout: TIMEOUT, headers: HEADERS });
  return res.data;
}

export async function loadXtreamChannels(
  host: string,
  username: string,
  password: string,
): Promise<{ channels: Channel[]; groups: string[] }> {
  const base = `${host}/player_api.php?username=${username}&password=${password}`;

  // Fetch all 6 endpoints in parallel
  const [
    liveCats,
    liveStreams,
    vodCats,
    vodStreams,
    seriesCats,
    seriesList,
  ] = await Promise.all([
    fetchJson<XtreamCategory[]>(`${base}&action=get_live_categories`).catch(() => [] as XtreamCategory[]),
    fetchJson<XtreamStream[]>(`${base}&action=get_live_streams`).catch(() => [] as XtreamStream[]),
    fetchJson<XtreamCategory[]>(`${base}&action=get_vod_categories`).catch(() => [] as XtreamCategory[]),
    fetchJson<XtreamStream[]>(`${base}&action=get_vod_streams`).catch(() => [] as XtreamStream[]),
    fetchJson<XtreamCategory[]>(`${base}&action=get_series_categories`).catch(() => [] as XtreamCategory[]),
    fetchJson<XtreamStream[]>(`${base}&action=get_series`).catch(() => [] as XtreamStream[]),
  ]);

  const liveCatMap   = buildCategoryMap(liveCats);
  const vodCatMap    = buildCategoryMap(vodCats);
  const seriesCatMap = buildCategoryMap(seriesCats);

  const channels: Channel[] = [];
  const groupSet = new Set<string>();

  const addChannel = (ch: Channel) => {
    channels.push(ch);
    if (ch.group) groupSet.add(ch.group);
  };

  // ── Live channels ────────────────────────────────────────────
  for (const s of liveStreams) {
    if (!s.stream_id || !s.name) continue;
    const group = liveCatMap.get(String(s.category_id)) || 'Ao Vivo';
    addChannel({
      id: `live-${s.stream_id}`,
      name: s.name,
      url: `${host}/live/${username}/${password}/${s.stream_id}.ts`,
      logo: s.stream_icon || undefined,
      group,
      tvgId: s.epg_channel_id || undefined,
      quality: detectQuality(s.name),
      isFavorite: false,
      streamType: 'live',
    });
  }

  // ── Movies (VOD) ─────────────────────────────────────────────
  for (const s of vodStreams) {
    if (!s.stream_id || !s.name) continue;
    const catName = vodCatMap.get(String(s.category_id)) || 'Filmes';
    const group = `♦ ${catName}`;
    const ext = (s.container_extension || 'mp4').replace(/^\./, '') || 'mp4';
    addChannel({
      id: `vod-${s.stream_id}`,
      name: s.name,
      url: `${host}/movie/${username}/${password}/${s.stream_id}.${ext}`,
      logo: s.stream_icon || s.cover || undefined,
      group,
      quality: detectQuality(s.name),
      isFavorite: false,
      streamType: 'movie',
      rating: s.rating ? String(s.rating) : undefined,
      genre: s.genre || undefined,
      plot: s.plot || undefined,
      releaseDate: s.releaseDate || undefined,
    });
  }

  // ── Series ───────────────────────────────────────────────────
  // IMPORTANTE: o shape precisa bater com o loadXtreamPhased — `streamType: 'series'`
  // e `tvgId` (series_id) são o que o SeriesScreen usa para buscar os episódios.
  for (const s of seriesList) {
    if (!s.series_id || !s.name) continue;
    const catName = seriesCatMap.get(String(s.category_id)) || 'Séries';
    const group = `♦ ${catName}`;
    const backdropRaw = s.backdrop_path;
    const backdrop = Array.isArray(backdropRaw) ? backdropRaw[0] : (backdropRaw || undefined);
    // URL é o endpoint da API da série — episódios são carregados sob demanda
    addChannel({
      id: `series-${s.series_id}`,
      name: String(s.name).trim(),
      url: `${host}/series/${username}/${password}/${s.series_id}`,
      logo: s.stream_icon || s.cover || undefined,
      group,
      tvgId: String(s.series_id),
      quality: detectQuality(s.name),
      isFavorite: false,
      streamType: 'series',
      plot: s.plot || undefined,
      cast: s.cast || undefined,
      director: s.director || undefined,
      genre: s.genre || undefined,
      rating: s.rating ? String(s.rating) : undefined,
      releaseDate: s.releaseDate || undefined,
      backdrop: backdrop || undefined,
    });
  }

  return {
    channels,
    groups: Array.from(groupSet).sort(),
  };
}
