/**
 * httpJson.ts — helper único para GET JSON contra as APIs Xtream/IPTV.
 *
 * Centraliza o User-Agent e o tratamento da resposta `false` (padrão Xtream para
 * credenciais inválidas / servidor indisponível), evitando 3 cópias divergentes.
 */

import axios from 'axios';

export const IPTV_HEADERS = { 'User-Agent': 'okhttp/4.9.0' };

export async function fetchJson<T>(url: string, timeout = 30_000): Promise<T> {
  const res = await axios.get<T>(url, { timeout, headers: IPTV_HEADERS });
  if (res.data === false || res.data === null || res.data === undefined) {
    throw new Error('Credenciais inválidas ou servidor indisponível');
  }
  return res.data;
}
