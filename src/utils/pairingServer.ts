/**
 * pairingServer — servidor HTTP efêmero para configurar fontes pelo celular.
 *
 * A TV sobe este servidor na rede local e mostra um QR com a URL + token.
 * O celular escaneia, recebe um formulário (HTML embutido, servido daqui mesmo)
 * e envia as credenciais via POST — nada sai do Wi-Fi local, sem backend.
 *
 * Segurança:
 *  - token de uso único embutido no QR: GET sem token correto → 403,
 *    POST sem token correto → 403 (outro device na LAN não injeta fonte);
 *  - efêmero: para sozinho após `timeoutMs` (padrão 5 min) ou após receber
 *    uma fonte válida.
 *
 * Web: este módulo tem stub em pairingServer.web.ts (TCP não existe no browser).
 */
import TcpSocket from 'react-native-tcp-socket';
import * as Network from 'expo-network';
// Buffer NÃO é global no React Native — vem do polyfill (dependência do tcp-socket)
import { Buffer } from 'buffer';

/** Bagagem opcional que acompanha a fonte no pareamento celular → TV. */
export interface PairingExtras {
  /** IDs de canais favoritos (ids derivados do provedor — valem entre aparelhos). */
  favorites?: string[];
  /** Progresso de assistidos (mesmo formato do watchProgress store). */
  watch?: Record<string, { positionSec: number; durationSec: number; watched: boolean; updatedAt: number }>;
}

export interface PairingPayload {
  type: 'xtream' | 'm3u';
  name?: string;
  // xtream
  host?: string;
  username?: string;
  password?: string;
  // m3u
  url?: string;
  /** Favoritos e assistidos do aparelho remetente (só no envio pelo app). */
  extras?: PairingExtras;
}

export interface PairingServer {
  /** URL completa (com token) para codificar no QR. */
  url: string;
  stop: () => void;
}

interface StartOptions {
  /** Chamada uma única vez com a fonte recebida; o servidor para em seguida. */
  onSource: (payload: PairingPayload) => void;
  /** Auto-stop por inatividade (padrão 5 min). */
  timeoutMs?: number;
  onTimeout?: () => void;
}

const DEFAULT_TIMEOUT_MS = 5 * 60_000;

// ─── HTML do formulário servido ao celular ───────────────────────────────────
// __TOKEN__ é substituído no GET. Visual segue o tema do app.
const FORM_HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SkaphosTV — Configurar fonte</title>
<style>
  :root{--bg:#0a0810;--card:#14111c;--line:#28232f;--txt:#f4f4f5;--mut:#a1a1aa;--acc:#a78bfa;--acc2:#7c3aed}
  *{margin:0;padding:0;box-sizing:border-box;font-family:system-ui,-apple-system,sans-serif}
  body{background:var(--bg);color:var(--txt);min-height:100vh;padding:20px 16px 40px}
  .wrap{max-width:440px;margin:0 auto}
  h1{font-size:20px;margin:18px 0 4px}
  .sub{color:var(--mut);font-size:13px;margin-bottom:20px}
  .brand{display:flex;align-items:center;gap:8px;color:var(--acc);font-weight:700;letter-spacing:2px;font-size:13px}
  .tabs{display:flex;gap:8px;margin-bottom:18px}
  .tab{flex:1;padding:11px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--mut);font-size:14px;text-align:center;cursor:pointer}
  .tab.on{border-color:var(--acc);color:var(--acc);background:rgba(167,139,250,.1)}
  label{display:block;font-size:12px;color:var(--mut);margin:14px 0 6px;text-transform:uppercase;letter-spacing:.5px}
  input{width:100%;padding:13px 14px;border-radius:10px;border:1px solid var(--line);background:var(--card);color:var(--txt);font-size:15px}
  input:focus{outline:none;border-color:var(--acc)}
  button.send{width:100%;margin-top:24px;padding:15px;border:none;border-radius:12px;background:var(--acc2);color:#fff;font-size:16px;font-weight:600;cursor:pointer}
  button.send:disabled{opacity:.5}
  .msg{margin-top:16px;padding:13px;border-radius:10px;font-size:14px;display:none}
  .msg.err{display:block;background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.4);color:#fca5a5}
  .ok{display:none;text-align:center;padding:60px 0}
  .ok .ic{font-size:52px}
  .ok h2{margin:14px 0 6px;font-size:20px}
  .ok p{color:var(--mut);font-size:14px}
  .hide{display:none!important}
</style>
</head>
<body>
<div class="wrap">
  <div class="brand">◆ SKAPHOS·TV</div>
  <div id="form">
    <h1>Configurar fonte IPTV</h1>
    <p class="sub">Preencha aqui no celular — a TV recebe na hora.</p>
    <div class="tabs">
      <div class="tab on" id="tabX" onclick="setTab('xtream')">Xtream API</div>
      <div class="tab" id="tabM" onclick="setTab('m3u')">Lista M3U</div>
    </div>
    <div id="fX">
      <label>Servidor</label>
      <input id="xHost" type="url" placeholder="http://servidor.com:8080" autocapitalize="none">
      <label>Usuário</label>
      <input id="xUser" autocapitalize="none" autocomplete="username">
      <label>Senha</label>
      <input id="xPass" type="password" autocomplete="current-password">
      <label>Nome da lista (opcional)</label>
      <input id="xName" placeholder="Minha lista">
    </div>
    <div id="fM" class="hide">
      <label>URL da lista M3U</label>
      <input id="mUrl" type="url" placeholder="http://servidor.com/lista.m3u" autocapitalize="none">
      <label>Nome da lista (opcional)</label>
      <input id="mName" placeholder="Minha lista">
    </div>
    <button class="send" id="send" onclick="send()">Enviar para a TV</button>
    <div class="msg err" id="err"></div>
  </div>
  <div class="ok" id="done">
    <div class="ic">✅</div>
    <h2>Fonte enviada!</h2>
    <p>Continue na TV — os canais já estão carregando.</p>
  </div>
</div>
<script>
var TOKEN='__TOKEN__', tab='xtream';
function setTab(t){tab=t;
  document.getElementById('tabX').className='tab'+(t==='xtream'?' on':'');
  document.getElementById('tabM').className='tab'+(t==='m3u'?' on':'');
  document.getElementById('fX').className=t==='xtream'?'':'hide';
  document.getElementById('fM').className=t==='m3u'?'':'hide';
}
function v(id){return document.getElementById(id).value.trim()}
function fail(m){var e=document.getElementById('err');e.textContent=m;e.style.display='block'}
function send(){
  document.getElementById('err').style.display='none';
  var src;
  if(tab==='xtream'){
    if(!v('xHost')||!v('xUser')||!v('xPass')) return fail('Preencha servidor, usuário e senha.');
    src={type:'xtream',host:v('xHost'),username:v('xUser'),password:v('xPass'),name:v('xName')};
  }else{
    if(!v('mUrl')) return fail('Preencha a URL da lista.');
    src={type:'m3u',url:v('mUrl'),name:v('mName')};
  }
  var btn=document.getElementById('send');btn.disabled=true;btn.textContent='Enviando…';
  fetch('/api/source',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({token:TOKEN,source:src})})
    .then(function(r){return r.json()})
    .then(function(j){
      if(j.ok){document.getElementById('form').className='hide';document.getElementById('done').style.display='block';}
      else{fail(j.error||'A TV recusou o envio.');btn.disabled=false;btn.textContent='Enviar para a TV';}
    })
    .catch(function(){fail('Não foi possível falar com a TV. Ela ainda está na tela do QR code?');btn.disabled=false;btn.textContent='Enviar para a TV';});
}
</script>
</body>
</html>`;

// ─── HTTP mínimo sobre TCP ───────────────────────────────────────────────────

function httpResponse(status: number, statusText: string, contentType: string, body: string): string {
  const len = Buffer.byteLength(body, 'utf8');
  return (
    `HTTP/1.1 ${status} ${statusText}\r\n` +
    `Content-Type: ${contentType}; charset=utf-8\r\n` +
    `Content-Length: ${len}\r\n` +
    `Cache-Control: no-store\r\n` +
    `Connection: close\r\n\r\n` +
    body
  );
}

const json = (obj: unknown) => JSON.stringify(obj);

function parseQueryToken(path: string): string | null {
  const q = path.split('?')[1];
  if (!q) return null;
  for (const pair of q.split('&')) {
    const [k, val] = pair.split('=');
    if (k === 't') return decodeURIComponent(val ?? '');
  }
  return null;
}

/** Valida o payload vindo do celular. Retorna erro legível ou null se ok. */
function validatePayload(p: any): string | null {
  if (!p || typeof p !== 'object') return 'Fonte inválida';
  if (p.type === 'xtream') {
    if (!p.host?.trim() || !p.username?.trim() || !p.password?.trim()) {
      return 'Preencha servidor, usuário e senha';
    }
    return null;
  }
  if (p.type === 'm3u') {
    if (!p.url?.trim()) return 'Preencha a URL da lista';
    return null;
  }
  return 'Tipo de fonte não suportado';
}

export async function startPairingServer(opts: StartOptions): Promise<PairingServer> {
  const ip = await Network.getIpAddressAsync();
  if (!ip || ip === '0.0.0.0') {
    throw new Error('Dispositivo sem endereço na rede. Verifique a conexão Wi-Fi/Ethernet.');
  }

  const token = Math.random().toString(36).slice(2, 10);
  // Porta alta aleatória: colisão improvável; até 3 tentativas em caso de porta ocupada
  const pickPort = () => 40000 + Math.floor(Math.random() * 10000);

  let stopped = false;
  let sourceDelivered = false;
  const sockets = new Set<any>();
  let server: any = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (idleTimer) clearTimeout(idleTimer);
    for (const s of sockets) { try { s.destroy(); } catch (_) {} }
    sockets.clear();
    try { server?.close(); } catch (_) {}
  };

  const armTimeout = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { stop(); opts.onTimeout?.(); }, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  };

  const handleRequest = (socket: any, method: string, path: string, body: string) => {
    const reply = (raw: string) => {
      // end() escreve e fecha com FIN após o flush. O destroy() antigo (150ms)
      // mandava RST antes do celular terminar de ler a resposta — o axios via
      // "network error" e o app mostrava "perdeu a conexão" mesmo com a TV
      // tendo recebido a fonte.
      try { socket.end(raw); } catch (_) { try { socket.destroy(); } catch (_) {} }
    };

    if (method === 'GET') {
      if (parseQueryToken(path) === token) {
        reply(httpResponse(200, 'OK', 'text/html', FORM_HTML.replace('__TOKEN__', token)));
      } else {
        reply(httpResponse(403, 'Forbidden', 'text/html',
          '<html><body style="background:#0a0810;color:#a1a1aa;font-family:sans-serif;text-align:center;padding-top:40vh">Escaneie o QR code exibido na TV.</body></html>'));
      }
      return;
    }

    if (method === 'POST' && path.startsWith('/api/source')) {
      let parsed: any;
      try { parsed = JSON.parse(body); } catch (_) {
        reply(httpResponse(400, 'Bad Request', 'application/json', json({ ok: false, error: 'JSON inválido' })));
        return;
      }
      if (parsed?.token !== token) {
        reply(httpResponse(403, 'Forbidden', 'application/json', json({ ok: false, error: 'Sessão expirada — escaneie o QR novamente' })));
        return;
      }
      const err = validatePayload(parsed.source);
      if (err) {
        reply(httpResponse(400, 'Bad Request', 'application/json', json({ ok: false, error: err })));
        return;
      }
      if (sourceDelivered) {
        reply(httpResponse(409, 'Conflict', 'application/json', json({ ok: false, error: 'A TV já recebeu uma fonte' })));
        return;
      }
      sourceDelivered = true;
      reply(httpResponse(200, 'OK', 'application/json', json({ ok: true })));
      // Entrega DEPOIS de responder — o celular vê o sucesso mesmo se a TV navegar
      setTimeout(() => { stop(); opts.onSource(parsed.source as PairingPayload); }, 250);
      return;
    }

    reply(httpResponse(404, 'Not Found', 'application/json', json({ ok: false, error: 'Rota desconhecida' })));
  };

  const listen = (attempt: number): Promise<number> =>
    new Promise((resolve, reject) => {
      const port = pickPort();
      server = TcpSocket.createServer((socket: any) => {
        sockets.add(socket);
        armTimeout(); // atividade renova o prazo
        let buf = Buffer.alloc(0);
        socket.on('data', (chunk: Buffer | string) => {
          buf = Buffer.concat([buf, typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk]);
          const headerEnd = buf.indexOf('\r\n\r\n');
          if (headerEnd === -1) return; // headers incompletos — espera mais dados
          const head = buf.subarray(0, headerEnd).toString('utf8');
          const [requestLine, ...headerLines] = head.split('\r\n');
          const [method = '', path = ''] = requestLine.split(' ');
          const headers: Record<string, string> = {};
          for (const line of headerLines) {
            const idx = line.indexOf(':');
            if (idx > 0) headers[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
          }
          const contentLength = parseInt(headers['content-length'] ?? '0', 10) || 0;
          const bodyBytes = buf.subarray(headerEnd + 4);
          if (bodyBytes.length < contentLength) return; // corpo incompleto — espera
          handleRequest(socket, method.toUpperCase(), path, bodyBytes.subarray(0, contentLength).toString('utf8'));
        });
        socket.on('error', () => {});
        socket.on('close', () => sockets.delete(socket));
      });
      server.on('error', (e: any) => {
        if (attempt < 3) { try { server.close(); } catch (_) {} resolve(listen(attempt + 1)); }
        else reject(new Error(e?.message ?? 'Não foi possível abrir a porta do pareamento'));
      });
      server.listen({ port, host: '0.0.0.0' }, () => resolve(port));
    });

  const port = await listen(0);
  armTimeout();

  return { url: `http://${ip}:${port}/?t=${token}`, stop };
}
