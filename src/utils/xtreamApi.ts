/**
 * xtreamApi.ts — URL builders e fetchers para a Xtream Codes API
 */

import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { notify } from './notifications';
import { useStore } from '../store/useStore';
import type { IPTVSource } from '../store/useStore';

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

  // Servidores Xtream frequentemente respondem com timeout/erro transitório nessa
  // chamada — tenta algumas vezes com backoff antes de desistir.
  const MAX_ATTEMPTS = 3;
  let lastErr: any;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await axios.get(url, {
        timeout: 30_000,
        headers: { 'User-Agent': 'okhttp/4.9.0' },
      });
      if (!res.data || res.data === false) {
        throw new Error('Série não encontrada ou credenciais inválidas');
      }
      return res.data as XtreamSeriesInfo;
    } catch (e: any) {
      lastErr = e;
      // Não insiste em erro de autenticação/série inexistente — só em falhas de rede
      const status = e?.response?.status;
      if (status === 401 || status === 403 || status === 404) break;
      if (attempt < MAX_ATTEMPTS) {
        await new Promise(r => setTimeout(r, attempt * 1000));
      }
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error('Não foi possível carregar os episódios');
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

// ─── VOD info (detalhes de filme) ────────────────────────────────────────────

export interface XtreamVodDetails {
  plot?: string;
  cast?: string;
  director?: string;
  genre?: string;
  rating?: string;
  releaseDate?: string;
  backdrop?: string;
  duration?: string;
  trailerYoutubeId?: string;
}

/**
 * Extrai host/usuário/senha/id da URL de um filme Xtream.
 * Padrão: http://host/movie/user/pass/vod_id.ext
 */
export function parseMovieCredentials(
  url: string,
): { host: string; user: string; pass: string; vodId: string } | null {
  const m = url.match(/^(.+?)\/movie\/([^/]+)\/([^/]+)\/(\d+)\.\w+/);
  if (!m) return null;
  return { host: m[1], user: m[2], pass: m[3], vodId: m[4] };
}

/**
 * Busca os detalhes ricos de um filme via get_vod_info — sinopse, elenco,
 * diretor, gênero, nota, backdrop e trailer, direto do painel, sem chave TMDB.
 */
export async function fetchVodInfo(
  host: string,
  username: string,
  password: string,
  vodId: string | number,
): Promise<XtreamVodDetails | null> {
  const base = normalizeHost(host);
  const url = `${base}/player_api.php?username=${username}&password=${password}&action=get_vod_info&vod_id=${vodId}`;
  try {
    const res = await axios.get(url, { timeout: 20_000, headers: { 'User-Agent': 'okhttp/4.9.0' } });
    const info = res.data?.info;
    if (!info || typeof info !== 'object') return null;
    const backdropRaw = info.backdrop_path;
    const backdrop = Array.isArray(backdropRaw) ? backdropRaw[0] : backdropRaw || undefined;
    // Painéis variam entre plot/description/plot_outline — pega o primeiro não-vazio
    const plot = info.plot || info.description || info.plot_outline || undefined;
    return {
      plot: plot || undefined,
      cast: info.cast || info.actors || undefined,
      director: info.director || undefined,
      genre: info.genre || undefined,
      rating: info.rating != null && String(info.rating) !== '0' ? String(info.rating) : undefined,
      releaseDate: info.releasedate || info.release_date || undefined,
      backdrop,
      duration: info.duration || undefined,
      trailerYoutubeId: info.youtube_trailer || undefined,
    };
  } catch (_) {
    return null; // metadados são opcionais — sem info, a tela segue com o que tem
  }
}

const EXPIRY_WARN_DAYS = 5;
const EXPIRY_NOTIFIED_KEY = 'skaphostv_expiry_notified'; // { [sourceId]: 'YYYY-MM-DD' }

/**
 * Verifica se alguma fonte Xtream vence nos próximos EXPIRY_WARN_DAYS e notifica
 * — no máximo 1x por dia por fonte (throttle em AsyncStorage), pra não repetir
 * a cada boot enquanto a conta estiver na janela de aviso.
 */
export async function checkExpiringSources(sources: IPTVSource[]): Promise<void> {
  if (!useStore.getState().settings.notifySourceExpiring) return;
  const xtreamSources = sources.filter(s => s.type === 'xtream' && s.host && s.username && s.password);
  if (xtreamSources.length === 0) return;

  const today = new Date().toISOString().slice(0, 10);
  const raw = await AsyncStorage.getItem(EXPIRY_NOTIFIED_KEY);
  const notified: Record<string, string> = raw ? JSON.parse(raw) : {};

  for (const s of xtreamSources) {
    if (notified[s.id] === today) continue;
    try {
      const base = normalizeHost(s.host!);
      const res = await axios.get(
        `${base}/player_api.php?username=${s.username}&password=${s.password}`,
        { timeout: 10_000, headers: { 'User-Agent': 'okhttp/4.9.0' } },
      );
      const expUnix = parseInt(res.data?.user_info?.exp_date, 10);
      if (!expUnix) continue;
      const daysLeft = Math.ceil((expUnix * 1000 - Date.now()) / 86_400_000);
      if (daysLeft > EXPIRY_WARN_DAYS) continue;
      const msg = daysLeft <= 0
        ? `${s.name} venceu.`
        : `${s.name} vence em ${daysLeft} dia${daysLeft === 1 ? '' : 's'}.`;
      await notify('Fonte prestes a vencer', msg);
      notified[s.id] = today;
    } catch {
      /* fonte fora do ar ou erro de rede — tenta de novo no próximo boot */
    }
  }
  await AsyncStorage.setItem(EXPIRY_NOTIFIED_KEY, JSON.stringify(notified));
}
