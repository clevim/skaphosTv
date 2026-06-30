/**
 * AnimatedSplash — splash de entrada com a animação de tentáculos do design.
 *
 * DEPENDÊNCIA NATIVA: react-native-webview
 *   npx expo install react-native-webview
 *   (requer rebuild do APK — não funciona por OTA)
 *
 * Arquitetura:
 *  • WebView (absoluteFill)     → canvas com tentáculos, nebulosa, estrelas, motes
 *  • View overlay (absoluteFill)→ logo, glow, dots animados em React Native
 *
 * A versão web usa AnimatedSplash.web.tsx (canvas direto no DOM, sem WebView).
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet, Easing, View } from 'react-native';
import { WebView } from 'react-native-webview';

const MIN_VISIBLE_MS = 1600;

// ── HTML do canvas animation (tentáculos + nebulosa + estrelas + motes) ──────
// Template literal — o JS interno NÃO usa backtick/interpolação para evitar conflito.
const CANVAS_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:100%;height:100%;background:#06030d;overflow:hidden}
  canvas{position:fixed;inset:0;width:100%;height:100%;display:block}
  .v{position:fixed;inset:0;background:radial-gradient(ellipse 78% 74% at 50% 50%,transparent 38%,rgba(0,0,0,.65) 100%);pointer-events:none}
</style>
</head>
<body>
<canvas id="c"></canvas>
<div class="v"></div>
<script>
(function(){
  var canvas=document.getElementById('c'), ctx=canvas.getContext('2d');
  var W=0,H=0,sc=1,elapsed=0,lastTs=null,running=true,rafId=null;
  var nebBuf=null,starSprite=null,resolved=[];
  var ANCHORS=[
    {side:'L',pos:0.18,off:0.16,len:0.52,w:30,ph:0.0,sp:0.55,curl:1},
    {side:'L',pos:0.44,off:-0.10,len:0.60,w:34,ph:1.7,sp:0.48,curl:-1},
    {side:'L',pos:0.70,off:0.22,len:0.50,w:26,ph:0.8,sp:0.60,curl:1},
    {side:'L',pos:0.90,off:0.05,len:0.44,w:22,ph:2.3,sp:0.52,curl:-1},
    {side:'R',pos:0.16,off:-0.18,len:0.54,w:30,ph:0.4,sp:0.57,curl:-1},
    {side:'R',pos:0.42,off:0.10,len:0.62,w:34,ph:2.0,sp:0.50,curl:1},
    {side:'R',pos:0.68,off:-0.22,len:0.50,w:26,ph:1.1,sp:0.62,curl:-1},
    {side:'R',pos:0.88,off:-0.04,len:0.45,w:22,ph:3.1,sp:0.46,curl:1},
    {side:'B',pos:0.22,off:0.20,len:0.56,w:26,ph:0.3,sp:0.66,curl:1},
    {side:'B',pos:0.45,off:-0.12,len:0.48,w:24,ph:2.6,sp:0.70,curl:-1},
    {side:'B',pos:0.60,off:0.12,len:0.48,w:24,ph:1.4,sp:0.64,curl:1},
    {side:'B',pos:0.80,off:-0.20,len:0.56,w:26,ph:0.9,sp:0.68,curl:-1},
    {side:'T',pos:0.28,off:0.18,len:0.46,w:20,ph:1.9,sp:0.74,curl:-1},
    {side:'T',pos:0.72,off:-0.18,len:0.46,w:20,ph:0.6,sp:0.78,curl:1}
  ];
  var stars=[],motes=[];

  function seed(){
    stars=[];for(var i=0;i<110;i++) stars.push({x:Math.random(),y:Math.random(),r:0.4+Math.random()*1.7,ph:Math.random()*6.28,sp:0.4+Math.random()*1.8,delay:Math.random()*1.8});
    motes=[];for(var j=0;j<28;j++) motes.push({x:Math.random(),y:Math.random(),r:0.8+Math.random()*2.2,sp:0.006+Math.random()*0.016,drift:(Math.random()-0.5)*0.0009,ph:Math.random()*6.28});
  }

  function resolveAnchor(a){
    var e=0.035,x,y,base;
    if(a.side==='L'){x=-e*W;y=a.pos*H;base=0;}
    else if(a.side==='R'){x=(1+e)*W;y=a.pos*H;base=Math.PI;}
    else if(a.side==='T'){x=a.pos*W;y=-e*H;base=Math.PI/2;}
    else{x=a.pos*W;y=(1+e)*H;base=-Math.PI/2;}
    return{x:x,y:y,ang:base+a.off};
  }

  function buildCaches(){
    var S=32;
    starSprite=document.createElement('canvas');
    starSprite.width=starSprite.height=S;
    var sc2=starSprite.getContext('2d');
    var sg=sc2.createRadialGradient(S/2,S/2,0,S/2,S/2,S/2);
    sg.addColorStop(0,'rgba(224,196,255,1)');
    sg.addColorStop(0.35,'rgba(190,120,255,0.55)');
    sg.addColorStop(1,'rgba(170,90,255,0)');
    sc2.fillStyle=sg;sc2.fillRect(0,0,S,S);

    var nw=Math.max(2,Math.round(W*0.5)),nh=Math.max(2,Math.round(H*0.5));
    nebBuf=document.createElement('canvas');nebBuf.width=nw;nebBuf.height=nh;
    var nc=nebBuf.getContext('2d'),md=Math.max(nw,nh);
    var g1=nc.createRadialGradient(nw*0.5,nh*0.46,0,nw*0.5,nh*0.46,md*0.55);
    g1.addColorStop(0,'rgba(96,30,180,0.30)');g1.addColorStop(0.42,'rgba(60,18,128,0.17)');g1.addColorStop(1,'rgba(0,0,0,0)');
    nc.fillStyle=g1;nc.fillRect(0,0,nw,nh);
    var g2=nc.createRadialGradient(nw*0.32,nh*0.36,0,nw*0.32,nh*0.36,md*0.30);
    g2.addColorStop(0,'rgba(120,40,210,0.14)');g2.addColorStop(1,'rgba(0,0,0,0)');
    nc.fillStyle=g2;nc.fillRect(0,0,nw,nh);
  }

  function resize(){
    var dpr=Math.min(window.devicePixelRatio||1,1.5);
    W=window.innerWidth;H=window.innerHeight;
    sc=Math.min(Math.max(Math.min(W,H)/760,0.5),1.35);
    canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    resolved=ANCHORS.map(resolveAnchor);
    buildCaches();
  }

  function clamp(v,a,b){return v<a?a:v>b?b:v;}
  function eoc(t){return 1-Math.pow(1-t,3);}

  function buildSpine(t,a,anc,grow){
    var N=16,ref=(a.side==='L'||a.side==='R')?W:H;
    var fullLen=a.len*ref,len=fullLen*grow;
    var dx=Math.cos(anc.ang),dy=Math.sin(anc.ang),px=-dy,py=dx;
    var amp=0.13*fullLen,pts=[];
    for(var i=0;i<=N;i++){
      var f=i/N,d=len*f,cx=anc.x+dx*d,cy=anc.y+dy*d,env=0.05+f*0.95;
      var off=Math.sin(f*Math.PI*1.6+t*a.sp+a.ph)*amp*env;
      off+=Math.sin(f*Math.PI*3.4+t*a.sp*1.7+a.ph*1.3)*amp*0.32*env;
      off+=Math.pow(f,2)*a.curl*amp*0.9*Math.sin(t*a.sp*0.55+a.ph);
      pts.push({x:cx+px*off,y:cy+py*off,f:f});
    }
    return pts;
  }

  function widthAt(f,bw){return Math.max(bw*sc*Math.pow(1-f,0.78)*(1+0.18*Math.sin(f*Math.PI)),0.6);}

  function drawTentacle(t,a,anc,grow){
    if(grow<=0.01)return;
    var pts=buildSpine(t,a,anc,grow),appear=clamp(grow*1.6,0,1);
    var L=[],R=[];
    for(var i=0;i<pts.length;i++){
      var p0=pts[Math.max(i-1,0)],p1=pts[Math.min(i+1,pts.length-1)];
      var tx=p1.x-p0.x,ty=p1.y-p0.y,m=Math.hypot(tx,ty)||1;
      tx/=m;ty/=m;var nx=-ty,ny=tx,hw=widthAt(pts[i].f,a.w)/2;
      L.push({x:pts[i].x+nx*hw,y:pts[i].y+ny*hw});
      R.push({x:pts[i].x-nx*hw,y:pts[i].y-ny*hw});
    }
    var path=new Path2D();
    path.moveTo(L[0].x,L[0].y);
    for(var li=1;li<L.length;li++) path.lineTo(L[li].x,L[li].y);
    for(var ri=R.length-1;ri>=0;ri--) path.lineTo(R[ri].x,R[ri].y);
    path.closePath();
    var root=pts[0],tip=pts[pts.length-1];
    var g=ctx.createLinearGradient(root.x,root.y,tip.x,tip.y);
    g.addColorStop(0,'rgba(28,11,52,'+0.95*appear+')');
    g.addColorStop(0.6,'rgba(46,20,82,'+0.92*appear+')');
    g.addColorStop(1,'rgba(60,28,108,'+0.85*appear+')');
    ctx.fillStyle=g;ctx.fill(path);
    ctx.lineJoin='round';ctx.lineCap='round';
    ctx.lineWidth=5*sc;ctx.strokeStyle='rgba(150,60,255,'+0.16*appear+')';ctx.stroke(path);
    ctx.lineWidth=1.5*sc;ctx.strokeStyle='rgba(178,108,245,'+0.75*appear+')';ctx.stroke(path);
    for(var si=3;si<pts.length-1;si+=2){
      var sp0=pts[si-1],sp1=pts[Math.min(si+1,pts.length-1)];
      var stx=sp1.x-sp0.x,sty=sp1.y-sp0.y,sm=Math.hypot(stx,sty)||1;
      stx/=sm;sty/=sm;var snx=-sty,sny=stx,shw=widthAt(pts[si].f,a.w)/2;
      var sx=pts[si].x+snx*shw*0.45*a.curl,sy=pts[si].y+sny*shw*0.45*a.curl;
      var sr=Math.max(shw*0.34,0.6);
      ctx.beginPath();ctx.arc(sx,sy,sr*1.8,0,6.28);ctx.fillStyle='rgba(150,70,240,'+0.22*appear+')';ctx.fill();
      ctx.beginPath();ctx.arc(sx,sy,sr,0,6.28);ctx.fillStyle='rgba(196,132,252,'+0.6*appear+')';ctx.fill();
    }
  }

  function drawNebula(t,fade){
    if(!nebBuf)return;
    ctx.globalAlpha=clamp(fade*(0.84+Math.sin(t*0.6)*0.16),0,1);
    ctx.drawImage(nebBuf,0,0,W,H);ctx.globalAlpha=1;
  }

  function drawStars(t,fade){
    if(!starSprite)return;
    for(var i=0;i<stars.length;i++){
      var s=stars[i],vis=clamp((t-s.delay)/1.4,0,1);
      var tw=(0.5+Math.sin(t*s.sp+s.ph)*0.5)*vis*fade;
      if(tw<0.02)continue;
      var sz=s.r*8;ctx.globalAlpha=tw;
      ctx.drawImage(starSprite,s.x*W-sz/2,s.y*H-sz/2,sz,sz);
    }
    ctx.globalAlpha=1;
  }

  function drawMotes(t,fade){
    for(var i=0;i<motes.length;i++){
      var p=motes[i];
      p.y-=p.sp*0.012;p.x+=p.drift;
      if(p.y<-0.05){p.y=1.05;p.x=Math.random();}
      var tw=(0.4+Math.sin(t*0.8+p.ph)*0.6)*fade;
      ctx.beginPath();ctx.arc(p.x*W,p.y*H,p.r,0,6.28);
      ctx.fillStyle='rgba(180,120,255,'+tw*0.35+')';ctx.fill();
    }
  }

  function frame(ts){
    if(lastTs===null)lastTs=ts;
    var dt=Math.min((ts-lastTs)/1000,0.05);lastTs=ts;elapsed+=dt;
    var t=elapsed,fade=clamp(t/1.3,0,1);
    ctx.clearRect(0,0,W,H);
    drawNebula(t,fade);drawStars(t,fade);
    for(var i=0;i<ANCHORS.length;i++){
      var raw=clamp((t-0.12*i)/1.5,0,1);
      drawTentacle(t,ANCHORS[i],resolved[i],eoc(raw));
    }
    drawMotes(t,fade);
    if(running)rafId=requestAnimationFrame(frame);
  }

  function startLoop(){if(running&&rafId!==null)return;running=true;lastTs=null;rafId=requestAnimationFrame(frame);}
  function stopLoop(){running=false;if(rafId!==null){cancelAnimationFrame(rafId);rafId=null;}}

  seed();resize();startLoop();
  window.addEventListener('resize',resize);
  document.addEventListener('visibilitychange',function(){if(document.hidden)stopLoop();else startLoop();});
})();
</script>
</body>
</html>`;

// ── Componente React Native ──────────────────────────────────────────────────

export default function AnimatedSplash({ ready, onFinish }: { ready: boolean; onFinish: () => void }) {
  const rootOpacity = useRef(new Animated.Value(1)).current;
  const logoScale   = useRef(new Animated.Value(0.62)).current;
  const glowOp      = useRef(new Animated.Value(0.6)).current;
  const glowSize    = useRef(new Animated.Value(0.97)).current;
  const dotsOp      = useRef(new Animated.Value(0)).current;
  const d1 = useRef(new Animated.Value(0)).current;
  const d2 = useRef(new Animated.Value(0)).current;
  const d3 = useRef(new Animated.Value(0)).current;
  const mountTs = useRef(Date.now());
  const doneRef = useRef(false);

  useEffect(() => {
    // Logo entrance: scale .62 → 1 in 1.25 s (delay 0.9 s — espera os tentáculos crescerem)
    Animated.timing(logoScale, {
      toValue: 1, duration: 1250, delay: 900,
      easing: Easing.out(Easing.cubic), useNativeDriver: true,
    }).start();

    // Glow pulse loop
    const glowLoop = Animated.loop(Animated.sequence([
      Animated.parallel([
        Animated.timing(glowOp,   { toValue: 1,    duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(glowSize, { toValue: 1.06, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(glowOp,   { toValue: 0.6,  duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(glowSize, { toValue: 0.97, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    ]));
    glowLoop.start();

    // Dots: fade in at 1.8 s (logo já apareceu), bounce escalonado
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

    return () => { glowLoop.stop(); clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []); // eslint-disable-line

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
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

  const glowOuterOp = glowOp.interpolate({ inputRange: [0.6, 1], outputRange: [0.18, 0.30] });
  const glowInnerOp = glowOp.interpolate({ inputRange: [0.6, 1], outputRange: [0.33, 0.55] });

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, { opacity: rootOpacity }]} pointerEvents="none">
      {/* Camada 1: canvas animation (tentáculos, nebulosa, estrelas) */}
      <WebView
        source={{ html: CANVAS_HTML }}
        style={StyleSheet.absoluteFill}
        scrollEnabled={false}
        javaScriptEnabled
        originWhitelist={['*']}
        backgroundColor="#06030d"
        // Sem cabeçalho nem barra de status
        scalesPageToFit={false}
        bounces={false}
        overScrollMode="never"
      />

      {/* Camada 2: logo + glow + dots em React Native */}
      <View style={styles.overlay} pointerEvents="none">
        <Animated.View style={[styles.glowOuter, { opacity: glowOuterOp, transform: [{ scale: glowSize }] }]} />
        <Animated.View style={[styles.glowInner, { opacity: glowInnerOp, transform: [{ scale: glowSize }] }]} />
        <Animated.View style={{ transform: [{ scale: logoScale }] }}>
          <Image source={require('../../assets/icon.png')} style={styles.logo} resizeMode="contain" />
        </Animated.View>
        <Animated.View style={[styles.dots, { opacity: dotsOp }]}>
          <Animated.View style={[styles.dot, { transform: [{ translateY: d1 }] }]} />
          <Animated.View style={[styles.dot, { transform: [{ translateY: d2 }] }]} />
          <Animated.View style={[styles.dot, { transform: [{ translateY: d3 }] }]} />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#06030d', zIndex: 1000, elevation: 1000 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: { width: 140, height: 140, borderRadius: 28 },
  glowOuter: {
    position: 'absolute',
    width: 400, height: 400, borderRadius: 200,
    backgroundColor: '#3c1280',
  },
  glowInner: {
    position: 'absolute',
    width: 220, height: 220, borderRadius: 110,
    backgroundColor: '#601eb4',
  },
  dots: { flexDirection: 'row', gap: 14, marginTop: 32 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#a25cf0' },
});
