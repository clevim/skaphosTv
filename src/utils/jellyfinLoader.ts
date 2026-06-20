/**
 * jellyfinLoader.ts
 * Carrega filmes e séries de um servidor Jellyfin via REST API.
 *
 * Fluxo:
 *  1. Busca filmes e séries em paralelo via /Users/{userId}/Items
 *  2. Converte para objetos Channel (mesmo shape do resto do app)
 *  3. Retorna { channels, groups } — igual a parseM3U e loadXtreamChannels
 *
 * URL de série usa formato pseudo-URL parseável:
 *  {host}/jellyfin-series/{userId}/{apiKey}/{seriesId}
 * Isso permite que SeriesScreen extraia as credenciais para buscar episódios.
 */

import axios from 'axios';
import { Channel, SubtitleTrack, AudioTrack } from '../types';

const TIMEOUT = 30_000;

function headers(apiKey: string) {
  return {
    'X-Emby-Token': apiKey,
    'Authorization': `MediaBrowser Client="SkaphosTV", Device="App", DeviceId="skaphostv-app", Version="1.0.0", Token="${apiKey}"`,
  };
}

function imageUrl(host: string, itemId: string, apiKey: string, type = 'Primary', width = 400): string {
  return `${host}/Items/${itemId}/Images/${type}?ApiKey=${apiKey}&maxWidth=${width}&quality=90`;
}

function movieStreamUrl(host: string, itemId: string, apiKey: string): string {
  return `${host}/Videos/${itemId}/stream?ApiKey=${apiKey}&static=true&mediaSourceId=${itemId}`;
}

function seriesPseudoUrl(host: string, userId: string, apiKey: string, seriesId: string): string {
  return `${host}/jellyfin-series/${userId}/${apiKey}/${seriesId}`;
}

interface JellyfinItem {
  Id: string;
  Name: string;
  Overview?: string;
  Genres?: string[];
  People?: { Name: string; Type: string }[];
  CommunityRating?: number;
  OfficialRating?: string;
  PremiereDate?: string;
  ProductionYear?: number;
  ImageTags?: { Primary?: string };
  BackdropImageTags?: string[];
  UserData?: { PlaybackPositionTicks?: number; Played?: boolean };
}

function toChannel(
  item: JellyfinItem,
  host: string,
  apiKey: string,
  userId: string,
  group: string,
  type: 'movie' | 'series',
): Channel {
  const hasThumb = !!item.ImageTags?.Primary;
  const hasBackdrop = (item.BackdropImageTags?.length ?? 0) > 0;

  return {
    id:          `jf-${item.Id}`,
    name:        item.Name,
    url:         type === 'movie'
                   ? movieStreamUrl(host, item.Id, apiKey)
                   : seriesPseudoUrl(host, userId, apiKey, item.Id),
    logo:        hasThumb   ? imageUrl(host, item.Id, apiKey, 'Primary',  400)  : undefined,
    backdrop:    hasBackdrop ? imageUrl(host, item.Id, apiKey, 'Backdrop', 1280)
                             : hasThumb ? imageUrl(host, item.Id, apiKey, 'Primary', 1280) : undefined,
    group,
    streamType:  type === 'movie' ? 'movie' : 'series',
    tvgId:       item.Id,
    plot:        item.Overview,
    genre:       item.Genres?.join(', '),
    cast:        item.People?.filter(p => p.Type === 'Actor').slice(0, 5).map(p => p.Name).join(', '),
    director:    item.People?.find(p => p.Type === 'Director')?.Name,
    rating:      item.OfficialRating
                   ?? (item.CommunityRating != null ? `${item.CommunityRating.toFixed(1)}★` : undefined),
    releaseDate: item.PremiereDate?.slice(0, 4) ?? String(item.ProductionYear ?? ''),
    quality:     'HD',
    isFavorite:  false,
    resumePositionTicks: item.UserData?.PlaybackPositionTicks,
  };
}

// ── Carregamento principal ────────────────────────────────────────────────────

const PAGE_SIZE = 500;
const LOAD_FIELDS =
  'Overview,Genres,People,OfficialRating,CommunityRating,PremiereDate,ProductionYear,BackdropImageTags,ImageTags,UserData';

/** Busca TODOS os itens de um tipo, paginando até TotalRecordCount (sem truncar). */
async function fetchAllItems(
  host: string,
  hdrs: Record<string, string>,
  userId: string,
  itemType: 'Movie' | 'Series',
): Promise<JellyfinItem[]> {
  const items: JellyfinItem[] = [];
  let startIndex = 0;
  // Limite de segurança para não loopar indefinidamente em respostas inconsistentes
  for (let guard = 0; guard < 200; guard++) {
    const res = await axios.get(`${host}/Items`, {
      timeout: TIMEOUT,
      headers: hdrs,
      params: {
        userId, IncludeItemTypes: itemType, Recursive: true, Fields: LOAD_FIELDS,
        SortBy: 'SortName', SortOrder: 'Ascending', Limit: PAGE_SIZE, StartIndex: startIndex,
      },
    }).catch(() => null);
    if (!res) break;
    const batch = (res.data?.Items ?? []) as JellyfinItem[];
    items.push(...batch);
    const total = res.data?.TotalRecordCount ?? items.length;
    startIndex += batch.length;
    if (batch.length === 0 || items.length >= total) break;
  }
  return items;
}

export async function loadJellyfinContent(
  host: string,
  apiKey: string,
  userId: string,
  sourceName: string,
): Promise<{ channels: Channel[]; groups: string[] }> {
  const hdrs = headers(apiKey);

  const [movies, series] = await Promise.all([
    fetchAllItems(host, hdrs, userId, 'Movie'),
    fetchAllItems(host, hdrs, userId, 'Series'),
  ]);

  const movieGroup  = `${sourceName} · Filmes`;
  const seriesGroup = `${sourceName} · Séries & Animes`;
  const channels: Channel[] = [];

  for (const item of movies) {
    channels.push(toChannel(item, host, apiKey, userId, movieGroup, 'movie'));
  }
  for (const item of series) {
    channels.push(toChannel(item, host, apiKey, userId, seriesGroup, 'series'));
  }

  return {
    channels,
    groups: channels.length > 0 ? [movieGroup, seriesGroup] : [],
  };
}

// ── Credenciais de série ──────────────────────────────────────────────────────

export interface JellyfinSeriesCreds {
  host: string;
  userId: string;
  apiKey: string;
  seriesId: string;
}

/** Extrai credenciais da pseudo-URL de série gerada por seriesPseudoUrl() */
export function parseJellyfinSeriesUrl(url: string): JellyfinSeriesCreds | null {
  const m = url.match(/^(https?:\/\/.+?)\/jellyfin-series\/([^/]+)\/([^/]+)\/([^/?#]+)/);
  if (!m) return null;
  return { host: m[1], userId: m[2], apiKey: m[3], seriesId: m[4] };
}

// ── Episódios ─────────────────────────────────────────────────────────────────

export async function fetchJellyfinEpisodes(
  host: string,
  apiKey: string,
  userId: string,
  seriesId: string,
): Promise<Channel[]> {
  const res = await axios.get(`${host}/Shows/${seriesId}/Episodes`, {
    timeout: TIMEOUT,
    headers: headers(apiKey),
    params: { userId, Fields: 'Overview,MediaStreams,PremiereDate,UserData', EnableImages: true },
  });

  return ((res.data?.Items ?? []) as any[]).map(ep => {
    const season  = String(ep.ParentIndexNumber ?? 1).padStart(2, '0');
    const episode = String(ep.IndexNumber ?? 1).padStart(2, '0');
    return {
      id:          `jf-ep-${ep.Id}`,
      name:        ep.SeriesName ? `${ep.SeriesName} S${season}E${episode}` : (ep.Name ?? `S${season}E${episode}`),
      url:         movieStreamUrl(host, ep.Id, apiKey),
      logo:        ep.ImageTags?.Primary ? imageUrl(host, ep.Id, apiKey, 'Primary', 400) : undefined,
      streamType:  'series' as const,
      tvgId:       ep.Id,
      plot:        ep.Overview,
      releaseDate: ep.PremiereDate?.slice(0, 10),
      quality:     'HD',
      isFavorite:  false,
      resumePositionTicks: ep.UserData?.PlaybackPositionTicks,
    };
  });
}

// ── Helpers de credenciais de vídeo ─────────────────────────────────────────

/** Extrai host, itemId e apiKey da URL de stream de vídeo do Jellyfin */
export function parseJellyfinVideoUrl(url: string): { host: string; itemId: string; apiKey: string } | null {
  const m = url.match(/^(https?:\/\/[^/]+(?::\d+)?)\/Videos\/([^/]+)\/stream[^?]*\?.*[Aa]pi[_]?[Kk]ey=([^&]+)/);
  if (!m) return null;
  return { host: m[1], itemId: m[2], apiKey: m[3] };
}

/** Marca item como assistido no Jellyfin. Fire-and-forget. */
export async function markJellyfinWatched(host: string, apiKey: string, userId: string, itemId: string): Promise<void> {
  await axios.post(
    `${host}/UserPlayedItems/${itemId}`,
    null,
    { headers: headers(apiKey), timeout: 10_000, params: { userId } },
  );
}

/** Alias do tipo compartilhado em types/index.ts — mantido para compatibilidade com imports existentes */
export type JellyfinSubtitleTrack = SubtitleTrack;

/** Retorna as faixas de legenda disponíveis para um item Jellyfin. */
export async function getJellyfinSubtitleTracks(
  host: string, apiKey: string, userId: string, itemId: string,
): Promise<JellyfinSubtitleTrack[]> {
  const res = await axios.get(`${host}/Items/${itemId}`, {
    timeout: 10_000,
    headers: headers(apiKey),
    params: { userId, Fields: 'MediaStreams' },
  });
  const streams: any[] = res.data?.MediaStreams ?? [];
  return streams
    .filter(s => s.Type === 'Subtitle')
    .map(s => ({
      index:        s.Index,
      displayTitle: s.DisplayTitle || s.Language || `Legenda ${s.Index}`,
      language:     s.Language || '',
      isExternal:   !!s.IsExternal,
      vttUrl:       `${host}/Videos/${itemId}/${itemId}/Subtitles/${s.Index}/0/Stream.vtt?ApiKey=${apiKey}`,
    }));
}

/** Alias do tipo compartilhado em types/index.ts */
export type JellyfinAudioTrack = AudioTrack;

/** Retorna as faixas de áudio disponíveis para um item Jellyfin. */
export async function getJellyfinAudioTracks(
  host: string, apiKey: string, userId: string, itemId: string,
): Promise<JellyfinAudioTrack[]> {
  const res = await axios.get(`${host}/Items/${itemId}`, {
    timeout: 10_000,
    headers: headers(apiKey),
    params: { userId, Fields: 'MediaStreams' },
  });
  const streams: any[] = res.data?.MediaStreams ?? [];
  return streams
    .filter(s => s.Type === 'Audio')
    .map(s => ({
      index:        s.Index,
      displayTitle: s.DisplayTitle || s.Language || `Áudio ${s.Index}`,
      language:     s.Language || '',
      isDefault:    !!s.IsDefault,
    }));
}

/** Reporta posição de progresso ao Jellyfin. Fire-and-forget. */
export async function reportJellyfinProgress(
  host: string, apiKey: string, _userId: string, itemId: string, positionTicks: number,
): Promise<void> {
  await axios.post(
    `${host}/Sessions/Playing/Progress`,
    { ItemId: itemId, PositionTicks: positionTicks },
    { headers: headers(apiKey), timeout: 5_000 },
  );
}
