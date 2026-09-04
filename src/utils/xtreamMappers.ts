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
  /** epoch em segundos, como string — live e VOD. */
  added?: string | number;
  /** epoch em segundos, como string — séries usam este nome. */
  last_modified?: string | number;
}

/** `added`/`last_modified` chegam como string na maioria dos painéis. */
function parseAddedAt(raw: string | number | undefined): number | undefined {
  if (raw == null) return undefined;
  const n = typeof raw === 'number' ? raw : parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
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
    addedAt: parseAddedAt(s.added),
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
    addedAt: parseAddedAt(s.added),
  };
}

/**
 * Série do catálogo — DELIBERADAMENTE enxuta.
 *
 * `get_series` devolve sinopse, elenco, diretor e backdrop de CADA série. Guardar
 * isso no catálogo custa três vezes: memória o app inteiro, um JSON.stringify a
 * cada save e um JSON.parse a cada boot — para texto que só aparece dentro da
 * tela da série. E a SeriesScreen já chama `get_series_info` ao abrir (é de onde
 * vêm os episódios); a MESMA resposta traz esse bloco `info` de novo. Guardar era
 * pagar por uma cópia que já ia chegar de graça.
 *
 * Ficam os campos que a NAVEGAÇÃO usa: `genre` (carrosséis por gênero), `rating`
 * (ordenação) e `releaseDate` (aba Ano) — todos curtos.
 */
export function mapSeriesStream(s: XtreamRawStream, host: string, user: string, pass: string, group: string): Channel {
  const name = String(s.name ?? '').trim() || 'Série';
  // URL é o endpoint da API da série — episódios carregados sob demanda no SeriesScreen
  const url  = `${host}/series/${user}/${pass}/${s.series_id}`;
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
    genre: s.genre || undefined,
    rating: s.rating != null ? String(s.rating) : undefined,
    releaseDate: s.releaseDate || undefined,
    addedAt: parseAddedAt(s.last_modified ?? s.added),
  };
}
