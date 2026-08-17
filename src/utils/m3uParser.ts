import { Channel } from '../types';
import { detectQuality, yieldToUI } from './channelUtils';

export interface ParseResult {
  channels: Channel[];
  groups: string[];
  errors: string[];
  /** URL de guia XMLTV declarada no cabeçalho (#EXTM3U url-tvg="..." / x-tvg-url). */
  tvgUrl?: string;
}

// Limite de canais para não OOM dispositivos com pouca RAM (Firestick, etc.)
const MAX_CHANNELS = 30_000;

/**
 * Parse an M3U playlist string into Channel objects.
 * Supports: #EXTM3U, #EXTINF, tvg-id, tvg-name, tvg-logo, group-title
 */
export async function parseM3U(content: string): Promise<ParseResult> {
  const lines = content.split('\n');
  const channels: Channel[] = [];
  const groupSet = new Set<string>();
  const errors: string[] = [];
  let i = 0;

  if (!lines[0]?.trimStart().startsWith('#EXTM3U')) {
    errors.push('Arquivo não começa com #EXTM3U. Pode não ser uma lista M3U válida.');
  }

  // Guia XMLTV declarado no cabeçalho — usado pelo EPG (padrão iptv-org e afins)
  const tvgUrl =
    extractAttr(lines[0] ?? '', 'url-tvg') ||
    extractAttr(lines[0] ?? '', 'x-tvg-url') ||
    undefined;

  while (i < lines.length) {
    if (channels.length >= MAX_CHANNELS) {
      errors.push(`Lista truncada em ${MAX_CHANNELS} canais para proteger a memória do dispositivo.`);
      break;
    }

    const line = lines[i].trim();
    if (!line) { i++; continue; }

    if (line.startsWith('#EXTINF')) {
      // Procura a próxima linha não-vazia como URL, colhendo no caminho as
      // diretivas #EXTVLCOPT do canal. Elas ficam ENTRE o #EXTINF e a URL, e
      // eram descartadas junto com o resto dos comentários — canal que exige
      // user-agent próprio respondia 403 e aparecia pro usuário como
      // "Acesso negado. Verifique sua assinatura.", que é a mensagem errada.
      let urlLine = '';
      let userAgent: string | undefined;
      let referrer: string | undefined;
      let j = i + 1;
      while (j < lines.length) {
        const candidate = lines[j].trim();
        if (candidate && !candidate.startsWith('#')) { urlLine = candidate; break; }
        const opt = parseVlcOpt(candidate);
        if (opt?.key === 'http-user-agent') userAgent = opt.value;
        // A grafia com dois "r" é a do VLC; a com um só aparece em listas por engano.
        else if (opt?.key === 'http-referrer' || opt?.key === 'http-referer') referrer = opt.value;
        j++;
      }
      try {
        const channel = parseExtInf(line, urlLine, userAgent, referrer);
        if (channel) {
          channels.push(channel);
          if (channel.group) groupSet.add(channel.group);
        }
      } catch (e) {
        errors.push(`Erro na linha ${i}`);
      }
      // ponytail: listas de 30k canais travavam a thread num loop síncrono só
      // (mesma causa do freeze em Xtream) — cede o event loop periodicamente.
      if (channels.length % 500 === 0) await yieldToUI();
      i = urlLine ? j + 1 : i + 1;
    } else {
      i++;
    }
  }

  return {
    channels,
    groups: Array.from(groupSet).sort(),
    errors,
    tvgUrl,
  };
}

/** `#EXTVLCOPT:http-user-agent=Mozilla/5.0` → { key, value }. */
function parseVlcOpt(line: string): { key: string; value: string } | null {
  if (!line.startsWith('#EXTVLCOPT:')) return null;
  const body = line.slice('#EXTVLCOPT:'.length);
  const eq = body.indexOf('=');
  if (eq <= 0) return null;
  const value = body.slice(eq + 1).trim();
  if (!value) return null;
  return { key: body.slice(0, eq).trim().toLowerCase(), value };
}

function parseExtInf(
  extinf: string,
  url: string,
  userAgent?: string,
  referrer?: string,
): Channel | null {
  if (!url || url.startsWith('#')) return null;

  const tvgId = extractAttr(extinf, 'tvg-id') || extractAttr(extinf, 'tvg-ID');
  const tvgName = extractAttr(extinf, 'tvg-name');
  const tvgLogo = extractAttr(extinf, 'tvg-logo');
  const group = extractAttr(extinf, 'group-title') || 'Sem Categoria';

  const commaIdx = extinf.lastIndexOf(',');
  const rawName = commaIdx >= 0 ? extinf.slice(commaIdx + 1).trim() : '';

  // Prefer rawName when it has year info that tvgName lacks
  // e.g. tvg-name="Filme" but display name is "Filme (2026)"
  const hasYear = (s: string) => /\(\d{4}\)|\[\d{4}\]/.test(s);
  const name =
    tvgName && rawName && !hasYear(tvgName) && hasYear(rawName)
      ? rawName
      : tvgName || rawName || 'Canal sem nome';
  const quality = detectQuality(name + ' ' + url);

  // ponytail: era `+ Math.random()` — gerava um id NOVO a cada reparse da
  // mesma lista, perdendo favoritos/progresso a cada refresh. Hash da URL
  // (identidade estável do stream) é determinístico e cobre qualquer volume.
  const id = 'm3u-' + hashString(url);

  return {
    id,
    name: cleanName(name),
    url: url.trim(),
    logo: tvgLogo || undefined,
    group,
    tvgId: tvgId || undefined,
    quality,
    isFavorite: false,
    httpUserAgent: userAgent,
    httpReferrer: referrer,
  };
}

// ponytail: `new RegExp` dinâmico não é cacheado pela engine — recompilar a
// cada chamada (5x por canal x 30k canais = 150k compilações) é desperdício
// puro. Os nomes de atributo são um conjunto fixo, então cacheia por nome.
const attrRegexCache = new Map<string, RegExp>();
function hashString(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function extractAttr(str: string, attr: string): string | null {
  let regex = attrRegexCache.get(attr);
  if (!regex) {
    regex = new RegExp(`${attr}="([^"]*)"`, 'i');
    attrRegexCache.set(attr, regex);
  }
  const match = str.match(regex);
  return match ? match[1] : null;
}

function cleanName(name: string): string {
  return name
    .replace(/\[(?!\d{4})[^\]]*\]/g, '')   // remove [TAG] mas preserva [2024], [2025], etc.
    .replace(/\((?!\d{4}\))[^)]*\)/g, '')   // remove (TAG) mas preserva (2024), (2025), etc.
    .replace(/(HD|FHD|4K|SD|UHD)/gi, '')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Cabeçalhos HTTP para tocar um canal.
 *
 * O provedor manda no assunto: quando a lista declara um user-agent para o
 * canal (#EXTVLCOPT), é ELE que o servidor espera — mandar o nosso volta 403.
 * Sem declaração, segue o padrão que os painéis Xtream aceitam.
 */
export function streamHeaders(ch: { httpUserAgent?: string; httpReferrer?: string }): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': ch.httpUserAgent || 'okhttp/4.9.0',
    'Connection': 'keep-alive',
  };
  // Nome do cabeçalho é "Referer" (erro de grafia consagrado no HTTP), embora
  // a diretiva do VLC seja "referrer".
  if (ch.httpReferrer) headers.Referer = ch.httpReferrer;
  return headers;
}

/**
 * Corrige/normaliza a URL do stream para o ExoPlayer.
 * - .avi → .mp4  (ExoPlayer não suporta .avi)
 */
export function fixStreamUrl(url: string): string {
  if (!url) return url;
  if (url.endsWith('.avi')) return url.slice(0, -4) + '.mp4';
  return url;
}

/**
 * Detecta o tipo do stream pela URL para passar ao ExoPlayer via prop `type`.
 * Retorna 'mpegts' para .ts e URLs sem extensão (canais live).
 */
export function detectStreamType(url: string): 'mpegts' | undefined {
  if (!url) return undefined;
  if (
    url.endsWith('.mp4') ||
    url.endsWith('.mkv') ||
    url.endsWith('.m3u8') ||
    url.endsWith('.avi')
  ) {
    return undefined;
  }
  if (url.endsWith('.ts')) return 'mpegts';
  return 'mpegts';
}
