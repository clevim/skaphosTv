// Checagem da fileira "Adicionados recentemente". `node scripts/check-recently-added.mjs`
import assert from 'node:assert/strict';
import { buildChannelIndex, mergeChannelIndexes } from '../src/store/channelIndex.ts';

const now = Math.floor(Date.now() / 1000);
const days = (n) => now - n * 86_400;

const movie = (id, addedAt, extra = {}) => ({
  id, name: `Filme ${id}`, url: `http://h/movie/u/p/${id}.mp4`,
  group: 'Filmes', streamType: 'movie', addedAt, ...extra,
});
const series = (id, name, addedAt) => ({
  id, name, url: `http://h/series/u/p/${id}`, group: '♦ Séries',
  streamType: 'series', addedAt,
});

const idx = await buildChannelIndex([
  movie('a', days(1)),
  movie('b', days(10)),
  movie('c', days(29)),
  movie('d', days(31)),              // fora da janela de 30 dias
  movie('e', undefined),             // provedor não informou data
  { ...movie('f', days(2)), group: 'Ao Vivo', streamType: 'live' }, // ao vivo não entra
]);

assert.deepEqual(idx.recentlyAdded.map(c => c.id), ['a', 'b', 'c'],
  'só filmes/séries dentro da janela, do mais novo para o mais velho');

// Série repetida (episódios soltos de M3U) entra uma vez só
const idx2 = await buildChannelIndex([
  series('s1', 'Dark S01E01', days(1)),
  series('s2', 'Dark S01E02', days(2)),
  series('s3', 'Loki S01E01', days(3)),
]);
assert.deepEqual(idx2.recentlyAdded.map(c => c.id), ['s1', 's3'],
  'deduplica por nome-base da série');

// Catálogo sem nenhuma data → fileira vazia (a Home simplesmente não a desenha)
const idx3 = await buildChannelIndex([movie('x', undefined), movie('y', undefined)]);
assert.deepEqual(idx3.recentlyAdded, [], 'provedor sem datas não inventa fileira');

// Merge entre fontes reordena globalmente
const merged = mergeChannelIndexes([
  await buildChannelIndex([movie('velho', days(20))]),
  await buildChannelIndex([movie('novo', days(1))]),
]);
assert.deepEqual(merged.recentlyAdded.map(c => c.id), ['novo', 'velho'],
  'ordem global por data, não por ordem das fontes');

console.log('✓ adicionados recentemente: 5 casos ok');
