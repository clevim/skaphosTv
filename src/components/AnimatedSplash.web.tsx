import React, { useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet, View, Easing, useWindowDimensions } from 'react-native';
import { colors } from '../utils/theme';

const MIN_VISIBLE_MS = 2400;

// ── Canvas animation (ported from design/entrance-animation.html) ──────────

interface Anchor {
  side: 'L'|'R'|'T'|'B'; pos: number; off: number; len: number;
  w: number; ph: number; sp: number; curl: number;
}
interface Pt { x: number; y: number; f: number; }
interface Star { x:number; y:number; r:number; ph:number; sp:number; delay:number; }
interface Mote { x:number; y:number; r:number; sp:number; drift:number; ph:number; }

const ANCHORS: Anchor[] = [
  {side:'L',pos:0.18,off: 0.16,len:0.52,w:30,ph:0.0,sp:0.55,curl: 1},
  {side:'L',pos:0.44,off:-0.10,len:0.60,w:34,ph:1.7,sp:0.48,curl:-1},
  {side:'L',pos:0.70,off: 0.22,len:0.50,w:26,ph:0.8,sp:0.60,curl: 1},
  {side:'L',pos:0.90,off: 0.05,len:0.44,w:22,ph:2.3,sp:0.52,curl:-1},
  {side:'R',pos:0.16,off:-0.18,len:0.54,w:30,ph:0.4,sp:0.57,curl:-1},
  {side:'R',pos:0.42,off: 0.10,len:0.62,w:34,ph:2.0,sp:0.50,curl: 1},
  {side:'R',pos:0.68,off:-0.22,len:0.50,w:26,ph:1.1,sp:0.62,curl:-1},
  {side:'R',pos:0.88,off:-0.04,len:0.45,w:22,ph:3.1,sp:0.46,curl: 1},
  {side:'B',pos:0.22,off: 0.20,len:0.56,w:26,ph:0.3,sp:0.66,curl: 1},
  {side:'B',pos:0.45,off:-0.12,len:0.48,w:24,ph:2.6,sp:0.70,curl:-1},
  {side:'B',pos:0.60,off: 0.12,len:0.48,w:24,ph:1.4,sp:0.64,curl: 1},
  {side:'B',pos:0.80,off:-0.20,len:0.56,w:26,ph:0.9,sp:0.68,curl:-1},
  {side:'T',pos:0.28,off: 0.18,len:0.46,w:20,ph:1.9,sp:0.74,curl:-1},
  {side:'T',pos:0.72,off:-0.18,len:0.46,w:20,ph:0.6,sp:0.78,curl: 1},
];

function runCanvasAnim(canvas: HTMLCanvasElement, container: HTMLElement): () => void {
  const ctx = canvas.getContext('2d')!;
  let W = 0, H = 0, scale = 1;
  let elapsed = 0, lastTs: number | null = null, running = true, rafId: number | null = null;
  let nebBuf: HTMLCanvasElement | null = null, starSprite: HTMLCanvasElement | null = null;
  let resolved: {x:number;y:number;ang:number}[] = [];
  let stars: Star[] = [], motes: Mote[] = [];

  function seed() {
    stars = Array.from({length:110},()=>({
      x:Math.random(),y:Math.random(),r:0.4+Math.random()*1.7,
      ph:Math.random()*6.28,sp:0.4+Math.random()*1.8,delay:Math.random()*1.8,
    }));
    motes = Array.from({length:28},()=>({
      x:Math.random(),y:Math.random(),r:0.8+Math.random()*2.2,
      sp:0.006+Math.random()*0.016,drift:(Math.random()-0.5)*0.0009,ph:Math.random()*6.28,
    }));
  }

  function resolveAnchor(a: Anchor) {
    const e = 0.035;
    let x: number, y: number, base: number;
    if (a.side==='L')      { x=-e*W;      y=a.pos*H;      base=0; }
    else if (a.side==='R') { x=(1+e)*W;   y=a.pos*H;      base=Math.PI; }
    else if (a.side==='T') { x=a.pos*W;   y=-e*H;         base=Math.PI/2; }
    else                   { x=a.pos*W;   y=(1+e)*H;      base=-Math.PI/2; }
    return { x, y, ang: base + a.off };
  }

  function buildCaches() {
    const S = 32;
    starSprite = document.createElement('canvas');
    starSprite.width = starSprite.height = S;
    const sc = starSprite.getContext('2d')!;
    const sg = sc.createRadialGradient(S/2,S/2,0,S/2,S/2,S/2);
    sg.addColorStop(0,   'rgba(224,196,255,1)');
    sg.addColorStop(0.35,'rgba(190,120,255,0.55)');
    sg.addColorStop(1,   'rgba(170,90,255,0)');
    sc.fillStyle = sg; sc.fillRect(0,0,S,S);

    const nw = Math.max(2,Math.round(W*0.5)), nh = Math.max(2,Math.round(H*0.5));
    nebBuf = document.createElement('canvas');
    nebBuf.width = nw; nebBuf.height = nh;
    const nc = nebBuf.getContext('2d')!;
    const md = Math.max(nw,nh);
    const g1 = nc.createRadialGradient(nw*0.5,nh*0.46,0, nw*0.5,nh*0.46, md*0.55);
    g1.addColorStop(0,   'rgba(96,30,180,0.30)');
    g1.addColorStop(0.42,'rgba(60,18,128,0.17)');
    g1.addColorStop(1,   'rgba(0,0,0,0)');
    nc.fillStyle = g1; nc.fillRect(0,0,nw,nh);
    const g2 = nc.createRadialGradient(nw*0.32,nh*0.36,0, nw*0.32,nh*0.36, md*0.30);
    g2.addColorStop(0,'rgba(120,40,210,0.14)');
    g2.addColorStop(1,'rgba(0,0,0,0)');
    nc.fillStyle = g2; nc.fillRect(0,0,nw,nh);
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio||1, 1.5);
    // Fallback para window caso o container ainda não tenha sido pintado pelo browser
    W = container.clientWidth || window.innerWidth;
    H = container.clientHeight || window.innerHeight;
    scale = Math.min(Math.max(Math.min(W,H)/760, 0.5), 1.35);
    canvas.width  = Math.round(W*dpr);
    canvas.height = Math.round(H*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    resolved = ANCHORS.map(resolveAnchor);
    buildCaches();
  }

  const eoc = (t: number) => 1-Math.pow(1-t,3);
  const clamp = (v: number,a: number,b: number)=>v<a?a:v>b?b:v;

  function buildSpine(t: number, a: Anchor, anc: {x:number;y:number;ang:number}, grow: number): Pt[] {
    const N = 16;
    const ref = (a.side==='L'||a.side==='R') ? W : H;
    const fullLen = a.len*ref, len = fullLen*grow;
    const dx = Math.cos(anc.ang), dy = Math.sin(anc.ang);
    const px = -dy, py = dx;
    const amp = 0.13*fullLen;
    const pts: Pt[] = [];
    for (let i = 0; i <= N; i++) {
      const f = i/N, d = len*f;
      const cx = anc.x+dx*d, cy = anc.y+dy*d;
      const env = 0.05+f*0.95;
      let off = Math.sin(f*Math.PI*1.6+t*a.sp+a.ph)*amp*env;
      off += Math.sin(f*Math.PI*3.4+t*a.sp*1.7+a.ph*1.3)*amp*0.32*env;
      off += Math.pow(f,2)*a.curl*amp*0.9*Math.sin(t*a.sp*0.55+a.ph);
      pts.push({x:cx+px*off, y:cy+py*off, f});
    }
    return pts;
  }

  function widthAt(f: number, bw: number) {
    return Math.max(bw*scale*Math.pow(1-f,0.78)*(1+0.18*Math.sin(f*Math.PI)), 0.6);
  }

  function drawTentacle(t: number, a: Anchor, anc: {x:number;y:number;ang:number}, grow: number) {
    if (grow <= 0.01) return;
    const pts = buildSpine(t, a, anc, grow);
    const appear = clamp(grow*1.6, 0, 1);
    const L: {x:number;y:number}[] = [], R: {x:number;y:number}[] = [];
    for (let i = 0; i < pts.length; i++) {
      const p0 = pts[Math.max(i-1,0)], p1 = pts[Math.min(i+1,pts.length-1)];
      let tx = p1.x-p0.x, ty = p1.y-p0.y;
      const m = Math.hypot(tx,ty)||1; tx/=m; ty/=m;
      const nx = -ty, ny = tx;
      const hw = widthAt(pts[i].f, a.w)/2;
      L.push({x:pts[i].x+nx*hw, y:pts[i].y+ny*hw});
      R.push({x:pts[i].x-nx*hw, y:pts[i].y-ny*hw});
    }
    const path = new Path2D();
    path.moveTo(L[0].x, L[0].y);
    for (let i = 1; i < L.length; i++) path.lineTo(L[i].x, L[i].y);
    for (let i = R.length-1; i >= 0; i--) path.lineTo(R[i].x, R[i].y);
    path.closePath();
    const root = pts[0], tip = pts[pts.length-1];
    const g = ctx.createLinearGradient(root.x,root.y,tip.x,tip.y);
    g.addColorStop(0,   `rgba(28,11,52,${0.95*appear})`);
    g.addColorStop(0.6, `rgba(46,20,82,${0.92*appear})`);
    g.addColorStop(1,   `rgba(60,28,108,${0.85*appear})`);
    ctx.fillStyle = g; ctx.fill(path);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.lineWidth = 5*scale;
    ctx.strokeStyle = `rgba(150,60,255,${0.16*appear})`; ctx.stroke(path);
    ctx.lineWidth = 1.5*scale;
    ctx.strokeStyle = `rgba(178,108,245,${0.75*appear})`; ctx.stroke(path);
    for (let i = 3; i < pts.length-1; i += 2) {
      const p0 = pts[i-1], p1 = pts[Math.min(i+1,pts.length-1)];
      let tx = p1.x-p0.x, ty = p1.y-p0.y;
      const m = Math.hypot(tx,ty)||1; tx/=m; ty/=m;
      const nx = -ty, ny = tx;
      const hw = widthAt(pts[i].f, a.w)/2;
      const sx = pts[i].x+nx*hw*0.45*a.curl, sy = pts[i].y+ny*hw*0.45*a.curl;
      const r = Math.max(hw*0.34, 0.6);
      ctx.beginPath(); ctx.arc(sx,sy,r*1.8,0,6.28);
      ctx.fillStyle = `rgba(150,70,240,${0.22*appear})`; ctx.fill();
      ctx.beginPath(); ctx.arc(sx,sy,r,0,6.28);
      ctx.fillStyle = `rgba(196,132,252,${0.6*appear})`; ctx.fill();
    }
  }

  function drawNebula(t: number, fade: number) {
    if (!nebBuf) return;
    ctx.globalAlpha = clamp(fade*(0.84+Math.sin(t*0.6)*0.16), 0, 1);
    ctx.drawImage(nebBuf, 0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  function drawStars(t: number, fade: number) {
    if (!starSprite) return;
    for (const s of stars) {
      const vis = clamp((t-s.delay)/1.4, 0, 1);
      const tw = (0.5+Math.sin(t*s.sp+s.ph)*0.5)*vis*fade;
      if (tw < 0.02) continue;
      const sz = s.r*8;
      ctx.globalAlpha = tw;
      ctx.drawImage(starSprite, s.x*W-sz/2, s.y*H-sz/2, sz, sz);
    }
    ctx.globalAlpha = 1;
  }

  function drawMotes(t: number, fade: number) {
    for (const p of motes) {
      p.y -= p.sp*0.012; p.x += p.drift;
      if (p.y < -0.05) { p.y = 1.05; p.x = Math.random(); }
      const tw = (0.4+Math.sin(t*0.8+p.ph)*0.6)*fade;
      ctx.beginPath(); ctx.arc(p.x*W, p.y*H, p.r, 0, 6.28);
      ctx.fillStyle = `rgba(180,120,255,${tw*0.35})`; ctx.fill();
    }
  }

  function frame(ts: number) {
    if (lastTs === null) lastTs = ts;
    const dt = Math.min((ts-lastTs)/1000, 0.05);
    lastTs = ts; elapsed += dt;
    const t = elapsed, fade = clamp(t/1.3, 0, 1);
    ctx.clearRect(0,0,W,H);
    drawNebula(t, fade);
    drawStars(t, fade);
    for (let i = 0; i < ANCHORS.length; i++) {
      const raw = clamp((t-0.12*i)/1.5, 0, 1);
      drawTentacle(t, ANCHORS[i], resolved[i], eoc(raw));
    }
    drawMotes(t, fade);
    if (running) rafId = requestAnimationFrame(frame);
    else rafId = null;
  }

  seed();
  // Aguarda um frame para garantir que o container foi pintado e clientWidth é válido
  requestAnimationFrame(() => { resize(); rafId = requestAnimationFrame(frame); });

  const onResize = () => resize();
  const onVisibility = () => {
    if (document.hidden) { running = false; if (rafId) { cancelAnimationFrame(rafId); rafId = null; } }
    else { running = true; lastTs = null; rafId = requestAnimationFrame(frame); }
  };
  window.addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', onVisibility);

  return () => {
    running = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}

// ── React component ──────────────────────────────────────────────────────────

export default function AnimatedSplash({ ready, onFinish }: { ready: boolean; onFinish: () => void }) {
  const { width: winW, height: winH } = useWindowDimensions();
  const containerRef = useRef<View>(null);
  const canvasRef    = useRef<HTMLCanvasElement | null>(null);
  const rootOpacity  = useRef(new Animated.Value(1)).current;
  const logoOpacity  = useRef(new Animated.Value(0)).current;
  const logoScale    = useRef(new Animated.Value(0.62)).current;
  const breath       = useRef(new Animated.Value(1)).current;
  const glowOp       = useRef(new Animated.Value(0.6)).current;
  const glowSize     = useRef(new Animated.Value(0.97)).current;
  const dotsOp       = useRef(new Animated.Value(0)).current;
  const d1 = useRef(new Animated.Value(0)).current;
  const d2 = useRef(new Animated.Value(0)).current;
  const d3 = useRef(new Animated.Value(0)).current;
  const mountTs = useRef(Date.now());
  const doneRef = useRef(false);

  // Design: clamp(190px, 46vmin, 600px)
  const logoW = Math.min(Math.max(190, Math.min(winW, winH) * 0.46), 600);

  // Canvas animation setup
  useEffect(() => {
    const container = containerRef.current as unknown as HTMLElement;
    if (!container) return;
    // Fundo em gradiente radial do design (por trás do canvas)
    container.style.background =
      `radial-gradient(120% 120% at 50% 42%, #0c0618 0%, ${colors.splashBg} 60%, #030106 100%)`;
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;';
    canvasRef.current = canvas;
    container.insertBefore(canvas, container.firstChild);
    const stop = runCanvasAnim(canvas, container);
    return () => { stop(); canvas.remove(); canvasRef.current = null; };
  }, []);

  // Logo + glow + dots animations
  useEffect(() => {
    // Logo entrance (delay matches tentacle grow-in ~0.9 s)
    Animated.parallel([
      Animated.timing(logoScale, {
        toValue: 1, duration: 1250, delay: 900,
        easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }),
      Animated.timing(logoOpacity, {
        toValue: 1, duration: 750, delay: 900,
        easing: Easing.out(Easing.ease), useNativeDriver: true,
      }),
    ]).start();

    // Respiração do logo (design: sk-breath 4.2 s, scale 1 → 1.035, após a entrada)
    const breathLoop = Animated.loop(Animated.sequence([
      Animated.timing(breath, { toValue: 1.035, duration: 2100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(breath, { toValue: 1,     duration: 2100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    const breathTimer = setTimeout(() => breathLoop.start(), 2200);

    const glowLoop = Animated.loop(Animated.sequence([
      Animated.parallel([
        Animated.timing(glowOp,   { toValue: 1,    duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(glowSize, { toValue: 1.05, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(glowOp,   { toValue: 0.6,  duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(glowSize, { toValue: 0.97, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    ]));
    glowLoop.start();

    Animated.timing(dotsOp, { toValue: 1, duration: 800, delay: 1800, useNativeDriver: true }).start();
    const dotLoop = (val: Animated.Value) =>
      Animated.loop(Animated.sequence([
        Animated.timing(val, { toValue: -7, duration: 400, easing: Easing.out(Easing.ease),     useNativeDriver: true }),
        Animated.timing(val, { toValue:  0, duration: 450, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.delay(600),
      ]));
    const t1 = setTimeout(() => dotLoop(d1).start(), 2000);
    const t2 = setTimeout(() => dotLoop(d2).start(), 2180);
    const t3 = setTimeout(() => dotLoop(d3).start(), 2360);
    return () => {
      glowLoop.stop(); breathLoop.stop();
      clearTimeout(breathTimer); clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
    };
  }, []); // eslint-disable-line

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    const cv = canvasRef.current;
    if (cv) { cv.style.transition = 'opacity 0.55s ease'; cv.style.opacity = '0'; }
    Animated.timing(rootOpacity, { toValue: 0, duration: 550, useNativeDriver: true }).start(() => onFinish());
  };

  useEffect(() => {
    if (!ready) return;
    const wait = Math.max(0, MIN_VISIBLE_MS - (Date.now() - mountTs.current));
    const t = setTimeout(finish, wait);
    return () => clearTimeout(t);
  }, [ready]); // eslint-disable-line

  useEffect(() => {
    const hard = setTimeout(finish, 8000);
    return () => clearTimeout(hard);
  }, []); // eslint-disable-line


  return (
    <View
      ref={containerRef}
      style={[StyleSheet.absoluteFill, styles.root]}
      // Engole os toques enquanto a intro roda — nada atrás pode ser clicado.
      // @ts-ignore pointerEvents on web
      pointerEvents="auto"
    >
      {/* canvas is injected here via useEffect, behind React children */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.center, { opacity: rootOpacity }]}>
        <Animated.View style={{ opacity: logoOpacity, transform: [{ scale: logoScale }], zIndex: 2 }}>
          {/* Respiração num wrapper separado — a escala compõe com a da entrada.
              O glow (gradiente radial do design, sem círculo sólido) respira junto. */}
          <Animated.View style={{ transform: [{ scale: breath }] }}>
            <Animated.Image
              source={require('../../assets/splash-glow.png')}
              style={{
                position: 'absolute',
                width: logoW * 1.35, height: logoW * 1.35,
                left: -logoW * 0.175, top: -logoW * 0.195,
                opacity: glowOp,
                transform: [{ scale: glowSize }],
              }}
            />
            <Image
              source={require('../../assets/adaptive-icon.png')}
              style={{ width: logoW, height: logoW }}
              resizeMode="contain"
            />
          </Animated.View>
        </Animated.View>
        <Animated.View style={[styles.dots, { opacity: dotsOp, zIndex: 2 }]}>
          <Animated.View style={[styles.dot, { transform: [{ translateY: d1 }] }]} />
          <Animated.View style={[styles.dot, { transform: [{ translateY: d2 }] }]} />
          <Animated.View style={[styles.dot, { transform: [{ translateY: d3 }] }]} />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.splashBg, zIndex: 1000 },
  center: { alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute' },
  dots: { flexDirection: 'row', gap: 14, marginTop: 40 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#a25cf0' },
});
