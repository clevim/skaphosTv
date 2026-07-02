/**
 * pairingServer (web) — stub: o browser não abre sockets TCP, então o
 * pareamento local é exclusivo dos builds nativos (TV/mobile). A UI já
 * esconde o botão no web; este stub só evita que o bundle web puxe o
 * react-native-tcp-socket.
 */

export interface PairingPayload {
  type: 'xtream' | 'm3u';
  name?: string;
  host?: string;
  username?: string;
  password?: string;
  url?: string;
}

export interface PairingServer {
  url: string;
  stop: () => void;
}

export async function startPairingServer(_opts: {
  onSource: (payload: PairingPayload) => void;
  timeoutMs?: number;
  onTimeout?: () => void;
}): Promise<PairingServer> {
  throw new Error('Configuração pelo celular não está disponível na versão web.');
}
