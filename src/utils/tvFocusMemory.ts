import { useContext, useEffect, useRef } from 'react';
import { useIsFocused, NavigationRouteContext } from '@react-navigation/native';
import { IS_TV } from './tvDetect';
import { afterInteractions } from './afterInteractions';

/**
 * Memória de foco por tela (TV/web).
 *
 * Quando uma tela é empilhada por cima de outra, o Android mantém as views de
 * baixo montadas — mas ao DESEMPILHAR ele destrói a view que estava focada e,
 * sem ninguém pedindo o foco, o ViewRootImpl entrega para o PRIMEIRO focável da
 * janela. Na prática: abre um filme, volta, e a seleção está no topo da página
 * em vez de no card de onde você saiu. O mesmo vale para qualquer volta
 * (Ajustes, Série, Player).
 *
 * Aqui cada tela anota o último focável que recebeu foco ENQUANTO ela estava em
 * primeiro plano e, ao reassumir, devolve o foco para ele. Como os TVFocusable
 * da tela de baixo nunca desmontaram, a função de foco guardada continua válida;
 * se por acaso não estiver mais montada, o `?.` no ref faz a chamada virar no-op
 * e o Android segue com o padrão dele.
 */

type FocusFn = () => void;

const listeners = new Set<(fn: FocusFn, routeKey?: string) => void>();

// Fonte única de verdade do foco visual: só UM focável fica "aceso". Quando um
// novo assume, o anterior é apagado à força (cobre blur perdido entre janelas/
// modais ou eventos nativos fora de ordem).
let lit: { id: object; off: () => void } | null = null;
export function claimTVFocus(id: object, off: () => void) {
  if (lit && lit.id !== id) lit.off();
  lit = { id, off };
}
export function releaseTVFocus(id: object) {
  if (lit?.id === id) lit = null;
}

/** Chamado pelo TVFocusable sempre que um focável ganha foco. */
/** `routeKey`: a tela (rota) dona do focável — só ela guarda a lembrança. */
export function reportTVFocus(fn: FocusFn, routeKey?: string) {
  for (const l of listeners) l(fn, routeKey);
}

function subscribe(l: (fn: FocusFn, routeKey?: string) => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

/** Use uma vez no corpo de cada tela de TV. No mobile é inerte. */
export function useTVFocusMemory() {
  const isFocused = useIsFocused();
  const saved = useRef<FocusFn | null>(null);
  // Só guarda focáveis DESTA rota. Sem isto, o foco preferido da tela que acabou
  // de subir (ex.: "Assistir" do Detalhe, play do Player) chegava antes do cleanup
  // desta e virava a lembrança dela — ao voltar, a restauração chamava um focável
  // já desmontado e o D-pad caía em qualquer lugar.
  const routeKey = useContext(NavigationRouteContext)?.key;

  useEffect(() => {
    if (!IS_TV || !isFocused) return;
    // Só escuta com a tela em primeiro plano — assim o foco preferido da tela
    // que subiu por cima não sobrescreve a lembrança desta aqui.
    const unsub = subscribe((fn, key) => { if (!key || key === routeKey) saved.current = fn; });
    // Reassumiu: devolve o foco. afterInteractions espera a transição de volta
    // assentar (pedir foco no meio da animação não sobrevive ao fim dela).
    const restore = saved.current;
    const cancel = restore ? afterInteractions(restore) : undefined;
    return () => { unsub(); cancel?.(); };
  }, [isFocused]);
}
