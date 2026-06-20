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

import { Channel } from '../types';
import { fetchJson } from './httpJson';
import { mapLiveStream, mapVodStream, mapSeriesStream, XtreamRawStream } from './xtreamMappers';

const TIMEOUT = 30000;

interface XtreamCategory {
  category_id: string;
  category_name: string;
}

type XtreamStream = XtreamRawStream & { category_id?: string };

function buildCategoryMap(cats: XtreamCategory[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const c of cats) map.set(String(c.category_id), c.category_name);
  return map;
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
    addChannel(mapLiveStream(s, host, username, password, group));
  }

  // ── Movies (VOD) ─────────────────────────────────────────────
  // Grupo SEM prefixo ♦ para casar com o loadXtreamPhased (evita o sidebar mudar no refresh)
  for (const s of vodStreams) {
    if (!s.stream_id || !s.name) continue;
    const catName = vodCatMap.get(String(s.category_id)) || 'Filmes';
    addChannel(mapVodStream(s, host, username, password, catName));
  }

  // ── Series ───────────────────────────────────────────────────
  for (const s of seriesList) {
    if (!s.series_id || !s.name) continue;
    const catName = seriesCatMap.get(String(s.category_id)) || 'Séries';
    addChannel(mapSeriesStream(s, host, username, password, `♦ ${catName}`));
  }

  return {
    channels,
    groups: Array.from(groupSet).sort(),
  };
}
