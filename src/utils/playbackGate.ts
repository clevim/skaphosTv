/**
 * Portão de trabalho pesado durante a reprodução.
 *
 * A thread JS é a mesma para o app inteiro, e numa Fire Stick ela divide os
 * mesmos poucos núcleos com quem decodifica e entrega o vídeo. Reconstruir o
 * catálogo enquanto um filme toca — varrer 20 mil canais, refazer o índice e
 * serializar megabytes para o disco — é o tipo de trabalho que aparece na tela
 * como travadinha, mesmo com o vídeo em superfície própria.
 *
 * Nada disso é urgente: o usuário está ASSISTINDO. Aqui a tarefa espera o vídeo
 * acabar. Se ninguém está tocando nada, roda na hora e o portão some do caminho.
 */

let playing = 0;
let queue: Array<() => void> = [];

/** Player e mini-player marcam presença aqui enquanto existem. */
export function setPlaybackActive(active: boolean): void {
  playing = Math.max(0, playing + (active ? 1 : -1));
  if (playing === 0 && queue.length > 0) {
    const pending = queue;
    queue = [];
    for (const fn of pending) { try { fn(); } catch (_) {} }
  }
}

/** true enquanto houver vídeo tocando (player cheio ou mini). */
export function isPlaybackActive(): boolean {
  return playing > 0;
}

/**
 * Executa agora, ou guarda para quando o vídeo parar.
 * Só para trabalho que pode esperar — nunca para o que o usuário está olhando.
 */
export function whenNotPlaying(fn: () => void): void {
  if (playing === 0) { fn(); return; }
  queue.push(fn);
}
