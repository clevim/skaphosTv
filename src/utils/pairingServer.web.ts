/**
 * pairingServer (web) — o navegador não abre sockets TCP, então quem faz o
 * papel do servidor efêmero é o serviço "proxy" do deploy (proxy-server.js,
 * rotas /api/pair/* e /pair): o painel cria uma sessão com token, mostra o QR
 * apontando pro próprio endereço e fica consultando até a fonte chegar.
 * Mesma interface do pairingServer nativo — o PairingSetupModal não muda.
 *
 * Fora do deploy com proxy (ex.: expo start --web), o POST /api/pair/new
 * falha e o modal mostra o erro.
 */

export interface PairingExtras {
  favorites?: string[];
  watch?: Record<string, { positionSec: number; durationSec: number; watched: boolean; updatedAt: number }>;
}

export interface PairingPayload {
  type: 'xtream' | 'm3u';
  name?: string;
  host?: string;
  username?: string;
  password?: string;
  url?: string;
  extras?: PairingExtras;
}

export interface PairingServer {
  url: string;
  stop: () => void;
}

const DEFAULT_TIMEOUT_MS = 5 * 60_000;
const POLL_MS = 2_000;

export async function startPairingServer(opts: {
  onSource: (payload: PairingPayload) => void;
  timeoutMs?: number;
  onTimeout?: () => void;
}): Promise<PairingServer> {
  let res: Response;
  try {
    res = await fetch('/api/pair/new', { method: 'POST' });
  } catch {
    throw new Error('O serviço de pareamento não respondeu. Ele existe apenas no deploy com o container "proxy" (Docker/CasaOS).');
  }
  if (!res.ok) {
    throw new Error('O serviço de pareamento não está disponível neste deploy (requer o container "proxy").');
  }
  const { token } = await res.json();

  let stopped = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  const stop = () => {
    stopped = true;
    if (timer) { clearInterval(timer); timer = null; }
  };

  const deadline = Date.now() + (opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  timer = setInterval(async () => {
    if (stopped) return;
    if (Date.now() > deadline) { stop(); opts.onTimeout?.(); return; }
    try {
      const r = await fetch(`/api/pair/poll?t=${token}`);
      if (r.status === 403) { stop(); opts.onTimeout?.(); return; }
      const j = await r.json();
      if (j?.source) { stop(); opts.onSource(j.source as PairingPayload); }
    } catch {
      // rede piscou — tenta de novo no próximo tick
    }
  }, POLL_MS);

  return { url: `${window.location.origin}/pair?t=${token}`, stop };
}
