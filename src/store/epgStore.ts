/**
 * epgStore — guia de programação real, em memória, com TTL.
 *
 * `load()` percorre as fontes configuradas, baixa o XMLTV de cada uma
 * (Xtream: xmltv.php; M3U: url-tvg salvo na fonte), casa os canais do app
 * com os ids do guia (tvg-id direto; nome normalizado como fallback) e
 * guarda os programas indexados por Channel.id — O(1) para a UI.
 *
 * Sem persistência em disco de propósito: o XMLTV muda o dia todo e o parse
 * já limita à janela de -6h..+36h, então recarregar a cada TTL é barato
 * comparado ao custo de manter MBs no AsyncStorage.
 */
import { create } from 'zustand';
import axios from 'axios';
import { useStore } from './useStore';
import { normalizeHost } from '../utils/xtreamApi';
import {
  EpgProgram, parseXmltvChannels, parseXmltvProgrammes, normalizeChannelName,
} from '../utils/epg';

const TTL_MS = 3 * 60 * 60_000;         // guia vale por 3h
const WINDOW_BACK_MS = 6 * 60 * 60_000; // programas de até 6h atrás (scroll p/ trás)
const WINDOW_FWD_MS = 36 * 60 * 60_000; // e até 36h à frente

interface EpgState {
  /** Channel.id (do app) → programas ordenados por início. */
  byChannelId: Record<string, EpgProgram[]>;
  loading: boolean;
  error: string | null;
  loadedAt: number;
  load: (force?: boolean) => Promise<void>;
}

/** URLs de guia XMLTV disponíveis nas fontes configuradas. */
function guideUrls(): string[] {
  const { sources } = useStore.getState();
  const urls: string[] = [];
  for (const s of sources) {
    if (s.type === 'xtream' && s.host && s.username && s.password) {
      urls.push(`${normalizeHost(s.host)}/xmltv.php?username=${s.username}&password=${s.password}`);
    }
    if (s.type === 'm3u' && s.epgUrl) {
      urls.push(s.epgUrl);
    }
  }
  return urls;
}

export const useEpgStore = create<EpgState>((set, get) => ({
  byChannelId: {},
  loading: false,
  error: null,
  loadedAt: 0,

  load: async (force = false) => {
    const state = get();
    if (state.loading) return;
    if (!force && Date.now() - state.loadedAt < TTL_MS && Object.keys(state.byChannelId).length > 0) return;

    const urls = guideUrls();
    if (urls.length === 0) {
      set({ error: 'Nenhuma fonte com guia de programação (XMLTV) disponível', loading: false });
      return;
    }

    set({ loading: true, error: null });
    const windowStart = Date.now() - WINDOW_BACK_MS;
    const windowEnd = Date.now() + WINDOW_FWD_MS;

    // Canais ao vivo do app: índices por tvg-id e por nome normalizado
    const channels = useStore.getState().channels;
    const byTvgId = new Map<string, string[]>();   // tvgId → [Channel.id]
    const byName = new Map<string, string[]>();    // nome normalizado → [Channel.id]
    for (const c of channels) {
      if (c.streamType === 'movie' || c.streamType === 'series') continue;
      if (c.tvgId) {
        const key = c.tvgId.toLowerCase();
        (byTvgId.get(key) ?? byTvgId.set(key, []).get(key)!).push(c.id);
      }
      const nk = normalizeChannelName(c.name);
      if (nk) (byName.get(nk) ?? byName.set(nk, []).get(nk)!).push(c.id);
    }

    const merged: Record<string, EpgProgram[]> = {};
    const errors: string[] = [];

    await Promise.allSettled(urls.map(async (url) => {
      try {
        const res = await axios.get(url, {
          timeout: 90_000,
          responseType: 'text',
          headers: { 'User-Agent': 'okhttp/4.9.0' },
          // Feeds grandes: transformResponse identity evita JSON.parse acidental
          transformResponse: [(d: any) => d],
        });
        const xml: string = res.data;
        if (!xml || typeof xml !== 'string' || !xml.includes('<tv')) {
          throw new Error('Resposta não é XMLTV');
        }

        // 1) Seção <channel>: resolve quais ids do guia interessam
        const guideChannels = parseXmltvChannels(xml);
        const xmltvToApp = new Map<string, string[]>(); // xmltvId → [Channel.id]
        for (const [gid, names] of guideChannels) {
          const direct = byTvgId.get(gid);
          if (direct) { xmltvToApp.set(gid, direct); continue; }
          for (const n of names) {
            const viaName = byName.get(normalizeChannelName(n));
            if (viaName) { xmltvToApp.set(gid, viaName); break; }
          }
        }
        // tvg-ids que nem aparecem na seção <channel> (alguns feeds a omitem)
        for (const [tvgId, ids] of byTvgId) {
          if (!xmltvToApp.has(tvgId)) xmltvToApp.set(tvgId, ids);
        }

        // 2) Programas — só dos ids casados, dentro da janela
        const progs = parseXmltvProgrammes(xml, new Set(xmltvToApp.keys()), windowStart, windowEnd);
        for (const [gid, list] of progs) {
          for (const appId of xmltvToApp.get(gid) ?? []) {
            // Primeiro guia a preencher um canal vence (evita duplicar multi-fonte)
            if (!merged[appId]) merged[appId] = list;
          }
        }
      } catch (e: any) {
        errors.push(e?.message ?? 'Falha ao baixar guia');
      }
    }));

    const gotAny = Object.keys(merged).length > 0;
    set({
      byChannelId: gotAny ? merged : get().byChannelId,
      loading: false,
      loadedAt: gotAny ? Date.now() : get().loadedAt,
      error: gotAny ? null : (errors[0] ?? 'O guia não retornou programação para seus canais'),
    });
  },
}));
