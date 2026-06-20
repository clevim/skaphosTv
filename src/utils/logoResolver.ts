/**
 * logoResolver.ts — preenche logos faltantes de canais AO VIVO usando o iptv-org.
 *
 * Fontes: iptv-org/api channels.json (id, name, alt_names) + logos.json (channel → url).
 * Constrói um índice nome-normalizado → url (e id → url), cacheado em arquivo
 * (expo-file-system, sem o limite de tamanho do AsyncStorage) com TTL.
 * Casamento: 1) tvgId no padrão iptv-org; 2) nome normalizado / alt_names.
 *
 * Uso: chamar `enrichLiveLogos(channels)` ao carregar/adicionar uma lista.
 */
import * as FileSystem from 'expo-file-system';
import { Channel } from '../types';
import { detectType } from './channelUtils';

/** Live = streamType explícito (Xtream) ou heurística de grupo (M3U sem streamType). */
function isLive(c: Channel): boolean {
  if (c.streamType) return c.streamType === 'live';
  return detectType(c.group || '', c.name) === 'live';
}

const CHANNELS_URL = 'https://iptv-org.github.io/api/channels.json';
const LOGOS_URL = 'https://iptv-org.github.io/api/logos.json';
const CACHE_FILE = `${FileSystem.documentDirectory}logo-index.json`;
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

type Index = { byName: Record<string, string>; byId: Record<string, string> };

let mem: Index | null = null;
let loadPromise: Promise<Index | null> | null = null;

/** Normaliza nome p/ casar: minúsculas, sem acentos, sem qualidade/ruído, só alfanum. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\b(hd|fhd|sd|4k|uhd|fullhd|h265|h264|tv|canal|ao vivo|24h)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}

async function readCache(): Promise<Index | null> {
  try {
    const info = await FileSystem.getInfoAsync(CACHE_FILE);
    if (!info.exists) return null;
    const raw = await FileSystem.readAsStringAsync(CACHE_FILE);
    const parsed = JSON.parse(raw);
    if (parsed && parsed.ts && Date.now() - parsed.ts < TTL_MS && parsed.byName) {
      return { byName: parsed.byName, byId: parsed.byId ?? {} };
    }
  } catch { /* ignora cache inválido */ }
  return null;
}

async function buildIndex(): Promise<Index | null> {
  const cached = await readCache();
  if (cached) return cached;
  try {
    const [chRes, lgRes] = await Promise.all([fetch(CHANNELS_URL), fetch(LOGOS_URL)]);
    const channels: any[] = await chRes.json();
    const logos: any[] = await lgRes.json();

    const byId: Record<string, string> = {};
    for (const l of logos) {
      if (l?.channel && l?.url && !byId[l.channel]) byId[l.channel] = l.url;
    }
    const byName: Record<string, string> = {};
    for (const c of channels) {
      const url = byId[c?.id];
      if (!url) continue;
      const names = [c.name, ...(Array.isArray(c.alt_names) ? c.alt_names : [])];
      for (const n of names) {
        const k = norm(String(n || ''));
        if (k && !byName[k]) byName[k] = url;
      }
    }
    const index: Index = { byName, byId };
    FileSystem.writeAsStringAsync(CACHE_FILE, JSON.stringify({ ts: Date.now(), ...index })).catch(() => {});
    return index;
  } catch {
    return null;
  }
}

async function ensureIndex(): Promise<Index | null> {
  if (mem) return mem;
  if (!loadPromise) loadPromise = buildIndex().then(idx => (mem = idx));
  return loadPromise;
}

/**
 * Retorna a lista com `logo` preenchido para canais AO VIVO sem logo.
 * Não bloqueia se a rede falhar (retorna a lista original).
 */
export async function enrichLiveLogos(channels: Channel[]): Promise<Channel[]> {
  const needs = channels.some(c => !c.logo && isLive(c));
  if (!needs) return channels;

  const idx = await ensureIndex();
  if (!idx) return channels;

  let changed = false;
  const out = channels.map(c => {
    if (c.logo || !isLive(c)) return c;
    const url = (c.tvgId && idx.byId[c.tvgId]) || idx.byName[norm(c.name)];
    if (url) { changed = true; return { ...c, logo: url }; }
    return c;
  });
  return changed ? out : channels;
}
