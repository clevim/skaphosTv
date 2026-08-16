/**
 * check-web-storage.js — verifica que o build WEB não estoura a cota do localStorage.
 *
 * No navegador o AsyncStorage é o localStorage: ~5 MB para o app INTEIRO. Um
 * catálogo Xtream típico serializa mais de 10 MB, então o cache de canais tem
 * orçamento (WEB_MAX_BYTES em src/store/useStore.ts) e limpa as chaves antigas
 * antes de regravar. Sem isso a cota enche e QUALQUER escrita seguinte falha em
 * silêncio — foi assim que "marcar como assistido" parava de persistir.
 *
 * O teste semeia um cache legado (formato v1) grande, abre o app no Chromium
 * headless e confere que, depois do boot: o legado saiu, o cache novo respeita o
 * orçamento, e uma marcação de 40 episódios ainda cabe e é relida.
 *
 * Uso:  docker compose up -d web  &&  node scripts/check-web-storage.js
 */
const { spawn } = require('child_process');
const { mkdtempSync, rmSync } = require('fs');
const { tmpdir } = require('os');
const { join } = require('path');
const assert = require('assert');

const APP = process.env.APP_URL || 'http://localhost:8080/';
const PORT = 9334;
const BUDGET_MB = 1.6;   // WEB_MAX_BYTES + folga do meta
const CHROME = process.env.CHROME || 'chromium';

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Cache legado (v1) de ~3,5 MB + uma fonte "completa" (não busca rede no boot).
const SEED = `(() => {
  localStorage.clear();
  const CH = 500, N = 9, pad = 'x'.repeat(300);
  for (let c = 0; c < N; c++) {
    const arr = [];
    for (let i = 0; i < CH; i++) arr.push({ id: 'vod-' + (c*CH+i), name: 'Filme ' + (c*CH+i) + ' ' + pad,
      url: 'http://exemplo.tv/movie/{{U}}/{{P}}/' + (c*CH+i) + '.mp4', logo: 'http://img/' + i + '.jpg',
      group: 'FILMES', quality: 'HD', isFavorite: false, streamType: 'movie', sourceId: 's1', plot: pad });
    localStorage.setItem('skaphostv_channels_' + c, JSON.stringify(arr));
  }
  localStorage.setItem('skaphostv_channels_meta', JSON.stringify({ chunks: N, groups: ['FILMES'], savedAt: Date.now() }));
  localStorage.setItem('skaphostv_sources', JSON.stringify([{ id: 's1', name: 'Teste', type: 'xtream',
    host: 'http://exemplo.tv', addedAt: 1, channelCount: N * CH }]));
  localStorage.setItem('skaphostv_secret_s1', JSON.stringify({ username: 'u', password: 'p' }));
  return Object.entries(localStorage).reduce((a, [k, v]) => a + k.length + v.length, 0);
})()`;

const MEASURE = `(() => {
  const bytes = Object.entries(localStorage).reduce((a, [k, v]) => a + k.length + v.length, 0);
  const marks = {};
  for (let i = 0; i < 40; i++) marks['ep-' + i] = { positionSec: 0, durationSec: 0, watched: true, updatedAt: Date.now() };
  let erro = null;
  try { localStorage.setItem('skaphostv_watch_progress', JSON.stringify(marks)); } catch (e) { erro = e.name; }
  return {
    bytes,
    v1: Object.keys(localStorage).filter(k => /^skaphostv_channels_/.test(k)).length,
    v2: Object.keys(localStorage).filter(k => /^skaphostv_channels2_/.test(k)).length,
    erro,
    relidas: Object.keys(JSON.parse(localStorage.getItem('skaphostv_watch_progress') || '{}')).length,
  };
})()`;

async function main() {
  const profile = mkdtempSync(join(tmpdir(), 'skaphos-check-'));
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    '--no-first-run', 'about:blank',
  ], { stdio: 'ignore' });

  let ws;
  try {
    let target;
    for (let i = 0; i < 20 && !target; i++) {
      await sleep(500);
      try {
        const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
        target = list.find(t => t.type === 'page');
      } catch { /* subindo ainda */ }
    }
    assert(target, `Chromium não respondeu em :${PORT} (defina CHROME=<binário>)`);

    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0;
    const pending = new Map();
    ws.onmessage = e => { const m = JSON.parse(e.data); pending.get(m.id)?.(m); pending.delete(m.id); };
    const send = (method, params = {}) => new Promise(r => {
      const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params }));
    });
    const evalJs = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      assert(!r.result?.exceptionDetails, `erro no navegador: ${JSON.stringify(r.result?.exceptionDetails)}`);
      return r.result?.result?.value;
    };

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.navigate', { url: APP });
    await sleep(3000);

    const semeado = await evalJs(SEED);
    assert(semeado > 3e6, `semeadura não gravou o cache legado (${semeado} bytes) — cota do navegador?`);
    console.log(`semeado: ${(semeado / 1048576).toFixed(2)} MB de cache legado (formato v1)`);

    // Reload: o boot lê o v1, migra pra v2 e dispara o save — é aí que o orçamento entra.
    await send('Page.navigate', { url: APP });
    await sleep(12000);

    const r = await evalJs(MEASURE);
    console.log(`depois do boot: ${(r.bytes / 1048576).toFixed(2)} MB | chunks v1: ${r.v1} | chunks v2: ${r.v2}`);
    console.log(`marcar 40 assistidos: ${r.erro || 'ok'} | releu ${r.relidas} entradas`);

    assert.strictEqual(r.v1, 0, 'chunks do formato v1 continuaram ocupando a cota');
    assert(r.v2 > 0, 'nenhum chunk novo foi gravado — cache de canais não persistiu');
    assert(r.bytes < BUDGET_MB * 1048576, `cache passou do orçamento: ${(r.bytes / 1048576).toFixed(2)} MB`);
    assert.strictEqual(r.erro, null, `gravação do progresso falhou: ${r.erro}`);
    assert.strictEqual(r.relidas, 40, 'progresso de assistidos não foi relido');
    console.log('OK');
  } finally {
    ws?.close();
    chrome.kill();
    await sleep(500); // deixa o Chromium soltar os arquivos do perfil
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* temp, o SO limpa */ }
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
