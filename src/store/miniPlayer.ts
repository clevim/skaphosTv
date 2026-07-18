import { create } from 'zustand';
import { Channel } from '../types';

// ─── Mini-player (Picture-in-Picture DENTRO do app) ──────────────────────────
// Diferente do PiP do sistema (janela do SO ao sair do app), este é um player
// flutuante que continua tocando ENQUANTO o usuário navega pelas telas do app.
//
// Como o vídeo precisa sobreviver à troca de telas, o <MiniPlayer> é montado no
// ROOT (App.tsx), acima do navegador. O PlayerScreen "minimiza" entregando o canal
// e a posição atual para este store; ao expandir, navega de volta ao Player (que
// retoma do progresso salvo). É um handoff — há um pequeno rebuffer na troca.

interface MiniPlayerState {
  channel: Channel | null;
  /** Segundos para retomar quando o mini-player montar o vídeo. */
  startPosition: number;
  /** Playlist da série — viaja no handoff para o "próximo episódio" sobreviver
   *  ao minimizar/expandir (o Player remonta com os params da navegação). */
  playlist: Channel[];
  visible: boolean;
  /** Abre o mini-player com um canal, a posição atual (em segundos) e a playlist. */
  open: (channel: Channel, position: number, playlist?: Channel[]) => void;
  /** Fecha o mini-player (para a reprodução). */
  close: () => void;
}

export const useMiniPlayer = create<MiniPlayerState>((set) => ({
  channel: null,
  startPosition: 0,
  playlist: [],
  visible: false,
  open: (channel, position, playlist = []) =>
    set({ channel, startPosition: Math.max(0, position || 0), playlist, visible: true }),
  close: () => set({ channel: null, startPosition: 0, playlist: [], visible: false }),
}));
