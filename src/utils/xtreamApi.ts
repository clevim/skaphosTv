/**
 * xtreamApi.ts — URL builders e fetchers para a Xtream Codes API
 */

import axios from 'axios';

export function normalizeHost(host: string): string {
  let h = host.trim().replace(/\/$/, '');
  if (!/^https?:\/\//i.test(h)) h = 'http://' + h;
  return h;
}

export function buildXtreamM3U(host: string, username: string, password: string): string {
  const base = normalizeHost(host);
  return `${base}/get.php?username=${username}&password=${password}&type=m3u_plus&output=ts`;
}

export function buildXtreamApiUrl(host: string, username: string, password: string, action: string): string {
  const base = normalizeHost(host);
  return `${base}/player_api.php?username=${username}&password=${password}&action=${action}`;
}

export function buildXtreamLiveUrl(host: string, username: string, password: string, streamId: number | string): string {
  const base = normalizeHost(host);
  return `${base}/live/${username}/${password}/${streamId}`;
}

export function buildXtreamVodUrl(host: string, username: string, password: string, streamId: number | string, containerExtension = 'mp4'): string {
  const base = normalizeHost(host);
  const ext = containerExtension.toLowerCase().replace(/^\./, '') || 'mp4';
  return `${base}/movie/${username}/${password}/${streamId}.${ext}`;
}

export function buildXtreamSeriesUrl(host: string, username: string, password: string, streamId: number | string, containerExtension = 'mp4'): string {
  const base = normalizeHost(host);
  const ext = containerExtension.toLowerCase().replace(/^\./, '') || 'mp4';
  return `${base}/series/${username}/${password}/${streamId}.${ext}`;
}

// ─── Series info (episódios) ─────────────────────────────────────────────────

export interface XtreamEpisode {
  id: string;                 // stream_id — usa para montar URL
  episode_num: number;
  title?: string;
  container_extension: string;
  season: number;
  info?: {
    plot?: string;
    releasedate?: string;
    movie_image?: string;
    duration?: string;
    duration_secs?: number;
    rating?: string;
  };
}

export interface XtreamSeriesInfo {
  info?: {
    name?: string;
    cover?: string;
    plot?: string;
    cast?: string;
    director?: string;
    genre?: string;
    releaseDate?: string;
    rating?: string;
    backdrop_path?: string | string[];
  };
  /** Mapa season → lista de episódios */
  episodes: Record<string, XtreamEpisode[]>;
}

/**
 * Busca temporadas e episódios de uma série via player_api.php.
 * Usado por SeriesScreen ao abrir uma série Xtream.
 */
export async function fetchSeriesInfo(
  host: string,
  username: string,
  password: string,
  seriesId: string | number,
): Promise<XtreamSeriesInfo> {
  const base = normalizeHost(host);
  const url = `${base}/player_api.php?username=${username}&password=${password}&action=get_series_info&series_id=${seriesId}`;
  const res = await axios.get(url, {
    timeout: 30_000,
    headers: { 'User-Agent': 'okhttp/4.9.0' },
  });
  if (!res.data || res.data === false) throw new Error('Série não encontrada ou credenciais inválidas');
  return res.data as XtreamSeriesInfo;
}

/**
 * Extrai host/usuário/senha da URL de uma série Xtream armazenada no canal.
 * Padrão: http://host/series/user/pass/series_id
 */
export function parseSeriesCredentials(url: string): { host: string; user: string; pass: string } | null {
  const m = url.match(/^(.+?)\/series\/([^/]+)\/([^/]+)\//);
  if (!m) return null;
  return { host: m[1], user: m[2], pass: m[3] };
}
