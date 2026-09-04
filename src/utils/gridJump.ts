/**
 * Salto de página na grade de catálogo (teclas ⏩/⏪ do controle).
 *
 * Isolado da tela porque é aritmética de índice com dois espaços diferentes
 * convivendo na mesma FlatList — o da LINHA (que a virtualização e o
 * scrollToIndex usam quando numColumns > 1) e o do CARD (que o renderItem
 * recebe). Errar a conversão rola pro lugar errado ou deixa o foco pra trás.
 *
 * Checagem executável: `node scripts/check-grid-jump.js`.
 */

export interface GridJumpInput {
  /** +1 avança uma tela, -1 volta uma. */
  dir: 1 | -1;
  /** Total de cards da lista filtrada. */
  total: number;
  /** Cards por linha. */
  numColumns: number;
  /** Altura de uma linha, em px (pôster + info + margens). */
  rowHeight: number;
  /** Altura visível da grade, em px. */
  viewportHeight: number;
  /** contentOffset.y atual da FlatList. */
  scrollY: number;
  /** Deslocamento fixo antes da primeira linha (header + padding). */
  contentTop: number;
}

/** Linha de destino e card que deve receber o foco lá. `null` = nada a fazer. */
export function pageJumpTarget(i: GridJumpInput): { row: number; cardIndex: number } | null {
  if (i.total <= 0 || i.rowHeight <= 0 || i.numColumns <= 0) return null;
  const rowsPerPage = Math.max(1, Math.floor(i.viewportHeight / i.rowHeight));
  const lastRow = Math.floor((i.total - 1) / i.numColumns);
  const curRow  = Math.round(Math.max(0, i.scrollY - i.contentTop) / i.rowHeight);
  const row = Math.min(lastRow, Math.max(0, curRow + i.dir * rowsPerPage));
  return { row, cardIndex: Math.min(i.total - 1, row * i.numColumns) };
}
