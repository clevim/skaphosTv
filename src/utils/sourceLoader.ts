/**
 * sourceLoader.ts — recarrega os canais de UMA fonte usando as credenciais já salvas.
 * Usado pelo "Recarregar" do gerenciador de fontes e pelo carregamento da Home.
 */
import axios from 'axios';
import { Channel } from '../types';
import { useStore, IPTVSource } from '../store/useStore';
import { loadXtreamPhased } from './xtreamPhasedLoader';
import { loadJellyfinContent } from './jellyfinLoader';
import { parseM3U } from './m3uParser';

/** Xtream via loader FASEADO (live → filmes → séries, uma fase crua na memória
 *  por vez), acumulando o resultado no formato { channels, groups } que os
 *  chamadores esperam. Substitui o antigo xtreamLoader.ts, que baixava os 6
 *  endpoints em paralelo — os 3 JSONs crus (séries passa de 10 MB) coexistiam
 *  inteiros na RAM com os Channels mapeados, o pico que travava device fraco. */
async function loadXtreamAccumulated(
  host: string,
  username: string,
  password: string,
): Promise<{ channels: Channel[]; groups: string[] }> {
  const channels: Channel[] = [];
  const groupSet = new Set<string>();
  let firstError: string | null = null;
  await loadXtreamPhased({
    host, username, password,
    onPhaseStart: () => {},
    onProgress: () => {},
    onPhaseComplete: (r) => {
      for (const c of r.channels) channels.push(c);
      for (const g of r.groups) groupSet.add(g);
    },
    onError: (_phase, msg) => { firstError = firstError ?? msg; },
  });
  // Todas as fases falharam → propaga o erro (o retry do boot depende disso);
  // falha parcial mantém o que veio (mesma tolerância do loader antigo).
  if (channels.length === 0 && firstError) throw new Error(firstError);
  return { channels, groups: Array.from(groupSet).sort() };
}

export async function loadSourceChannels(
  source: IPTVSource,
): Promise<{ channels: Channel[]; groups: string[] }> {
  if (source.type === 'xtream') {
    const host = source.host?.replace(/\/$/, '') || '';
    return loadXtreamAccumulated(host, source.username || '', source.password || '');
  }
  if (source.type === 'jellyfin') {
    const host = source.host?.replace(/\/$/, '') || '';
    return loadJellyfinContent(host, source.apiKey!, source.userId!, source.serverName || source.name);
  }
  // M3U
  if (!source.url) return { channels: [], groups: [] };
  const response = await axios.get(source.url, {
    timeout: 60000,
    headers: { 'User-Agent': 'okhttp/4.9.0' },
  });
  const result = await parseM3U(response.data);
  // Fontes antigas (adicionadas antes do EPG) ganham o url-tvg no próximo reload
  if (result.tvgUrl && result.tvgUrl !== source.epgUrl) {
    useStore.getState().updateSource(source.id, { epgUrl: result.tvgUrl });
  }
  return result;
}
