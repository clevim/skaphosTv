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

// Aceita aspas duplas OU simples — ambas são XML válido e feeds variam.
// Regex cacheada por nome de atributo/tag — nomes são um conjunto fixo pequeno
// (id/channel/start/stop/title/desc), recompilar a cada chamada é desperdício
// quando isso roda por dezenas de milhares de elementos.
const attrRegexCache = new Map<string, RegExp>();
function attr(attrs: string, name: string): string | null {
  let re = attrRegexCache.get(name);
  if (!re) { re = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'); attrRegexCache.set(name, re); }
  const m = attrs.match(re);
  return m ? (m[1] ?? m[2]) : null;
}

const tagRegexCache = new Map<string, RegExp>();
function tagText(body: string, tag: string): string | null {
  let re = tagRegexCache.get(tag);
  if (!re) { re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'); tagRegexCache.set(tag, re); }
  const m = body.match(re);
  return m ? decodeEntities(m[1]).trim() : null;
}

// XMLTV de painel chega a dezenas de MB. A abordagem original (regex global
// com [\s\S]*? capturando o corpo inteiro de CADA elemento) media 26s para achar
// 290 canais e 92s para os programas — a busca "lazy" pelo fechamento da tag,
// repetida por regex.exec em loop, é cara demais em cima de string tão grande,
// e capturava o corpo de programas que seriam descartados (canal/janela) de
// qualquer forma. Aqui o scan usa indexOf (busca de substring nativa, muito mais
// rápida que regex) e só extrai/aloca o corpo do elemento se ele passar no
// filtro — a maioria dos <programme> de um guia multi-canal/multi-dia é
// descartada antes de precisar do corpo. Cede o event loop a cada N elementos
// pra UI continuar viva.
const YIELD_EVERY = 2000;
const yieldToUI = () => new Promise<void>(r => setTimeout(r, 0));

/** Avança até a próxima ocorrência de `<tag`, retornando o range da tag de abertura
 *  (atributos) e o range do corpo (até `</tag>`). null quando não há mais. */
function nextElement(xml: string, tag: string, from: number): {
  attrsStart: number; attrsEnd: number; bodyStart: number; bodyEnd: number; nextPos: number;
} | null {
  const openTag = `<${tag}`;
  const closeTag = `</${tag}>`;
  const openIdx = xml.indexOf(openTag, from);
  if (openIdx === -1) return null;
  const tagClose = xml.indexOf('>', openIdx);
  if (tagClose === -1) return null;
  const bodyEnd = xml.indexOf(closeTag, tagClose);
  if (bodyEnd === -1) return null;
  return {
    attrsStart: openIdx + openTag.length,
    attrsEnd: tagClose,
    bodyStart: tagClose + 1,
    bodyEnd,
    nextPos: bodyEnd + closeTag.length,
  };
}

/** Mapa: id do canal no XMLTV → display-names. Só a seção <channel>, que é pequena. */
export async function parseXmltvChannels(xml: string): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  let pos = 0;
  let i = 0;
  let el: ReturnType<typeof nextElement>;
  while ((el = nextElement(xml, 'channel', pos)) !== null) {
    pos = el.nextPos;
    if (++i % YIELD_EVERY === 0) await yieldToUI();

    const attrs = xml.slice(el.attrsStart, el.attrsEnd);
    const id = attr(attrs, 'id');
    if (!id) continue;
    const body = xml.slice(el.bodyStart, el.bodyEnd);
    const names: string[] = [];
    const nameRe = /<display-name[^>]*>([\s\S]*?)<\/display-name>/gi;
    let nm: RegExpExecArray | null;
    while ((nm = nameRe.exec(body)) !== null) names.push(decodeEntities(nm[1]).trim());
    out.set(id.toLowerCase(), names);
  }
  return out;
}

/**
 * Extrai programas do XMLTV, mantendo apenas canais em `wantedIds` (ids do
 * XMLTV, minúsculos) e programas que intersectam [windowStart, windowEnd].
 */
export async function parseXmltvProgrammes(
  xml: string,
  wantedIds: Set<string>,
  windowStart: number,
  windowEnd: number,
): Promise<Map<string, EpgProgram[]>> {
  const out = new Map<string, EpgProgram[]>();
  let pos = 0;
  let i = 0;
  let el: ReturnType<typeof nextElement>;
  while ((el = nextElement(xml, 'programme', pos)) !== null) {
    pos = el.nextPos;
    if (++i % YIELD_EVERY === 0) await yieldToUI();

    const attrs = xml.slice(el.attrsStart, el.attrsEnd);
    // Filtro cedo, só com os atributos da tag de abertura — evita fatiar/alocar
    // o corpo (título/descrição) de programas que serão descartados de qualquer jeito.
    const chId = attr(attrs, 'channel')?.toLowerCase();
    if (!chId || !wantedIds.has(chId)) continue;
    const start = parseXmltvTime(attr(attrs, 'start') ?? '');
    const end = parseXmltvTime(attr(attrs, 'stop') ?? '');
    if (start == null || end == null || end <= windowStart || start >= windowEnd) continue;

    const body = xml.slice(el.bodyStart, el.bodyEnd);
    const title = tagText(body, 'title');
    if (!title) continue;
    const prog: EpgProgram = { start, end, title, desc: tagText(body, 'desc') ?? undefined };
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
