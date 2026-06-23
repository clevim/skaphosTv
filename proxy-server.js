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

  try {
    const upstream = await fetch(parsed.href, {
      method,
      headers,
      body,
      redirect: 'follow', // segue 30x no servidor (o navegador não nos deixa fazê-lo)
      signal: AbortSignal.timeout(60_000),
    });

    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      if (!STRIP_RES_HEADERS.has(key.toLowerCase())) res.setHeader(key, value);
    });

    if (upstream.body) {
      Readable.fromWeb(upstream.body).pipe(res);
    } else {
      res.end();
    }
  } catch (e) {
    res.status(502).json({ error: 'upstream fetch failed', detail: String(e?.message || e) });
  }
});

app.listen(3001, () => console.log('Proxy rodando em http://localhost:3001'));
