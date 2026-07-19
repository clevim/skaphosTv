const express = require('express');
const cors = require('cors');
const dns = require('dns').promises;
const net = require('net');
const { Readable } = require('stream');

const app = express();
app.use(cors());

// Allowlist opcional de hosts (defesa em profundidade p/ cenário cloudflared).
// Ex.: PROXY_ALLOWED_HOSTS="iptv.exemplo.com,jelly.meudominio.com"
const ALLOWED_HOSTS = (process.env.PROXY_ALLOWED_HOSTS || '')
  .split(',')
  .map(h => h.trim().toLowerCase())
  .filter(Boolean);

// ─── Proteção contra SSRF ─────────────────────────────────────────────────────
// Sem isto, /proxy?url= é um relay aberto: exposto via cloudflared, permitiria que
// terceiros alcançassem serviços internos do homelab (192.168.x, 10.x, localhost,
// 169.254.169.254 de metadados, etc.). Resolvemos o host e recusamos IPs privados.

function ipIsPrivate(ip) {
  // normaliza IPv4 mapeado em IPv6 (::ffff:192.168.0.1)
  const v4 = ip.replace(/^::ffff:/i, '');
  if (net.isIPv4(v4)) {
    const [a, b] = v4.split('.').map(Number);
    if (a === 10) return true;                          // 10.0.0.0/8
    if (a === 127) return true;                         // loopback
    if (a === 0) return true;                           // 0.0.0.0/8
    if (a === 169 && b === 254) return true;            // link-local / metadados
    if (a === 172 && b >= 16 && b <= 31) return true;   // 172.16.0.0/12
    if (a === 192 && b === 168) return true;            // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true;  // CGNAT 100.64.0.0/10
    return false;
  }
  const low = ip.toLowerCase();
  if (low === '::1' || low === '::') return true;       // loopback / unspecified
  if (low.startsWith('fe80')) return true;              // link-local
  if (low.startsWith('fc') || low.startsWith('fd')) return true; // unique-local
  return false;
}

async function hostIsSafe(hostname) {
  if (ALLOWED_HOSTS.length > 0 && !ALLOWED_HOSTS.includes(hostname.toLowerCase())) {
    return false;
  }
  // Se já é IP literal, valida direto
  if (net.isIP(hostname)) return !ipIsPrivate(hostname);
  try {
    const records = await dns.lookup(hostname, { all: true });
    // Recusa se QUALQUER endereço resolvido for privado (mitiga DNS rebinding)
    return records.length > 0 && records.every(r => !ipIsPrivate(r.address));
  } catch {
    return false;
  }
}

// Headers do cliente que NÃO devem ser repassados ao destino (hop-by-hop e
// específicos da conexão local). O `Host` é derivado da própria URL pelo fetch.
const STRIP_REQ_HEADERS = new Set([
  'host', 'connection', 'content-length', 'origin', 'referer',
  'accept-encoding', 'sec-fetch-mode', 'sec-fetch-site', 'sec-fetch-dest',
]);

// Headers da resposta upstream que não fazem sentido repassar (o corpo já vem
// descomprimido pelo fetch; o comprimento muda; CORS é injetado pelo middleware).
const STRIP_RES_HEADERS = new Set([
  'content-encoding', 'content-length', 'transfer-encoding', 'connection',
  'access-control-allow-origin', 'access-control-allow-credentials',
]);

// Healthcheck do container (Dockerfile.proxy) — vivo = 200, sem tocar em rede externa
app.get('/healthz', (_req, res) => res.json({ ok: true }));

// ─── Pareamento web ↔ celular (Sincronizar dispositivos) ─────────────────────
// O navegador não abre porta na LAN, então o proxy faz o papel do pairingServer
// da TV: o painel web cria uma sessão (token) e mostra o QR apontando pro
// próprio endereço; o celular envia a fonte via POST /api/source (mesmo
// contrato do servidor da TV) e o painel busca via polling. Sessões em memória,
// token de uso único, TTL de 5 min — nada persiste no servidor.

const pairSessions = new Map(); // token → { createdAt, source? }
const PAIR_TTL_MS = 5 * 60_000;

function prunePairSessions() {
  const now = Date.now();
  for (const [t, s] of pairSessions) {
    if (now - s.createdAt > PAIR_TTL_MS) pairSessions.delete(t);
  }
}

function validatePairPayload(p) {
  if (!p || typeof p !== 'object') return 'Fonte inválida';
  if (p.type === 'xtream') {
    if (!p.host?.trim() || !p.username?.trim() || !p.password?.trim()) return 'Preencha servidor, usuário e senha';
    return null;
  }
  if (p.type === 'm3u') {
    if (!p.url?.trim()) return 'Preencha a URL da lista';
    return null;
  }
  return 'Tipo de fonte não suportado';
}

// Mesmo formulário que a TV serve — fallback pra quem escaneia com a câmera
// do sistema em vez do app (envia só a fonte).
const PAIR_FORM_HTML = `<!DOCTYPE html>
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
    <p class="sub">Preencha aqui no celular — o painel recebe na hora.</p>
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
    <button class="send" id="send" onclick="send()">Enviar</button>
    <div class="msg err" id="err"></div>
  </div>
  <div class="ok" id="done">
    <div class="ic">✅</div>
    <h2>Fonte enviada!</h2>
    <p>Continue no painel — os canais já estão carregando.</p>
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
      else{fail(j.error||'O painel recusou o envio.');btn.disabled=false;btn.textContent='Enviar';}
    })
    .catch(function(){fail('Não foi possível falar com o painel. Ele ainda está na tela do QR code?');btn.disabled=false;btn.textContent='Enviar';});
}
</script>
</body>
</html>`;

// Painel web cria uma sessão de pareamento
app.post('/api/pair/new', (_req, res) => {
  prunePairSessions();
  const token = Math.random().toString(36).slice(2, 10);
  pairSessions.set(token, { createdAt: Date.now() });
  res.json({ token, ttlMs: PAIR_TTL_MS });
});

// Câmera do sistema no celular cai aqui — formulário no navegador
app.get('/pair', (req, res) => {
  prunePairSessions();
  const t = String(req.query.t || '');
  if (!t || !pairSessions.has(t)) {
    return res.status(403).type('html').send(
      '<html><body style="background:#0a0810;color:#a1a1aa;font-family:sans-serif;text-align:center;padding-top:40vh">Escaneie o QR code exibido no painel.</body></html>');
  }
  res.type('html').send(PAIR_FORM_HTML.replace('__TOKEN__', t));
});

// Celular (app ou formulário) envia a fonte — mesmo contrato do servidor da TV.
// Limite de 512kb: o payload pode carregar favoritos + progresso de assistidos.
app.post('/api/source', express.json({ limit: '512kb' }), (req, res) => {
  prunePairSessions();
  const { token, source } = req.body || {};
  const sess = token && pairSessions.get(String(token));
  if (!sess) return res.status(403).json({ ok: false, error: 'Sessão expirada — escaneie o QR novamente' });
  const err = validatePairPayload(source);
  if (err) return res.status(400).json({ ok: false, error: err });
  if (sess.source) return res.status(409).json({ ok: false, error: 'O painel já recebeu uma fonte' });
  sess.source = source;
  res.json({ ok: true });
});

// Painel web consulta até a fonte chegar (token é consumido na entrega)
app.get('/api/pair/poll', (req, res) => {
  prunePairSessions();
  const t = String(req.query.t || '');
  const sess = pairSessions.get(t);
  if (!sess) return res.status(403).json({ error: 'expired' });
  if (!sess.source) return res.json({ pending: true });
  pairSessions.delete(t);
  res.json({ source: sess.source });
});

// ─── Relay manual via fetch ────────────────────────────────────────────────────
// Substitui http-proxy-middleware: o jeito que ele montava a requisição (com
// changeOrigin + reescrita de path) fazia certos servidores Xtream atrás de
// Cloudflare devolverem uma página-isca do Google. O fetch nativo do Node
// reproduz exatamente uma requisição HTTP limpa e segue redirects corretamente.
app.use('/proxy', async (req, res) => {
  const target = req.query.url;
  if (!target) return res.status(400).json({ error: 'url param required' });

  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    return res.status(400).json({ error: 'invalid url' });
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return res.status(400).json({ error: 'protocol not allowed' });
  }

  if (!(await hostIsSafe(parsed.hostname))) {
    return res.status(403).json({ error: 'target host not allowed' });
  }

  // Repassa os headers do cliente, exceto os locais/hop-by-hop.
  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (!STRIP_REQ_HEADERS.has(key.toLowerCase())) headers[key] = value;
  }

  // Corpo para métodos não-GET (Jellyfin Quick Connect, playstate, etc.).
  let body;
  const method = req.method.toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    body = await new Promise((resolve) => {
      const chunks = [];
      req.on('data', c => chunks.push(c));
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', () => resolve(undefined));
    });
    if (body && body.length === 0) body = undefined;
  }

  // Timeout SÓ até os headers chegarem. Um AbortSignal.timeout no fetch inteiro
  // derrubava todo stream ao vivo aos 60s (a resposta de um canal live dura horas)
  // — o abort no meio do pipe ainda emitia 'error' não tratado e matava o processo.
  const controller = new AbortController();
  const connectTimeout = setTimeout(() => controller.abort(), 30_000);
  // Cliente fechou (zapping, aba fechada) → derruba a conexão upstream junto,
  // senão o servidor IPTV acumula conexões fantasma até estourar o limite (429).
  res.on('close', () => controller.abort());

  try {
    const upstream = await fetch(parsed.href, {
      method,
      headers,
      body,
      redirect: 'follow', // segue 30x no servidor (o navegador não nos deixa fazê-lo)
      signal: controller.signal,
    });
    clearTimeout(connectTimeout);

    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      if (!STRIP_RES_HEADERS.has(key.toLowerCase())) res.setHeader(key, value);
    });

    if (upstream.body) {
      const stream = Readable.fromWeb(upstream.body);
      // Sem handler, o 'error' do abort (cliente desistiu) derruba o Node inteiro
      stream.on('error', () => res.end());
      stream.pipe(res);
    } else {
      res.end();
    }
  } catch (e) {
    clearTimeout(connectTimeout);
    if (!res.headersSent) {
      res.status(502).json({ error: 'upstream fetch failed', detail: String(e?.message || e) });
    } else {
      res.end();
    }
  }
});

app.listen(3001, () => console.log('Proxy rodando em http://localhost:3001'));
