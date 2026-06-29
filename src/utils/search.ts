// search.ts — busca de catálogo com tolerância a acentos, múltiplos termos e ranking.
import { Channel } from '../types';
import { resolveContentType, getSeriesBaseName } from './channelUtils';

export type SearchType = 'all' | 'live' | 'movies' | 'series';

/** Remove acentos e baixa caixa — busca tolerante a acentuação (pt-BR: "acao" acha "Ação"). */
export function fold(s: string): string {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Pesquisa nos canais. Casa TODOS os termos (separados por espaço) no nome ou no grupo,
 * sem depender de acentuação, e ordena por relevância:
 *   nome exato > começa com > início de palavra > contém > todos termos no nome > só no grupo.
 * Deduplica por tipo+nome (séries colapsam por nome-base) e limita o total.
 */
export function searchChannels(
  channels: Channel[],
  rawQuery: string,
  type: SearchType = 'all',
  limit = 100,
): Channel[] {
  const q = fold(rawQuery);
  if (!q) return [];
  const terms = q.split(/\s+/).filter(Boolean);
  const wordStart = new RegExp(`(^|\\s)${escapeRegExp(q)}`);

  const seen = new Set<string>();
  const scored: { c: Channel; displayName: string; score: number; len: number }[] = [];

  for (const c of channels) {
    const ct = resolveContentType(c);
    if (type !== 'all' && ct !== type) continue;

    const displayName = ct === 'series' ? getSeriesBaseName(c.name) : c.name;
    const key = ct + '|' + displayName.toLowerCase();
    if (seen.has(key)) continue;

    const nameF = fold(displayName);
    const groupF = fold(c.group || '');
    const inNameAll = terms.every(t => nameF.includes(t));
    const matched = inNameAll || terms.every(t => nameF.includes(t) || groupF.includes(t));
    if (!matched) continue;
    seen.add(key);

    let score: number;
    if (nameF === q) score = 100;
    else if (nameF.startsWith(q)) score = 85;
    else if (wordStart.test(nameF)) score = 70;
    else if (nameF.includes(q)) score = 55;
    else if (inNameAll) score = 40;
    else score = 20; // casou apenas via grupo/categoria
    if (c.logo) score += 3; // resultados com pôster rendem cards melhores

    scored.push({ c, displayName, score, len: displayName.length });
  }

  // Maior score primeiro; empate → nome mais curto (mais específico) primeiro
  scored.sort((a, b) => b.score - a.score || a.len - b.len);
  return scored.slice(0, limit).map(s => ({ ...s.c, name: s.displayName }));
}
