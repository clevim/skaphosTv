/**
 * webWheel.ts — roda do mouse em listas do app (APENAS web).
 *
 * Regra: o rolável MAIS PRÓXIMO do cursor decide. Subindo do alvo do evento,
 * o primeiro ancestral rolável define o eixo:
 *  • vertical que ainda pode se mover → navegador age (páginas, grades);
 *  • horizontal (chips, abas de temporada, carrosséis) → deltaY vira scrollLeft,
 *    mesmo que a página inteira ainda role — é o que o usuário espera quando
 *    para o mouse em cima do carrossel;
 *  • rolável no fim do próprio eixo → segue subindo (encadeia pro pai/página).
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
      while (el && el !== document.body) {
        const cs = (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)
          ? getComputedStyle(el) : null;
        if (cs) {
          const scrollableY = el.scrollHeight > el.clientHeight + 1 &&
            (cs.overflowY === 'auto' || cs.overflowY === 'scroll');
          if (scrollableY) {
            const maxY = el.scrollHeight - el.clientHeight;
            const canMove = delta > 0 ? el.scrollTop < maxY - 1 : el.scrollTop > 1;
            if (canMove) return; // este nível é vertical — navegador cuida
            // no fim → segue subindo (encadeamento natural do scroll)
          }
          const scrollableX = el.scrollWidth > el.clientWidth + 1 &&
            (cs.overflowX === 'auto' || cs.overflowX === 'scroll');
          if (scrollableX) {
            const maxX = el.scrollWidth - el.clientWidth;
            const atEdge = (delta > 0 && el.scrollLeft >= maxX - 1) ||
                           (delta < 0 && el.scrollLeft <= 1);
            if (!atEdge) {
              el.scrollLeft += delta;
              e.preventDefault();
              return;
            }
            // no limite → segue subindo (a roda volta a rolar a página)
          }
        }
        el = el.parentElement;
      }
    },
    // passive:false é obrigatório para o preventDefault valer em evento de roda
    { passive: false },
  );
}
