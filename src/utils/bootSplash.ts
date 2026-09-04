/**
 * Estado da splash de entrada, legível fora do React.
 *
 * Existe por um motivo só: enquanto a animação cobre a tela, o usuário não pode
 * tocar em nada. Trabalho de boot que normalmente espera "as interações
 * assentarem" (para não competir com o dedo do usuário) não tem por que esperar
 * aí — atrás da splash isso é tempo morto dentro da própria janela que a
 * animação existe para preencher.
 *
 * Módulo e não store: é lido dentro de uma função async de boot, onde assinar
 * estado do React não ajudaria, e um `set` do zustand aqui re-renderizaria o app
 * inteiro por uma informação que ninguém desenha.
 */

let covering = true;

/** true enquanto a splash de entrada ainda está por cima de tudo. */
export const splashIsCovering = (): boolean => covering;

/** Chamado pelo App quando a splash termina de sair. */
export const setSplashCovering = (value: boolean): void => { covering = value; };
