#!/usr/bin/env node
/**
 * dev-update-server.js — serve storage/apks/ na rede local pro "Verificar
 * atualização" do app puxar builds de teste, sem precisar publicar no GitHub.
 *
 * Uso:
 *   node scripts/dev-update-server.js [porta]     (padrão 8787)
 *
 * No dispositivo/emulador, aponte o app pra este servidor definindo, antes de
 * rodar `expo start`/`eas build`:
 *   EXPO_PUBLIC_DEV_UPDATE_URL=http://<IP-DESTA-MÁQUINA>:8787
 *
 * Com isso, "Verificar atualização" e "Forçar atualização" nos Ajustes passam
 * a olhar pra cá em vez do GitHub — mesmo fluxo, fonte trocada via env var.
 *
 * Builds de dev (EXPO_PUBLIC_DEV_UPDATE_URL setado) saem sempre com o MESMO
 * nome — skaphostv-dev.apk — sobrescrevendo o anterior. Esse arquivo é sempre
 * tratado como "o build de dev atual", independente de versão em app.json.
 *
 * GET /latest.json → { version, apkUrl } do build atual em storage/apks/
 * GET /<arquivo>.apk → serve o APK (mesmo nome usado por build-firestick.sh)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = Number(process.argv[2]) || 8787;
const APKS_DIR = path.join(__dirname, '..', 'storage', 'apks');

function parseVersion(filename) {
  const m = filename.match(/^skaphostv-(\d+)\.(\d+)\.(\d+)(?:-dev)?\.apk$/);
  return m ? m.slice(1, 4).map(Number) : null;
}

function isNewer(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return false;
}

function findLatest() {
  // Build de dev de nome fixo tem prioridade — é sempre a última build gerada.
  const fixedDev = path.join(APKS_DIR, 'skaphostv-dev.apk');
  if (fs.existsSync(fixedDev)) {
    const built = new Date(fs.statSync(fixedDev).mtimeMs).toISOString().slice(0, 16).replace('T', ' ');
    return { file: 'skaphostv-dev.apk', label: `dev (${built})` };
  }
  const files = fs.existsSync(APKS_DIR) ? fs.readdirSync(APKS_DIR) : [];
  let best = null;
  for (const f of files) {
    const v = parseVersion(f);
    if (v && (!best || isNewer(v, best.v))) best = { file: f, v };
  }
  return best ? { file: best.file, label: best.v.join('.') } : null;
}

function lanIp() {
  const nets = os.networkInterfaces();
  for (const list of Object.values(nets)) {
    for (const net of list || []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/latest.json') {
    const latest = findLatest();
    res.setHeader('Content-Type', 'application/json');
    if (!latest) {
      res.writeHead(404).end(JSON.stringify({ error: 'nenhum apk em storage/apks/' }));
      return;
    }
    const host = req.headers.host;
    res.writeHead(200).end(JSON.stringify({
      version: latest.label,
      apkUrl: `http://${host}/${latest.file}`,
    }));
    return;
  }

  if (req.method === 'GET' && url.pathname.endsWith('.apk')) {
    const file = path.join(APKS_DIR, path.basename(url.pathname));
    if (!file.startsWith(APKS_DIR) || !fs.existsSync(file)) {
      res.writeHead(404).end('not found');
      return;
    }
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    fs.createReadStream(file).pipe(res);
    return;
  }

  res.writeHead(404).end('not found');
});

server.listen(PORT, () => {
  const latest = findLatest();
  console.log(`✓ dev update server em http://${lanIp()}:${PORT}`);
  console.log(latest ? `  build atual: ${latest.label}` : '  (storage/apks/ vazia — rode build:firestick primeiro)');
  console.log(`\n  Aponte o app com:\n    EXPO_PUBLIC_DEV_UPDATE_URL=http://${lanIp()}:${PORT}\n`);
});
