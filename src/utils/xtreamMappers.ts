/**
 * xtreamMappers.ts — conversão única de streams Xtream → Channel.
 *
 * FONTE ÚNICA DE VERDADE: tanto o loadXtreamChannels (carga simples) quanto o
 * loadXtreamPhased (carga em fases) usam estas funções. Antes a montagem do
 * Channel era duplicada nos dois arquivos, o que causou o bug de séries sem
 * `streamType`/`tvgId` (episódios não carregavam). Qualquer mudança no shape
 * deve acontecer aqui.
 */

import { Channel } from '../types';
import { detectQuality } from './channelUtils';

/** Stream cru vindo de get_live_streams / get_vod_streams / get_series. */
export interface XtreamRawStream {
  stream_id?: number | string;
  series_id?: number | string;
  name?: string;
  stream_icon?: string;
  cover?: string;
  container_extension?: string;
  epg_channel_id?: string;
  rating?: string | number;
  genre?: string;
  plot?: string;
  cast?: string;
  director?: string;
  releaseDate?: string;
  backdrop_path?: string | string[];
}

export function mapLiveStream(s: XtreamRawStream, host: string, user: string, pass: string, group: string): Channel {
  const name = String(s.name ?? '').trim() || 'Canal';
  const url  = `${host}/live/${user}/${pass}/${s.stream_id}.ts`;
  return {
    id: `live-${s.stream_id}`,
    name,
    url,
    logo: s.stream_icon || undefined,
    group,
    tvgId: s.epg_channel_id || undefined,
    quality: detectQuality(`${name} ${url}`),
    isFavorite: false,
    streamType: 'live',
  };
}

export function mapVodStream(s: XtreamRawStream, host: string, user: string, pass: string, group: string): Channel {
  const name = String(s.name ?? '').trim() || 'Filme';
  const ext  = (s.container_extension ?? 'mp4').replace(/^\./, '') || 'mp4';
  const url  = `${host}/movie/${user}/${pass}/${s.stream_id}.${ext}`;
  return {
    id: `vod-${s.stream_id}`,
    name,
    url,
    logo: s.stream_icon || s.cover || undefined,
    group,
    quality: detectQuality(`${name} ${url}`),
    isFavorite: false,
    streamType: 'movie',
    rating: s.rating != null ? String(s.rating) : undefined,
    genre: s.genre || undefined,
    plot: s.plot || undefined,
    releaseDate: s.releaseDate || undefined,
  };
}

export function mapSeriesStream(s: XtreamRawStream, host: string, user: string, pass: string, group: string): Channel {
  const name = String(s.name ?? '').trim() || 'Série';
  // URL é o endpoint da API da série — episódios carregados sob demanda no SeriesScreen
  const url  = `${host}/series/${user}/${pass}/${s.series_id}`;
  const backdropRaw = s.backdrop_path;
  const backdrop = Array.isArray(backdropRaw) ? backdropRaw[0] : (backdropRaw || undefined);
  return {
    id: `series-${s.series_id}`,
    name,
    url,
    logo: s.cover || s.stream_icon || undefined,
    group,
    tvgId: String(s.series_id),
    quality: 'HD',
    isFavorite: false,
    streamType: 'series',
    plot: s.plot || undefined,
    cast: s.cast || undefined,
    director: s.director || undefined,
    genre: s.genre || undefined,
    rating: s.rating != null ? String(s.rating) : undefined,
    releaseDate: s.releaseDate || undefined,
    backdrop: backdrop || undefined,
  };
}
