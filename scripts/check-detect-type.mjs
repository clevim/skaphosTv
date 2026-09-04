// Checagem da classificação de conteúdo. `node scripts/check-detect-type.mjs`
// Garante que o cache de veredito por grupo não mudou o comportamento.
import assert from 'node:assert/strict';
import { detectType, isLaunchYear, LAUNCH_YEAR } from '../src/utils/channelUtils.ts';

// ── Precedência: nome S##E## ganha de tudo ───────────────────────────────────
assert.equal(detectType('FILMES | AÇÃO', 'Breaking Bad S01E02'), 'series', 'S##E## vence o grupo de filme');
assert.equal(detectType('', 'Show S2 E10'), 'series', 'aceita espaço entre S e E');

// ── Marcador ♦ (injetado para séries Xtream) → o grupo é de filme ────────────
assert.equal(detectType('♦ Netflix', 'X'), 'movies');
assert.equal(detectType('♦️ Netflix', 'X'), 'movies', 'variação com VS16');
assert.equal(detectType('◆ Netflix', 'X'), 'movies');

// ── Palavra-chave: a que aparece PRIMEIRO decide ────────────────────────────
assert.equal(detectType('Filmes | Drama', 'X'), 'movies', 'prefixo de categoria decide');
assert.equal(detectType('Séries | Drama', 'X'), 'series');
assert.equal(detectType('Drama | Filmes', 'X'), 'series', 'drama vem antes → série');
assert.equal(detectType('ANIME', 'X'), 'series');
assert.equal(detectType('VOD Cinema', 'X'), 'movies');

// ── URL só é consultada quando o grupo não decide ───────────────────────────
assert.equal(detectType('Diversos', 'X', 'http://h/a.mp4'), 'movies');
assert.equal(detectType('Diversos', 'X', 'http://h/a.ts'), 'live');
assert.equal(detectType('Filmes', 'X', 'http://h/a.ts'), 'movies', 'grupo tem precedência sobre a URL');
assert.equal(detectType('Esportes', 'X'), 'live', 'default');

// ── O cache não pode vazar entre grupos nem entre canais do mesmo grupo ─────
assert.equal(detectType('Filmes', 'A'), 'movies');
assert.equal(detectType('Filmes', 'B S01E01'), 'series', 'mesmo grupo, nome de episódio ainda vence');
assert.equal(detectType('Filmes', 'C'), 'movies', 'grupo segue valendo depois do desvio');
assert.equal(detectType('Esportes', 'D'), 'live', 'grupo diferente não herda veredito');
assert.equal(detectType('Diversos', 'E', 'http://h/a.mkv'), 'movies', 'URL reavaliada por canal');
assert.equal(detectType('Diversos', 'F', 'http://h/b.ts'), 'live', 'mesmo grupo indeciso, URL diferente');

// ── Ano de lançamento (regex içada para o escopo do módulo) ─────────────────
assert.equal(isLaunchYear(`Filme (${LAUNCH_YEAR})`), true);
assert.equal(isLaunchYear(`Filme [${LAUNCH_YEAR}]`), true);
assert.equal(isLaunchYear(`Filme ${LAUNCH_YEAR}`), true, 'ano solto com \\b');
assert.equal(isLaunchYear('Filme 1999'), false);
assert.equal(isLaunchYear(`Filme ${LAUNCH_YEAR}9`), false, '\\b impede casar dentro de número maior');
assert.equal(isLaunchYear('Filme', `${LAUNCH_YEAR}-05-01`), true, 'cai no releaseDate');
assert.equal(isLaunchYear('Filme', '1999-05-01'), false);
// Regex de módulo sem flag /g: chamadas seguidas não podem depender de lastIndex
assert.equal(isLaunchYear(`A ${LAUNCH_YEAR}`), true);
assert.equal(isLaunchYear(`B ${LAUNCH_YEAR}`), true, 'sem estado residual entre chamadas');

console.log('✓ classificação de conteúdo: 26 casos ok');
