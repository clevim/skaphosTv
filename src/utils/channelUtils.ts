import type { Channel } from '../types';

// ponytail: mapear/indexar catálogos de 50k+ itens num loop síncrono trava a
// thread JS (web e nativo são igualmente single-thread). Chame isto a cada
// ~500-1000 itens dentro de loops grandes para devolver o controle ao event
// loop e manter a UI/spinner respondendo, sem limite de tamanho de catálogo.
export const yieldToUI = () => new Promise<void>(resolve => setTimeout(resolve, 0));

export const LAUNCH_YEAR = new Date().getFullYear().toString();

export const YEAR_GROUPS = ['Filmes', 'Séries'] as const;

/** Subcategorias fixas pra filtrar a lista de Favoritos por tipo de conteúdo. */
export const FAVORITES_GROUPS = ['Ao vivo', 'Filmes', 'Séries'] as const;

export const NAV_ITEMS = [
  { key: 'home',      label: 'Início',    icon: 'home-outline'   },
  { key: 'favorites', label: 'Favoritos', icon: 'heart-outline'  },
  { key: 'live',      label: 'Ao Vivo',   icon: 'radio-outline'  },
  { key: 'movies',    label: 'Filmes',    icon: 'film-outline'   },
  { key: 'series',    label: 'Séries',    icon: 'tv-outline'     },
  { key: 'year',      label: LAUNCH_YEAR, icon: 'star-outline'   },
  { key: 'search',    label: 'Busca',     icon: 'search-outline' },
];

// M3U genérico não tem streamType nem o marcador ♦ (esse é injetado só pelo
// nosso próprio código quando a fonte é Xtream — ver mapSeriesStream/
// xtreamEnricher). Sem essas palavras-chave, uma lista de outro provedor caia
// inteira em "ao vivo". pt/en/es cobre os formatos mais comuns.
const SERIES_KEYWORDS = ['série', 'series', 'novela', 'drama', 'anime', 'temporada', 'season'];
const MOVIE_KEYWORDS = ['filme', 'movie', 'vod', 'cinema', 'película', 'peliculas', 'filmes'];
const MOVIE_EXTENSIONS = ['.mp4', '.mkv', '.avi'];

function matchesAny(haystack: string, needles: string[]): boolean {
  return needles.some(n => haystack.includes(n));
}

/** Menor índice em que qualquer needle aparece na string, ou -1. */
function indexOfAny(haystack: string, needles: string[]): number {
  let min = -1;
  for (const n of needles) {
    const i = haystack.indexOf(n);
    if (i !== -1 && (min === -1 || i < min)) min = i;
  }
  return min;
}

/**
 * Veredito do GRUPO isolado — `null` quando o group-title não decide nada.
 *
 * Cacheado porque é o pedaço caro (duas alocações de string + 13 `indexOf`) e
 * depende SÓ do grupo: um catálogo de 30 mil canais tem algumas centenas de
 * categorias distintas, então o trabalho real cai para ~1% do que era. Sem isto
 * a análise era refeita por canal em cada varredura — construção do índice,
 * busca a cada tecla, seções da Home, `renderCard` de cada pôster.
 *
 * O mapa é determinístico (mesma entrada → mesma saída para sempre) e limitado
 * pelo número de categorias da lista, então não precisa de invalidação.
 * ponytail: sem teto. Se algum dia uma fonte gerar grupo por item, vira LRU.
 */
const groupVerdictCache = new Map<string, 'movies' | 'series' | null>();

function groupVerdict(group: string): 'movies' | 'series' | null {
  const cached = groupVerdictCache.get(group);
  if (cached !== undefined) return cached;

  const clean = group.replace(/\uFE0F/g, '').toLowerCase(); // normaliza ♦️ → ♦
  let verdict: 'movies' | 'series' | null;
  if (clean.includes('♦') || clean.includes('◆')) {
    verdict = 'movies';
  } else {
    const sIdx = indexOfAny(clean, SERIES_KEYWORDS);
    const mIdx = indexOfAny(clean, MOVIE_KEYWORDS);
    if (sIdx !== -1 && (mIdx === -1 || sIdx <= mIdx)) verdict = 'series';
    else if (mIdx !== -1) verdict = 'movies';
    else verdict = null;
  }
  groupVerdictCache.set(group, verdict);
  return verdict;
}

/**
 * Detecta o tipo do conteúdo pela group-title (e opcionalmente URL) do M3U,
 * em cadeia de sinais — do mais confiável ao mais fraco:
 *  1. Nome com S##E## → série, sempre (antes só valia com o marcador ♦).
 *  2. Marcador ♦️/◆ no grupo (injetado internamente p/ fontes Xtream) → filme.
 *  3. Palavra-chave de série/filme no group-title — a que aparece PRIMEIRO na
 *     string ganha: em "Filmes | Drama" o prefixo de categoria ("filmes")
 *     decide e "drama" fica como gênero; "Séries | Drama" segue série.
 *  4. Extensão de VOD na URL (.mp4/.mkv/.avi) → filme — sinal mais fraco,
 *     só usado se nada acima decidiu.
 *  5. Default → ao vivo (comportamento anterior preservado).
 */
export function detectType(group: string, name?: string, url?: string): 'live' | 'movies' | 'series' {
  const isSeriesName = !!name && /S\d+\s*E\d+/i.test(name);
  if (isSeriesName) return 'series';

  const fromGroup = groupVerdict(group);
  if (fromGroup) return fromGroup;
  if (url && matchesAny(url.toLowerCase(), MOVIE_EXTENSIONS)) return 'movies';
  return 'live';
}

/**
 * Tipo efetivo do conteúdo, normalizado para 'live' | 'movies' | 'series'.
 * Ordem de precedência: 1) override manual do usuário pra esse grupo/fonte
 * (ver IPTVSource.groupTypeOverrides em useStore.ts); 2) `streamType` explícito
 * (Xtream/Jellyfin); 3) heurística por group-title/URL (detectType) — caso de
 * M3U puro sem correção manual.
 */
export function resolveContentType(
  channel: Channel,
  groupOverrides?: Record<string, 'live' | 'movies' | 'series'>,
): 'live' | 'movies' | 'series' {
  const override = groupOverrides?.[channel.group || ''];
  if (override) return override;
  switch (channel.streamType) {
    case 'series': return 'series';
    case 'movie':  return 'movies';
    case 'live':   return 'live';
    default:       return detectType(channel.group || '', channel.name, channel.url);
  }
}

/**
 * Detecta a qualidade a partir de uma string livre (nome e/ou URL do stream).
 * Fonte única — antes havia 3 cópias divergentes (m3uParser, xtreamLoader, phased).
 */
export function detectQuality(str: string): string {
  const s = str.toUpperCase();
  if (s.includes('4K') || s.includes('UHD') || s.includes('2160')) return '4K';
  if (s.includes('FHD') || s.includes('1080')) return 'FHD';
  if (s.includes('HD') || s.includes('720')) return 'HD';
  if (s.includes('SD') || s.includes('480')) return 'SD';
  return 'HD';
}

/**
 * Nome de exibição de um grupo/categoria: remove o marcador ♦ de série e o
 * prefixo "Categoria | " que alguns provedores Xtream usam (ex.: "FILMES | AÇÃO"
 * → "AÇÃO", "Series | Amazon Prime Video" → "Amazon Prime Video"). Mantém a
 * string original (com o prefixo) intacta em todo o resto do app — isso é só
 * pra exibição.
 */
// Emoji/pictogramas (BMP símbolos + pares substitutos) e seletores de variação.
// Regex explícita (sem \p{}) pra não depender do suporte do Hermes.
const EMOJI_RE = /[\u2190-\u21FF\u2300-\u23FF\u2600-\u27BF\u2B00-\u2BFF\uFE0F\u200D\u20E3]|[\uD83C-\uD83E][\uDC00-\uDFFF]/g;

export function cleanGroupName(group: string): string {
  const withoutMarker = group.replace(EMOJI_RE, '').replace(/[♦◆]\s*/g, '').replace(/\s+/g, ' ').trim();
  const pipeIdx = withoutMarker.indexOf('|');
  return pipeIdx === -1 ? withoutMarker : withoutMarker.slice(pipeIdx + 1).trim();
}

const SMALL_PT = /^(De|Da|Do|Das|Dos)$/;
const nameCache = new Map<string, string>();

/**
 * Nome de exibição de canal/título: tira emoji, tags de provedor ("[L]", sufixo
 * HD/FHD²/UHD/4K — a qualidade já tem badge própria), normaliza "( 2021 )" e a
 * caixa. Só EXIBIÇÃO: id, busca e agrupamento seguem usando o nome cru.
 * ponytail: nomes TODO EM MAIÚSCULA com 3+ palavras viram Title Case (siglas de
 * até 3 letras ficam); com 1-2 palavras ficam como estão pra não virar "Espn".
 */
export function cleanDisplayName(name: string): string {
  const hit = nameCache.get(name);
  if (hit !== undefined) return hit;
  let n = name
    .replace(EMOJI_RE, '')
    .replace(/\s*\[[A-Za-z]{1,4}\]/g, '')
    .replace(/\(\s*(\d{4})\s*\)/g, '($1)')
    .replace(/(\s*[|\-–]?\s*\b(?:FHD|UHD|HD|SD|4K)\b[²³¹]*)+\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!n) n = name.trim();
  const words = n.split(' ');
  const letters = n.replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (words.length >= 3 && letters.length > 3 && letters === letters.toUpperCase()) {
    n = words.map(w => {
      const bare = w.replace(/[^A-Za-zÀ-ÿ]/g, '');
      if (bare.length <= 3 && !/^(DE|DA|DO|DAS|DOS|E|EM)$/.test(bare)) return w;
      const t = w.charAt(0) + w.slice(1).toLowerCase();
      return /^(De|Da|Do|Das|Dos|E|Em)$/.test(t) ? t.toLowerCase() : t;
    }).join(' ');
  }
  n = words.length > 1 ? n.split(' ').map((w, i) => (i > 0 && SMALL_PT.test(w) ? w.toLowerCase() : w)).join(' ') : n;
  if (nameCache.size > 50_000) nameCache.clear();
  nameCache.set(name, n);
  return n;
}

// ponytail: cache nome→base. São 4 regex por chamada e o índice/dedup/ordenação/
// render chamam isto várias vezes pros MESMOS nomes a cada rebuild — o cache
// transforma tudo em lookup O(1). Cap alto só pra não crescer sem teto.
const seriesBaseCache = new Map<string, string>();
export function getSeriesBaseName(name: string): string {
  const hit = seriesBaseCache.get(name);
  if (hit !== undefined) return hit;
  const base = name
    .replace(/\s*[-–]?\s*S\d+\s*E\d+.*$/i, '')
    .replace(/\s*[-–]?\s*S\d+\s*$/i, '')
    .replace(/\s*[-–]?\s*T\d+\s*$/i, '')
    .replace(/\s*\(\d{4}\)\s*$/, '')
    .trim();
  if (seriesBaseCache.size > 120_000) seriesBaseCache.clear();
  seriesBaseCache.set(name, base);
  return base;
}

/**
 * Retorna true se o canal é do ano de lançamento atual.
 * Verifica o nome primeiro (ex: "Filme (2026)", "Filme [2026]", "Filme 2026"),
 * e em seguida o releaseDate (ex: "2026-05-01", "2026", "01/2026").
 */
// LAUNCH_YEAR é constante, então a regex também é. `new RegExp` com string
// montada NÃO é cacheada pela engine — recompilava a cada chamada, e esta função
// roda por CADA filme e CADA série na construção do índice (dezenas de milhares,
// duas vezes quando há releaseDate) e de novo por card desenhado na Home, pro
// selo "NOVO". Mesma lição já aplicada em m3uParser.ts e epg.ts.
const LAUNCH_YEAR_RE = new RegExp(`\\b${LAUNCH_YEAR}\\b`);

export function isLaunchYear(name: string, releaseDate?: string): boolean {
  if (
    name.includes(`(${LAUNCH_YEAR})`) ||
    name.includes(`[${LAUNCH_YEAR}]`) ||
    LAUNCH_YEAR_RE.test(name)
  ) return true;

  if (releaseDate) {
    return LAUNCH_YEAR_RE.test(releaseDate);
  }
  return false;
}
