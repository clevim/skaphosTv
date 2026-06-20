const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const dns = require('dns').promises;
const net = require('net');

const app = express();
app.use(cors());

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

app.use('/proxy', async (req, res, next) => {
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

  createProxyMiddleware({
    target: parsed.origin,
    changeOrigin: true,
    on: {
      proxyReq: (proxyReq) => {
        proxyReq.path = parsed.pathname + parsed.search;
      },
    },
  })(req, res, next);
});

app.listen(3001, () => console.log('Proxy rodando em http://localhost:3001'));
