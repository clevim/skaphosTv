/*
  ════════════════════════════════════════════════════════════════════════
  GERADOR DE TENTÁCULOS — SkaphosTV loading screen
  ════════════════════════════════════════════════════════════════════════
  CÓPIA FIEL do tentacle-generator.js do projeto Claude Design (fonte da
  animação de entrada). Fonte dos <path> SVG usados na splash — NÃO gerado
  em runtime: rode `node scripts/gen-tentacle-paths.js` para regravar
  src/generated/tentaclePaths.ts sempre que mudar HERO_CONFIGS/BG_CONFIGS.

  Cada tentáculo é uma "espinha" (buildSpine): caminha a partir de um
  ponto-âncora (ax,ay) numa direção (angleDeg), curvando progressivamente
  em gancho (spiralDeg). Em volta dela infla-se uma fita que afina da base
  (baseW) até a ponta (widthAt/bandPath) — a silhueta preenchida final.
  Tudo em coordenadas fixas 1920×1080 (viewBox do <svg>, preenchido via
  preserveAspectRatio="xMidYMid slice").

  HERO (6, nítidos, contorno+ventosas+brilho) vs BG (5, atrás, silhueta +
  1 faixa de rim tênue, para blur/opacidade — "sombra" que dá volume sem
  competir em detalhe).

  ⚠️ HISTÓRICO #1 — NÃO reintroduzir sem ler isto:
  Uma versão anterior dividia cada HERO em duas bandas (base 0→0.6, tip
  0.36→1) pra poder girar a ponta com pivô PRÓPRIO (--jx,--jy), separado
  do pivô do balanço geral (--ax,--ay) — um rig de "2 ossos" pra parecer
  mais orgânico. Na prática, qualquer rotação da banda "tip" em torno de
  um pivô NO MEIO do tentáculo desloca a borda distante do corte (em
  f≈0.62) proporcionalmente à distância até o pivô × o ângulo — com a
  amplitude usada (~5–6.5°) esse deslocamento passava da margem de
  sobreposição e abria uma FRESTA visível bem na "base da ponta". Não
  existe margem de sobreposição "segura" para qualquer amplitude — ou a
  amplitude fica pequena demais pra notar, ou a fresta aparece. Solução
  adotada e MANTIDA: UMA peça só por tentáculo (sem corte).

  ⚠️ HISTÓRICO #2 — como conseguimos "mais orgânico" DEPOIS disso, ainda
  sem cortar a geometria (ver "RIG DE 3 CAMADAS" abaixo): a v1 do balanço
  de peça única usava só UMA rotação e amplitude pequena (1.1–1.7°) —
  visualmente quase parado. A saída correta: MÚLTIPLAS transformações
  (rotação + rotação secundária + escala) todas ancoradas no MESMO pivô
  (--ax,--ay), em vez de dividir a geometria. Rotações compostas em torno
  do MESMO ponto sempre somam matematicamente — por mais camadas que você
  aninhe, é sempre UMA transformação rígida no fim, então NUNCA existe uma
  costura pra aparecer. O "orgânico" vem de combinar duas rotações com
  períodos e fases diferentes (um batimento/interferência, não um seno
  limpo) mais uma pulsação de escala (a peça toda "respira" — estica/
  encolhe a partir da âncora, então a ponta se move mais que a base
  automaticamente, sem precisar de um segundo pivô).

  RIG DE 3 CAMADAS (sway → sway2 → breathe): 4 <g>/<G> aninhados por
  tentáculo — grow (entrada, 1x), sway (rotação lenta), sway2 (rotação
  mais rápida, fora de fase), breathe (pulso de escala) — TODOS pivotando
  em (--ax,--ay). Portado para RN em src/components/AnimatedSplash.tsx.
*/

const D = Math.PI / 180;
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const round = (n) => Math.round(n * 10) / 10;

// buildSpine(cfg): cfg = {ax,ay,angleDeg,len,spiralDeg,ph} — ver comentário
// de topo. Devolve pontos {x,y,f} com f de 0 (raiz) a 1 (ponta).
function buildSpine({ ax, ay, angleDeg, len, spiralDeg, ph }) {
  const N = 48;
  const ang = angleDeg * D, spiralTotal = spiralDeg * D;
  let x = ax, y = ay;
  const pts = [{ x, y, f: 0 }];
  const ds = len / N;
  for (let i = 1; i <= N; i++) {
    const f = i / N;
    const shape = f < 0.4 ? 0.22 * Math.pow(f / 0.4, 2) : 0.22 + 0.78 * easeInOutCubic((f - 0.4) / 0.6);
    const wob = 0.10 * Math.sin(f * 5.2 + ph * 1.7) * Math.min(f * 2, 1);
    const th = ang + spiralTotal * shape + wob;
    x += Math.cos(th) * ds; y += Math.sin(th) * ds;
    pts.push({ x, y, f });
  }
  return pts;
}

function widthAt(f, baseW) {
  const shape = 0.26 + 0.74 * Math.pow(1 - f, 1.15);
  return Math.max(baseW * shape, baseW * 0.15);
}

// bandPath: fita cheia (polígono fechado) — só para FILL, nunca stroke
// (ver edgeStrokePath para o contorno).
function bandPath(pts, baseW, loT, hiT) {
  const Lx = [], Ly = [], Rx = [], Ry = [];
  const N = pts.length;
  for (let i = 0; i < N; i++) {
    const p0 = pts[Math.max(i - 1, 0)], p1 = pts[Math.min(i + 1, N - 1)];
    let tx = p1.x - p0.x, ty = p1.y - p0.y;
    const mm = Math.hypot(tx, ty) || 1; tx /= mm; ty /= mm;
    const nx = -ty, ny = tx;
    const hw = widthAt(pts[i].f, baseW) / 2;
    Lx.push(pts[i].x + nx * hw * hiT); Ly.push(pts[i].y + ny * hw * hiT);
    Rx.push(pts[i].x + nx * hw * loT); Ry.push(pts[i].y + ny * hw * loT);
  }
  let d = `M ${round(Lx[0])} ${round(Ly[0])} `;
  for (let i = 1; i < N; i++) d += `L ${round(Lx[i])} ${round(Ly[i])} `;
  for (let i = N - 1; i >= 0; i--) d += `L ${round(Rx[i])} ${round(Ry[i])} `;
  return d + 'Z';
}

// edgeStrokePath: só as duas bordas verdadeiras, como polilinhas ABERTAS
// (sem tampo) — usar com fill:none;stroke:... para o contorno.
function edgeStrokePath(pts, baseW) {
  const Lx = [], Ly = [], Rx = [], Ry = [];
  const N = pts.length;
  for (let i = 0; i < N; i++) {
    const p0 = pts[Math.max(i - 1, 0)], p1 = pts[Math.min(i + 1, N - 1)];
    let tx = p1.x - p0.x, ty = p1.y - p0.y;
    const mm = Math.hypot(tx, ty) || 1; tx /= mm; ty /= mm;
    const nx = -ty, ny = tx;
    const hw = widthAt(pts[i].f, baseW) / 2;
    Lx.push(pts[i].x + nx * hw); Ly.push(pts[i].y + ny * hw);
    Rx.push(pts[i].x - nx * hw); Ry.push(pts[i].y - ny * hw);
  }
  let d = `M ${round(Lx[0])} ${round(Ly[0])} `;
  for (let i = 1; i < N; i++) d += `L ${round(Lx[i])} ${round(Ly[i])} `;
  d += `M ${round(Rx[0])} ${round(Ry[0])} `;
  for (let i = 1; i < N; i++) d += `L ${round(Rx[i])} ${round(Ry[i])} `;
  return d;
}

function suckerAt(pts, f, baseW, suckerSide) {
  const N = pts.length;
  const idx = Math.min(N - 1, Math.round(f * (N - 1)));
  const p = pts[idx];
  const p0 = pts[Math.max(idx - 1, 0)], p1 = pts[Math.min(idx + 1, N - 1)];
  let tx = p1.x - p0.x, ty = p1.y - p0.y; const mm = Math.hypot(tx, ty) || 1; tx /= mm; ty /= mm;
  const nx = -ty * suckerSide, ny = tx * suckerSide;
  const hw = widthAt(f, baseW) / 2;
  const cx = p.x + nx * hw * 0.46, cy = p.y + ny * hw * 0.46;
  const rr = Math.max(hw * 0.30, 2.6);
  const rotDeg = Math.atan2(ty, tx) / D;
  return { cx: round(cx), cy: round(cy), rx: round(rr * 0.95), ry: round(rr * 1.25), rot: round(rotDeg) };
}

// makeHeroTentacle(cfg) — UMA peça só (sem corte base/tip — ver Histórico
// #1). cfg usa os campos de buildSpine + baseW.
function makeHeroTentacle(cfg) {
  const pts = buildSpine(cfg);
  const hiSide = cfg.spiralDeg < 0 ? 1 : -1;
  const suckerSide = -hiSide;

  const fill = bandPath(pts, cfg.baseW, -1, 1);
  const edge = edgeStrokePath(pts, cfg.baseW);
  const rim = bandPath(pts, cfg.baseW, hiSide * 0.14, hiSide * 0.80);
  const bright = bandPath(pts, cfg.baseW, hiSide * 0.52, hiSide * 0.74);

  const suckerFs = [0.40, 0.50, 0.60, 0.69, 0.77, 0.85, 0.92];
  const suckers = suckerFs.map((f) => suckerAt(pts, f, cfg.baseW, suckerSide));

  const tip = pts[pts.length - 1];
  const tipCapR = round((widthAt(1, cfg.baseW) / 2) * 0.9);

  return { fill, edge, rim, bright, suckers, tipCap: { cx: round(tip.x), cy: round(tip.y), r: tipCapR } };
}

// makeBgTentacle(cfg) — silhueta + 1 faixa de rim tênue (sem ventosas/
// contorno rígido/tampa) — leva opacidade reduzida no app.
function makeBgTentacle(cfg) {
  const pts = buildSpine(cfg);
  const hiSide = cfg.spiralDeg < 0 ? 1 : -1;
  return {
    fill: bandPath(pts, cfg.baseW, -1, 1),
    rim: bandPath(pts, cfg.baseW, hiSide * 0.10, hiSide * 0.72),
  };
}

/*
  PARÂMETROS — 6 hero + 5 bg. Campos de geometria (ax/ay/angleDeg/len/
  baseW/spiralDeg/ph) + campos de ANIMAÇÃO:
    delay                    atraso (s) antes de "crescer" na entrada.
    sway, swayDur, swayDelay        rotação PRINCIPAL (grau, s, s).
    sway2, sway2Dur, sway2Delay     rotação SECUNDÁRIA (grau, s, s) —
                                     período mais curto, fora de fase.
    breathe, breatheDur, breatheDelay  pulso de ESCALA (fração, s, s).

  Ao ajustar: mantenha sway2Dur bem menor que swayDur (~35–50%) e evite
  razão "redonda" (2:1, 3:1) — períodos quase-mas-não-exatamente
  proporcionais é o que cria o batimento orgânico.
*/
const HERO_CONFIGS = [
  { name: 'leftUpper', ax: -60, ay: 290, angleDeg: 24, len: 760, baseW: 100, spiralDeg: -186, ph: 0.4,
    delay: 0.18,
    swayDelay: 0.0, swayDur: 9.5, sway: 5.5,
    sway2Delay: 0.6, sway2Dur: 4.1, sway2: 2.6,
    breatheDelay: 0.4, breatheDur: 12.5, breathe: 0.030 },
  { name: 'leftLower', ax: -75, ay: 670, angleDeg: -16, len: 840, baseW: 126, spiralDeg: -208, ph: 1.6,
    delay: 0.50,
    swayDelay: 0.9, swayDur: 10.5, sway: 6.5,
    sway2Delay: 1.3, sway2Dur: 4.6, sway2: 3.0,
    breatheDelay: 1.1, breatheDur: 13.8, breathe: 0.036 },
  { name: 'rightUpper', ax: 1980, ay: 290, angleDeg: 156, len: 760, baseW: 100, spiralDeg: 186, ph: 2.0,
    delay: 0.30,
    swayDelay: 0.5, swayDur: 9.9, sway: 5.5,
    sway2Delay: 0.2, sway2Dur: 4.3, sway2: 2.6,
    breatheDelay: 0.9, breatheDur: 12.9, breathe: 0.030 },
  { name: 'rightLower', ax: 1995, ay: 670, angleDeg: 196, len: 840, baseW: 126, spiralDeg: 208, ph: 0.9,
    delay: 0.58,
    swayDelay: 1.4, swayDur: 10.9, sway: 6.5,
    sway2Delay: 0.7, sway2Dur: 4.8, sway2: 3.0,
    breatheDelay: 0.2, breatheDur: 14.2, breathe: 0.036 },
  { name: 'bottomLeft', ax: 610, ay: 1145, angleDeg: -98, len: 610, baseW: 116, spiralDeg: -172, ph: 1.1,
    delay: 0.78,
    swayDelay: 0.3, swayDur: 8.8, sway: 4.6,
    sway2Delay: 1.0, sway2Dur: 3.8, sway2: 2.2,
    breatheDelay: 0.6, breatheDur: 11.6, breathe: 0.026 },
  { name: 'bottomRight', ax: 1310, ay: 1145, angleDeg: -82, len: 610, baseW: 116, spiralDeg: 172, ph: 2.6,
    delay: 0.86,
    swayDelay: 1.1, swayDur: 9.3, sway: 4.6,
    sway2Delay: 0.3, sway2Dur: 4.0, sway2: 2.2,
    breatheDelay: 1.4, breatheDur: 12.1, breathe: 0.026 },
];

const BG_CONFIGS = [
  { name: 'bgTopLeft', ax: -55, ay: -55, angleDeg: 55, len: 560, baseW: 116, spiralDeg: -168, ph: 0.3,
    delay: 0.05,
    swayDelay: 0.2, swayDur: 12.5, sway: 3.4,
    sway2Delay: 0.8, sway2Dur: 5.3, sway2: 1.7,
    breatheDelay: 0.5, breatheDur: 16.0, breathe: 0.032 },
  { name: 'bgTopRight', ax: 1975, ay: -55, angleDeg: 125, len: 560, baseW: 116, spiralDeg: 168, ph: 1.8,
    delay: 0.12,
    swayDelay: 1.1, swayDur: 13.2, sway: 3.4,
    sway2Delay: 0.3, sway2Dur: 5.6, sway2: 1.7,
    breatheDelay: 1.2, breatheDur: 16.8, breathe: 0.032 },
  { name: 'bgLeftFar', ax: -90, ay: 480, angleDeg: 18, len: 560, baseW: 118, spiralDeg: -175, ph: 2.4,
    delay: 0.0,
    swayDelay: 0.6, swayDur: 14.5, sway: 2.8,
    sway2Delay: 1.4, sway2Dur: 6.1, sway2: 1.4,
    breatheDelay: 0.2, breatheDur: 18.0, breathe: 0.028 },
  { name: 'bgRightFar', ax: 2010, ay: 480, angleDeg: 162, len: 560, baseW: 118, spiralDeg: 175, ph: 0.9,
    delay: 0.22,
    swayDelay: 1.7, swayDur: 15.1, sway: 2.8,
    sway2Delay: 0.5, sway2Dur: 6.4, sway2: 1.4,
    breatheDelay: 1.0, breatheDur: 18.7, breathe: 0.028 },
  { name: 'bgBottomCenter', ax: 960, ay: 1165, angleDeg: -90, len: 360, baseW: 100, spiralDeg: 130, ph: 1.2,
    delay: 0.35,
    swayDelay: 0.4, swayDur: 11.8, sway: 3.8,
    sway2Delay: 0.9, sway2Dur: 5.0, sway2: 1.9,
    breatheDelay: 0.3, breatheDur: 14.9, breathe: 0.036 },
];

module.exports = {
  makeHeroTentacle, makeBgTentacle,
  HERO_CONFIGS, BG_CONFIGS,
};
