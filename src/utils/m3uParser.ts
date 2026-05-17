import { Channel } from '../types';

export interface ParseResult {
  channels: Channel[];
  groups: string[];
  errors: string[];
}

// Limite de canais para não OOM dispositivos com pouca RAM (Firestick, etc.)
const MAX_CHANNELS = 30_000;

/**
 * Parse an M3U playlist string into Channel objects.
 * Supports: #EXTM3U, #EXTINF, tvg-id, tvg-name, tvg-logo, group-title
 */
export function parseM3U(content: string): ParseResult {
  const lines = content.split('\n');
  const channels: Channel[] = [];
  const groupSet = new Set<string>();
  const errors: string[] = [];
  let i = 0;

  if (!lines[0]?.trimStart().startsWith('#EXTM3U')) {
    errors.push('Arquivo não começa com #EXTM3U. Pode não ser uma lista M3U válida.');
  }

  while (i < lines.length) {
    if (channels.length >= MAX_CHANNELS) {
      errors.push(`Lista truncada em ${MAX_CHANNELS} canais para proteger a memória do dispositivo.`);
      break;
    }

    const line = lines[i].trim();
    if (!line) { i++; continue; }

    if (line.startsWith('#EXTINF')) {
      // Procura a próxima linha não-vazia como URL
      let urlLine = '';
      let j = i + 1;
      while (j < lines.length) {
        const candidate = lines[j].trim();
        if (candidate && !candidate.startsWith('#')) { urlLine = candidate; break; }
        j++;
      }
      try {
        const channel = parseExtInf(line, urlLine);
        if (channel) {
          channels.push(channel);
          if (channel.group) groupSet.add(channel.group);
        }
      } catch (e) {
        errors.push(`Erro na linha ${i}`);
      }
      i = urlLine ? j + 1 : i + 1;
    } else {
      i++;
    }
  }

  return {
    channels,
    groups: Array.from(groupSet).sort(),
    errors,
  };
}

function parseExtInf(extinf: string, url: string): Channel | null {
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

  const id =
    `${name}-${url}`.replace(/\W/g, '').slice(0, 32) +
    Math.random().toString(36).slice(2, 6);

  return {
    id,
    name: cleanName(name),
    url: url.trim(),
    logo: tvgLogo || undefined,
    group,
    tvgId: tvgId || undefined,
    quality,
    isFavorite: false,
  };
}

function extractAttr(str: string, attr: string): string | null {
  const regex = new RegExp(`${attr}="([^"]*)"`, 'i');
  const match = str.match(regex);
  return match ? match[1] : null;
}

function detectQuality(str: string): string {
  const s = str.toUpperCase();
  if (s.includes('4K') || s.includes('UHD') || s.includes('2160')) return '4K';
  if (s.includes('FHD') || s.includes('1080')) return 'FHD';
  if (s.includes('HD') || s.includes('720')) return 'HD';
  if (s.includes('SD') || s.includes('480')) return 'SD';
  return 'HD';
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
