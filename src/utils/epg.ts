/**
 * epg.ts — parser XMLTV e casamento de canais com o guia.
 *
 * Fontes de guia (todas gratuitas, sem chave):
 *  - Xtream: `{host}/xmltv.php?username=&password=` — guia completo do painel;
 *  - M3U: atributo `url-tvg`/`x-tvg-url` no cabeçalho `#EXTM3U` (padrão usado
 *    por listas como as do iptv-org, apontando para um XMLTV externo).
 *
 * O parser é regex-based (RN não tem DOMParser) e descarta cedo o que não
 * interessa: só programas dentro da janela de tempo pedida e de canais que
 * existem na lista do app — XMLTV de painel pode ter dezenas de MB.
 */

export interface EpgProgram {
  /** epoch ms */
  start: number;
  end: number;
  title: string;
  desc?: string;
}

/** Casa app-channels ↔ ids do XMLTV: tvg-id direto, ou nome normalizado. */
export function normalizeChannelName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(hd|fhd|uhd|sd|4k|8k|h265|hevc|raw)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/** `20260701123000 +0000` → epoch ms. Sem offset, assume horário local. */
export function parseXmltvTime(s: string): number | null {
  const m = s.trim().match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-]\d{4})?/);
  if (!m) return null;
  const [, y, mo, d, h, mi, se, tz] = m;
  if (tz) {
    const sign = tz[0] === '-' ? -1 : 1;
    const offMin = sign * (parseInt(tz.slice(1, 3), 10) * 60 + parseInt(tz.slice(3, 5), 10));
    return Date.UTC(+y, +mo - 1, +d, +h, +mi, +(se ?? '0')) - offMin * 60_000;
  }
  return new Date(+y, +mo - 1, +d, +h, +mi, +(se ?? '0')).getTime();
}

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

// Aceita aspas duplas OU simples — ambas são XML válido e feeds variam
function attr(attrs: string, name: string): string | null {
  const m = attrs.match(new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  return m ? (m[1] ?? m[2]) : null;
}

function tagText(body: string, tag: string): string | null {
  const m = body.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? decodeEntities(m[1]).trim() : null;
}

/** Mapa: id do canal no XMLTV → display-names. Só a seção <channel>, que é pequena. */
export function parseXmltvChannels(xml: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const re = /<channel\b([^>]*)>([\s\S]*?)<\/channel>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const id = attr(m[1], 'id');
    if (!id) continue;
    const names: string[] = [];
    const nameRe = /<display-name[^>]*>([\s\S]*?)<\/display-name>/gi;
    let nm: RegExpExecArray | null;
    while ((nm = nameRe.exec(m[2])) !== null) names.push(decodeEntities(nm[1]).trim());
    out.set(id.toLowerCase(), names);
  }
  return out;
}

/**
 * Extrai programas do XMLTV, mantendo apenas canais em `wantedIds` (ids do
 * XMLTV, minúsculos) e programas que intersectam [windowStart, windowEnd].
 */
export function parseXmltvProgrammes(
  xml: string,
  wantedIds: Set<string>,
  windowStart: number,
  windowEnd: number,
): Map<string, EpgProgram[]> {
  const out = new Map<string, EpgProgram[]>();
  const re = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const attrs = m[1];
    const chId = attr(attrs, 'channel')?.toLowerCase();
    if (!chId || !wantedIds.has(chId)) continue;
    const start = parseXmltvTime(attr(attrs, 'start') ?? '');
    const end = parseXmltvTime(attr(attrs, 'stop') ?? '');
    if (start == null || end == null || end <= windowStart || start >= windowEnd) continue;
    const title = tagText(m[2], 'title');
    if (!title) continue;
    const prog: EpgProgram = { start, end, title, desc: tagText(m[2], 'desc') ?? undefined };
    const list = out.get(chId);
    if (list) list.push(prog); else out.set(chId, [prog]);
  }
  for (const list of out.values()) list.sort((a, b) => a.start - b.start);
  return out;
}

/** Programa atual e o seguinte para uma lista ordenada de programas. */
export function nowNextFor(
  programs: EpgProgram[] | undefined,
  now = Date.now(),
): { now?: EpgProgram; next?: EpgProgram } {
  if (!programs || programs.length === 0) return {};
  for (let i = 0; i < programs.length; i++) {
    const p = programs[i];
    if (p.start <= now && now < p.end) return { now: p, next: programs[i + 1] };
    if (p.start > now) return { next: p };
  }
  return {};
}
