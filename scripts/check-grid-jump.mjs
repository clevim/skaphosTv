// Checagem do salto de página da grade (⏩/⏪). `node scripts/check-grid-jump.js`
import assert from 'node:assert/strict';
import { pageJumpTarget } from '../src/utils/gridJump.ts';

const base = { total: 1000, numColumns: 6, rowHeight: 300, viewportHeight: 700, contentTop: 8 };
// 700/300 → 2 linhas por tela
const at = (scrollY, dir) => pageJumpTarget({ ...base, scrollY, dir });

assert.deepEqual(at(8, 1),   { row: 2,  cardIndex: 12 }, 'topo: avança 2 linhas');
assert.deepEqual(at(8, -1),  { row: 0,  cardIndex: 0  }, 'topo: recuar trava em 0');
assert.deepEqual(at(608, 1), { row: 4,  cardIndex: 24 }, 'linha 2 → linha 4');
assert.deepEqual(at(608, -1),{ row: 0,  cardIndex: 0  }, 'linha 2 → linha 0');

// Fim da lista: 1000 cards / 6 col = linha 166 é a última (166*6 = 996 < 1000)
assert.deepEqual(at(999999, 1), { row: 166, cardIndex: 996 }, 'satura na última linha');

// Última linha incompleta não pode apontar card fora da lista
assert.deepEqual(
  pageJumpTarget({ ...base, total: 3, scrollY: 999999, dir: 1 }),
  { row: 0, cardIndex: 0 }, 'lista menor que uma linha',
);
assert.deepEqual(
  pageJumpTarget({ ...base, total: 8, scrollY: 999999, dir: 1 }),
  { row: 1, cardIndex: 6 }, 'card do destino existe na lista',
);

// Entradas degeneradas não podem estourar
assert.equal(pageJumpTarget({ ...base, total: 0, scrollY: 0, dir: 1 }), null);
assert.equal(pageJumpTarget({ ...base, rowHeight: 0, scrollY: 0, dir: 1 }), null);

console.log('✓ salto de página: 9 casos ok');
