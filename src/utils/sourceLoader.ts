/**
 * sourceLoader.ts — recarrega os canais de UMA fonte usando as credenciais já salvas.
 * Usado pelo "Recarregar" do gerenciador de fontes e pelo carregamento da Home.
 */
import axios from 'axios';
import { Channel } from '../types';
import { IPTVSource } from '../store/useStore';
import { loadXtreamChannels } from './xtreamLoader';
import { loadJellyfinContent } from './jellyfinLoader';
import { parseM3U } from './m3uParser';

export async function loadSourceChannels(
  source: IPTVSource,
): Promise<{ channels: Channel[]; groups: string[] }> {
  if (source.type === 'xtream') {
    const host = source.host?.replace(/\/$/, '') || '';
    return loadXtreamChannels(host, source.username || '', source.password || '');
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
  return parseM3U(response.data);
}
