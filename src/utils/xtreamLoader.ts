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
import { yieldToUI } from './channelUtils';

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

  // ponytail: catálogos de 50k+ itens travam a thread num loop síncrono só
  // (web e nativo são igualmente single-thread) — cede o event loop a cada
  // 500 itens pra manter a UI respondendo, sem limite de tamanho. Zera cada
  // item cru (arrays[i]=null) assim que mapeado: os 3 arrays (live+vod+series)
  // já estão TODOS em memória de uma vez (Promise.all acima) — sem isso, o
  // bruto e o Channel mapeado coexistem até o fim da função inteira.
  // ── Live channels ────────────────────────────────────────────
  for (let i = 0; i < liveStreams.length; i++) {
    const s = liveStreams[i];
    (liveStreams as any)[i] = null;
    if (!s.stream_id || !s.name) continue;
    const group = liveCatMap.get(String(s.category_id)) || 'Ao Vivo';
    addChannel(mapLiveStream(s, host, username, password, group));
    if (channels.length % 500 === 0) await yieldToUI();
  }

  // ── Movies (VOD) ─────────────────────────────────────────────
  // Grupo SEM prefixo ♦ para casar com o loadXtreamPhased (evita o sidebar mudar no refresh)
  for (let i = 0; i < vodStreams.length; i++) {
    const s = vodStreams[i];
    (vodStreams as any)[i] = null;
    if (!s.stream_id || !s.name) continue;
    const catName = vodCatMap.get(String(s.category_id)) || 'Filmes';
    addChannel(mapVodStream(s, host, username, password, catName));
    if (channels.length % 500 === 0) await yieldToUI();
  }

  // ── Series ───────────────────────────────────────────────────
  for (let i = 0; i < seriesList.length; i++) {
    const s = seriesList[i];
    (seriesList as any)[i] = null;
    if (!s.series_id || !s.name) continue;
    const catName = seriesCatMap.get(String(s.category_id)) || 'Séries';
    addChannel(mapSeriesStream(s, host, username, password, `♦ ${catName}`));
    if (channels.length % 500 === 0) await yieldToUI();
  }

  return {
    channels,
    groups: Array.from(groupSet).sort(),
  };
}
