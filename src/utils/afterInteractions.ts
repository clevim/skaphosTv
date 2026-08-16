import { InteractionManager } from 'react-native';

/**
 * runAfterInteractions COM PRAZO.
 *
 * O InteractionManager só dispara quando a contagem de "handles" de interação
 * zera. Quem abre um handle e some sem fechá-lo (o caso clássico: um componente
 * com PanResponder que desmonta no meio do gesto — nem onPanResponderRelease
 * nem onPanResponderTerminate chegam a rodar) trava a fila para o resto da vida
 * do processo. A partir daí NENHUM runAfterInteractions do app dispara de novo.
 *
 * Isso não é teórico aqui: era o que fazia a Home aparecer só com o hero, sem
 * nenhuma fileira — o `ready` do HomeContent e a reconciliação de catálogo do
 * HomeScreen ficavam esperando um evento que nunca vinha. Só reabrindo o app.
 *
 * runAfterInteractions é uma DICA de agendamento ("não compita com a animação
 * de entrada"), não uma promessa de entrega. Então tratamos assim: o que vier
 * primeiro, o fim das interações ou o prazo. Perder a dica custa uma transição
 * levemente mais engasgada; perder o evento custa a tela inteira.
 *
 * @returns cancelador, para usar no cleanup do useEffect.
 */
export function afterInteractions(fn: () => void, deadlineMs = 500): () => void {
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    fn();
  };
  const task = InteractionManager.runAfterInteractions(run);
  const timer = setTimeout(run, deadlineMs);
  return () => {
    done = true;
    task.cancel();
    clearTimeout(timer);
  };
}
