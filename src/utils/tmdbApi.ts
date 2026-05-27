/**
 * tmdbApi.ts — Busca metadados no The Movie Database (TMDB).
 *
 * Requer uma API key gratuita: https://www.themoviedb.org/settings/api
 * Configure em Ajustes → Conta no app.
 *
 * Fluxo:
 *  1. search/movie ou search/tv por título
 *  2. Busca detalhes do primeiro resultado + credits
 *  3. Retorna metadados unificados (TmdbMeta)
 */

import axios from 'axios';

const BASE = 'https://api.themoviedb.org/3';
const IMG  = 'https://image.tmdb.org/t/p';

export interface TmdbMeta {
  plot?:     string;
  poster?:   string;
  backdrop?: string;
  rating?:   string;
  year?:     string;
  genre?:    string;
  cast?:     string;
  director?: string;
}

async function fetchDetails(
  type: 'movie' | 'tv',
  id: number,
  apiKey: string,
): Promise<TmdbMeta> {
  const res = await axios.get(`${BASE}/${type}/${id}`, {
    timeout: 8_000,
    params: {
      api_key: apiKey,
      language: 'pt-BR',
      append_to_response: 'credits',
    },
  });
  const d = res.data;
  return {
    plot:     d.overview   || undefined,
    poster:   d.poster_path   ? `${IMG}/w500${d.poster_path}`    : undefined,
    backdrop: d.backdrop_path ? `${IMG}/w1280${d.backdrop_path}` : undefined,
    rating:   d.vote_average  ? `${Number(d.vote_average).toFixed(1)}★` : undefined,
    year:     (d.release_date || d.first_air_date)?.slice(0, 4),
    genre:    d.genres?.slice(0, 3).map((g: any) => g.name).join(', '),
    cast:     d.credits?.cast?.slice(0, 5).map((c: any) => c.name).join(', '),
    director: type === 'movie'
      ? d.credits?.crew?.find((c: any) => c.job === 'Director')?.name
      : d.created_by?.[0]?.name,
  };
}

/** Busca metadados de um filme por título + ano opcional. */
export async function fetchTmdbMovie(
  title: string,
  apiKey: string,
  year?: string,
): Promise<TmdbMeta | null> {
  try {
    const params: Record<string, any> = { query: title, api_key: apiKey, language: 'pt-BR' };
    if (year) params.year = year;
    const res = await axios.get(`${BASE}/search/movie`, { timeout: 8_000, params });
    const first = res.data?.results?.[0];
    if (!first) return null;
    return await fetchDetails('movie', first.id, apiKey);
  } catch {
    return null;
  }
}

/** Busca metadados de uma série por título. */
export async function fetchTmdbSeries(
  title: string,
  apiKey: string,
): Promise<TmdbMeta | null> {
  try {
    const res = await axios.get(`${BASE}/search/tv`, {
      timeout: 8_000,
      params: { query: title, api_key: apiKey, language: 'pt-BR' },
    });
    const first = res.data?.results?.[0];
    if (!first) return null;
    return await fetchDetails('tv', first.id, apiKey);
  } catch {
    return null;
  }
}
