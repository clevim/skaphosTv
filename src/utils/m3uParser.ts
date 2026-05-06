import { Channel } from '../../App';

export interface ParseResult {
  channels: Channel[];
  groups: string[];
  errors: string[];
}

/**
 * Parse an M3U playlist string into Channel objects.
 * Supports: #EXTM3U, #EXTINF, tvg-id, tvg-name, tvg-logo, group-title
 */
export function parseM3U(content: string): ParseResult {
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
  const channels: Channel[] = [];
  const groupSet = new Set<string>();
  const errors: string[] = [];
  let i = 0;

  if (!lines[0]?.startsWith('#EXTM3U')) {
    errors.push('Arquivo não começa com #EXTM3U. Pode não ser uma lista M3U válida.');
  }

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('#EXTINF')) {
      try {
        const channel = parseExtInf(line, lines[i + 1] || '');
        if (channel) {
          channels.push(channel);
          if (channel.group) groupSet.add(channel.group);
        }
        i += 2;
      } catch (e) {
        errors.push(`Erro na linha ${i}: ${line}`);
        i++;
      }
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

  // Extract attributes from #EXTINF line
  const tvgId = extractAttr(extinf, 'tvg-id') || extractAttr(extinf, 'tvg-ID');
  const tvgName = extractAttr(extinf, 'tvg-name');
  const tvgLogo = extractAttr(extinf, 'tvg-logo');
  const group = extractAttr(extinf, 'group-title') || 'Sem Categoria';

  // Channel name is after the last comma
  const commaIdx = extinf.lastIndexOf(',');
  const rawName = commaIdx >= 0 ? extinf.slice(commaIdx + 1).trim() : '';
  const name = tvgName || rawName || 'Canal sem nome';

  // Detect quality from name
  const quality = detectQuality(name + ' ' + url);

  const id = `${name}-${url}`.replace(/\W/g, '').slice(0, 32) + Math.random().toString(36).slice(2, 6);

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
    .replace(/\[.*?\]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/(HD|FHD|4K|SD|UHD)/gi, '')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Build M3U URL for Xtream Codes API
 */
export function buildXtreamM3U(host: string, username: string, password: string): string {
  const base = host.replace(/\/$/, '');
  return `${base}/get.php?username=${username}&password=${password}&type=m3u_plus&output=ts`;
}

/**
 * Build Xtream API URL for getting live streams
 */
export function buildXtreamApiUrl(host: string, username: string, password: string, action: string): string {
  const base = host.replace(/\/$/, '');
  return `${base}/player_api.php?username=${username}&password=${password}&action=${action}`;
}

/**
 * Build stream URL for Xtream channel
 */
export function buildXtreamStreamUrl(host: string, username: string, password: string, streamId: number): string {
  const base = host.replace(/\/$/, '');
  return `${base}/live/${username}/${password}/${streamId}.ts`;
}
