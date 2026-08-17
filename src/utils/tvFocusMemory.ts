import { useEffect, useRef } from 'react';
import { useIsFocused } from '@react-navigation/native';
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

const listeners = new Set<(fn: FocusFn) => void>();

/** Chamado pelo TVFocusable sempre que um focável ganha foco. */
export function reportTVFocus(fn: FocusFn) {
  for (const l of listeners) l(fn);
}

function subscribe(l: (fn: FocusFn) => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

/** Use uma vez no corpo de cada tela de TV. No mobile é inerte. */
export function useTVFocusMemory() {
  const isFocused = useIsFocused();
  const saved = useRef<FocusFn | null>(null);

  useEffect(() => {
    if (!IS_TV || !isFocused) return;
    // Só escuta com a tela em primeiro plano — assim o foco preferido da tela
    // que subiu por cima não sobrescreve a lembrança desta aqui.
    const unsub = subscribe(fn => { saved.current = fn; });
    // Reassumiu: devolve o foco. afterInteractions espera a transição de volta
    // assentar (pedir foco no meio da animação não sobrevive ao fim dela).
    const restore = saved.current;
    const cancel = restore ? afterInteractions(restore) : undefined;
    return () => { unsub(); cancel?.(); };
  }, [isFocused]);
}
