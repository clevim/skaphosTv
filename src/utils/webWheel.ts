/**
 * webWheel.ts — roda do mouse em listas do app (APENAS web).
 *
 * Regra de ouro: VERTICAL SEMPRE VENCE. Se qualquer ancestral rolável na
 * vertical ainda pode se mover na direção da roda, deixamos o navegador agir
 * (páginas, grades, listas de canais…). Sequestrar a roda para o eixo
 * horizontal quando se está sobre um card era o que impedia rolar a página.
 *
 * O deltaY só vira scroll horizontal quando NÃO há consumo vertical possível:
 *  • barra de chips/abas numa tela sem scroll vertical;
 *  • rail horizontal em tela fixa (ex.: episódios da série na TV/web);
 *  • vertical já no fim → a roda "continua" na lista horizontal sob o cursor.
 *
 * Shift+roda (ou gesto horizontal de trackpad) rola a lista horizontal
 * diretamente — o navegador já faz isso sozinho; não interferimos.
 *
 * Em nativo este módulo é um no-op.
 */
import { Platform } from 'react-native';

if (Platform.OS === 'web' && typeof document !== 'undefined') {
  document.addEventListener(
    'wheel',
    (e: WheelEvent) => {
      if (e.defaultPrevented || e.ctrlKey) return; // ctrl+roda = zoom do navegador
      // Gesto já horizontal (trackpad/Shift+roda) → o navegador resolve sozinho
      if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
      // deltaMode 1 = linhas (Firefox); converte para px aproximados
      const delta = e.deltaMode === 1 ? e.deltaY * 24 : e.deltaY;

      let el = e.target instanceof HTMLElement ? e.target : null;
      let horizontal: HTMLElement | null = null; // candidato mais próximo
      while (el && el !== document.body) {
        const cs = (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)
          ? getComputedStyle(el) : null;
        if (cs) {
          const scrollableY = el.scrollHeight > el.clientHeight + 1 &&
            (cs.overflowY === 'auto' || cs.overflowY === 'scroll');
          if (scrollableY) {
            const maxY = el.scrollHeight - el.clientHeight;
            const canMove = delta > 0 ? el.scrollTop < maxY - 1 : el.scrollTop > 1;
            if (canMove) return; // vertical tem prioridade — navegador cuida
            // vertical no fim → segue subindo (encadeamento natural do scroll)
          }
          const scrollableX = el.scrollWidth > el.clientWidth + 1 &&
            (cs.overflowX === 'auto' || cs.overflowX === 'scroll');
          if (scrollableX && !horizontal) horizontal = el;
        }
        el = el.parentElement;
      }

      // Nenhum vertical pôde consumir → roda move a lista horizontal sob o cursor
      if (horizontal) {
        const max = horizontal.scrollWidth - horizontal.clientWidth;
        const atEdge = (delta > 0 && horizontal.scrollLeft >= max - 1) ||
                       (delta < 0 && horizontal.scrollLeft <= 1);
        if (atEdge) return;
        horizontal.scrollLeft += delta;
        e.preventDefault();
      }
    },
    // passive:false é obrigatório para o preventDefault valer em evento de roda
    { passive: false },
  );
}
