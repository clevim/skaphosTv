/**
 * AnimatedSplash — porte 1:1 do protótipo entrance-animation.html (projeto
 * Claude Design "SkaphosTV"), seguindo porting-react-native.md do mesmo projeto.
 *
 * UMA implementação (react-native-svg + reanimated) para Android, TV e web —
 * substitui o par WebView/canvas (nativo) + canvas DOM (.web.tsx) antigos.
 *
 * Camadas (mesma ordem do protótipo):
 *   fundo radial → nebulosa → estrelas/motes → vignette → tentáculos →
 *   burst → anéis → logo (glow + sheen + dots)
 *
 * Geometria dos tentáculos: PRÉ-COMPUTADA em src/generated/tentaclePaths.ts
 * (scripts/gen-tentacle-paths.js) — validada byte a byte contra o protótipo.
 *
 * ⚠️ REGRA DO RIG (scripts/tentacle-generator.js, Históricos #1/#2): cada
 * tentáculo é UMA peça, e as 4 camadas de transform (grow → sway → sway2 →
 * breathe) pivotam TODAS no mesmo ponto (ax,ay). Nunca dividir a peça nem
 * criar um segundo pivô "no meio" — sempre abre fresta na costura.
 *
 * ponytail: divergências deliberadas do protótipo (invisíveis na prática):
 *  - sem blur(3.5px) nos limbs de fundo (RNSVG sem filter nativo) — palete
 *    escura + vignette disfarçam; upgrade: react-native-skia.
 *  - vortex-sheen: conic-gradient → 3 arcos SVG girando (RN sem conic).
 *  - glow do logo: splash-glow.png pré-renderizado (mesmo visual, mais barato).
 *  - drift horizontal dos motes omitido (±2%/s — imperceptível na splash).
 */
import React, { memo, useEffect, useMemo, useRef } from 'react';
import {
  Animated as RNAnimated, Easing as RNEasing,
  Image, StyleSheet, View, useWindowDimensions,
} from 'react-native';
import Svg, {
  Circle, Defs, Ellipse, G, Path, RadialGradient, Rect, Stop,
} from 'react-native-svg';
import Animated, {
  Easing, useAnimatedProps, useSharedValue,
  withDelay, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import { HERO_LIMBS, BG_LIMBS, TentacleAnim, HeroGeo, BgGeo } from '../generated/tentaclePaths';
import { IS_NATIVE_TV } from '../utils/tvDetect';

const MIN_VISIBLE_MS = 2400;

// Palete do protótipo (custom properties do <style>)
const C = {
  tentFill: '#0a0714',
  tentLine: '#5b3f86',
  tentRim: '#6f4ea3',
  tentBright: '#9163cf',
  tentBgFill: '#180f30',
  purpleBright: '#a25cf0',
};

const AG = Animated.createAnimatedComponent(G);
const ACircle = Animated.createAnimatedComponent(Circle);

// Easings dos keyframes CSS
const GROW_EASE = Easing.bezier(0.19, 0.79, 0.28, 1);
const EASE = Easing.inOut(Easing.ease); // "ease-in-out" do CSS
const POP_EASE_RN = RNEasing.bezier(0.16, 0.84, 0.34, 1); // burst + logo-in
const RING_EASE_RN = RNEasing.bezier(0.18, 0.7, 0.3, 1);

// ── Rig de 3 camadas + grow — mesmos keyframes do CSS, em withSequence ──────
function useLimbRig(anim: TentacleAnim, growDurMs: number) {
  const grow = useSharedValue(0.08);
  const growOp = useSharedValue(0);
  const sway = useSharedValue(-anim.sway);  // sway-kf 0%: -sway
  const sway2 = useSharedValue(anim.sway2); // sway2-kf 0%: +sway2
  const breathe = useSharedValue(1);

  useEffect(() => {
    const d = anim.delay * 1000;
    // grow-kf: scale .08→1 (segmento único) e opacity 0→1 aos 20%
    grow.value = withDelay(d, withTiming(1, { duration: growDurMs, easing: GROW_EASE }));
    growOp.value = withDelay(d, withTiming(1, { duration: growDurMs * 0.2, easing: GROW_EASE }));
    // sway-kf: 0% -s · 45% .65s · 72% s · 100% -s (paradas assimétricas)
    sway.value = withDelay(anim.swayDelay * 1000, withRepeat(withSequence(
      withTiming(anim.sway * 0.65, { duration: anim.swayDur * 450, easing: EASE }),
      withTiming(anim.sway, { duration: anim.swayDur * 270, easing: EASE }),
      withTiming(-anim.sway, { duration: anim.swayDur * 280, easing: EASE }),
    ), -1, false));
    // sway2-kf: 0% s2 · 38% -.7s2 · 64% -s2 · 85% .4s2 · 100% s2
    sway2.value = withDelay(anim.sway2Delay * 1000, withRepeat(withSequence(
      withTiming(-anim.sway2 * 0.7, { duration: anim.sway2Dur * 380, easing: EASE }),
      withTiming(-anim.sway2, { duration: anim.sway2Dur * 260, easing: EASE }),
      withTiming(anim.sway2 * 0.4, { duration: anim.sway2Dur * 210, easing: EASE }),
      withTiming(anim.sway2, { duration: anim.sway2Dur * 150, easing: EASE }),
    ), -1, false));
    // breathe-kf: 1 ↔ 1+breathe
    breathe.value = withDelay(anim.breatheDelay * 1000, withRepeat(withSequence(
      withTiming(1 + anim.breathe, { duration: anim.breatheDur * 500, easing: EASE }),
      withTiming(1, { duration: anim.breatheDur * 500, easing: EASE }),
    ), -1, false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // rotation/scale + origin do react-native-svg = pivô explícito (ax,ay) —
  // o equivalente nativo do transform-box/transform-origin do CSS.
  const growProps = useAnimatedProps(() => ({ opacity: growOp.value, scale: grow.value } as any));
  const swayProps = useAnimatedProps(() => ({ rotation: sway.value } as any));
  const sway2Props = useAnimatedProps(() => ({ rotation: sway2.value } as any));
  const breatheProps = useAnimatedProps(() => ({ scale: breathe.value } as any));
  return { growProps, swayProps, sway2Props, breatheProps };
}

const HeroLimb = memo(function HeroLimb({ anim, geo }: { anim: TentacleAnim; geo: HeroGeo }) {
  const { growProps, swayProps, sway2Props, breatheProps } = useLimbRig(anim, 1700);
  const origin = `${anim.ax}, ${anim.ay}`;
  return (
    <AG animatedProps={growProps} origin={origin}>
      <AG animatedProps={swayProps} origin={origin}>
        <AG animatedProps={sway2Props} origin={origin}>
          <AG animatedProps={breatheProps} origin={origin}>
            <Path d={geo.fill} fill={C.tentFill} />
            <Path d={geo.edge} fill="none" stroke={C.tentLine} strokeWidth={4} strokeLinejoin="round" />
            <Path d={geo.rim} fill={C.tentRim} opacity={0.3} />
            <Path d={geo.bright} fill={C.tentBright} opacity={0.17} />
            {geo.suckers.map((s, i) => (
              <Ellipse
                key={i} cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry}
                fill={C.tentFill} stroke={C.tentLine} strokeWidth={2} opacity={0.9}
                rotation={s.rot} origin={`${s.cx}, ${s.cy}`}
              />
            ))}
            <Circle
              cx={geo.tipCap.cx} cy={geo.tipCap.cy} r={geo.tipCap.r}
              fill={C.tentFill} stroke={C.tentLine} strokeWidth={3.5}
            />
          </AG>
        </AG>
      </AG>
    </AG>
  );
});

const BgLimb = memo(function BgLimb({ anim, geo }: { anim: TentacleAnim; geo: BgGeo }) {
  const { growProps, swayProps, sway2Props, breatheProps } = useLimbRig(anim, 2100);
  const origin = `${anim.ax}, ${anim.ay}`;
  return (
    <AG animatedProps={growProps} origin={origin}>
      <AG animatedProps={swayProps} origin={origin}>
        <AG animatedProps={sway2Props} origin={origin}>
          <AG animatedProps={breatheProps} origin={origin}>
            <Path d={geo.fill} fill={C.tentBgFill} opacity={0.8} />
            <Path d={geo.rim} fill={C.tentRim} opacity={0.22} />
          </AG>
        </AG>
      </AG>
    </AG>
  );
});

// ── Estrelas + motes (o canvas do protótipo, em SVG animado) ────────────────
const Star = memo(function Star({ cx, cy, r, appearMs, twinkleMs }: {
  cx: number; cy: number; r: number; appearMs: number; twinkleMs: number;
}) {
  const o = useSharedValue(0);
  useEffect(() => {
    o.value = withDelay(appearMs, withRepeat(withSequence(
      withTiming(1, { duration: twinkleMs / 2, easing: EASE }),
      withTiming(0, { duration: twinkleMs / 2, easing: EASE }),
    ), -1, false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const p = useAnimatedProps(() => ({ opacity: o.value }));
  return <ACircle animatedProps={p} cx={cx} cy={cy} r={r} fill="url(#skStar)" />;
});

const Mote = memo(function Mote({ x, y0, r, speed, h }: {
  x: number; y0: number; r: number; speed: number; h: number;
}) {
  const cy = useSharedValue(y0);
  const o = useSharedValue(0.12);
  useEffect(() => {
    const top = -0.05 * h, bottom = 1.05 * h;
    const pxPerMs = (speed * h) / 1000;
    cy.value = withSequence(
      withTiming(top, { duration: Math.max(1, (y0 - top) / pxPerMs), easing: Easing.linear }),
      withRepeat(withSequence(
        withTiming(bottom, { duration: 1 }),
        withTiming(top, { duration: (bottom - top) / pxPerMs, easing: Easing.linear }),
      ), -1, false),
    );
    o.value = withRepeat(withSequence(
      withTiming(0.35, { duration: 3900, easing: EASE }),
      withTiming(0.12, { duration: 3900, easing: EASE }),
    ), -1, false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const p = useAnimatedProps(() => ({ cy: cy.value, opacity: o.value }));
  return <ACircle animatedProps={p} cx={x} r={r} fill="#b478ff" />;
});

/** Nebulosa: 2 gradientes radiais com fade-in (1.3s) e pulso lento (~10.5s). */
function Nebula({ w, h }: { w: number; h: number }) {
  const fade = useSharedValue(0);
  const pulse = useSharedValue(1);
  useEffect(() => {
    fade.value = withTiming(1, { duration: 1300, easing: Easing.linear });
    pulse.value = withRepeat(withSequence(
      withTiming(0.68, { duration: 5236, easing: EASE }),
      withTiming(1, { duration: 5236, easing: EASE }),
    ), -1, false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const fadeProps = useAnimatedProps(() => ({ opacity: fade.value }));
  const pulseProps = useAnimatedProps(() => ({ opacity: pulse.value }));
  const md = Math.max(w, h);
  return (
    <AG animatedProps={fadeProps}>
      <AG animatedProps={pulseProps}>
        <Defs>
          {/* raios em px (userSpaceOnUse) para igualar o buffer do protótipo */}
          <RadialGradient id="skNeb1" cx={w * 0.5} cy={h * 0.46} r={md * 0.55} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#601eb4" stopOpacity={0.3} />
            <Stop offset="0.42" stopColor="#3c1280" stopOpacity={0.17} />
            <Stop offset="1" stopColor="#000000" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="skNeb2" cx={w * 0.32} cy={h * 0.36} r={md * 0.3} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#7828d2" stopOpacity={0.14} />
            <Stop offset="1" stopColor="#000000" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={w} height={h} fill="url(#skNeb1)" />
        <Rect x={0} y={0} width={w} height={h} fill="url(#skNeb2)" />
      </AG>
    </AG>
  );
}

// Arco SVG (vortex-sheen — aproximação dos setores do conic-gradient)
function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const rad = (a: number) => ((a - 90) * Math.PI) / 180;
  const x0 = cx + r * Math.cos(rad(a0)), y0 = cy + r * Math.sin(rad(a0));
  const x1 = cx + r * Math.cos(rad(a1)), y1 = cy + r * Math.sin(rad(a1));
  return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}

// ── Splash ───────────────────────────────────────────────────────────────────
export default function AnimatedSplash({ ready, onFinish }: { ready: boolean; onFinish: () => void }) {
  const { width: w, height: h } = useWindowDimensions();
  const vmin = Math.min(w, h);
  const mountTs = useRef(Date.now());

  // ponytail: metade dos pontos animados na TV física (CPU fraca de FireStick);
  // contagens cheias = as do protótipo (110/28).
  const N_STARS = IS_NATIVE_TV ? 56 : 110;
  const N_MOTES = IS_NATIVE_TV ? 14 : 28;

  const stars = useMemo(() =>
    Array.from({ length: N_STARS }, () => ({
      x: Math.random(), y: Math.random(),
      r: 0.4 + Math.random() * 1.7,
      // sp 0.4–2.2 rad/s do protótipo → período 2π/sp; fase vira delay aleatório
      twinkleMs: ((2 * Math.PI) / (0.4 + Math.random() * 1.8)) * 1000,
      appearMs: Math.random() * 1800 + Math.random() * 1400,
    })), [N_STARS]);

  const motes = useMemo(() =>
    Array.from({ length: N_MOTES }, () => ({
      x: Math.random(), y: Math.random(),
      r: 0.8 + Math.random() * 2.2,
      speed: (0.006 + Math.random() * 0.016) * 0.72, // fração da tela por segundo
    })), [N_MOTES]);

  // ── Saída (contrato do App.tsx: ready → espera mínima → fade .55s → onFinish)
  const rootOpacity = useRef(new RNAnimated.Value(1)).current;
  useEffect(() => {
    if (!ready) return;
    const wait = Math.max(0, MIN_VISIBLE_MS - (Date.now() - mountTs.current));
    const t = setTimeout(() => {
      RNAnimated.timing(rootOpacity, { toValue: 0, duration: 550, useNativeDriver: true })
        .start(() => onFinish());
    }, wait);
    return () => clearTimeout(t);
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Burst + anéis + logo + dots (one-shot/loops — RN Animated, native driver)
  const burstScale = useRef(new RNAnimated.Value(1)).current;
  const burstOp = useRef(new RNAnimated.Value(0)).current;
  const rings = useRef([140, 100, 180].map(() => ({
    scale: new RNAnimated.Value(0.4), op: new RNAnimated.Value(0),
  }))).current;

  const logoScale = useRef(new RNAnimated.Value(0.62)).current;
  const logoOp = useRef(new RNAnimated.Value(0)).current;
  const breath = useRef(new RNAnimated.Value(1)).current;
  const glowOp = useRef(new RNAnimated.Value(0.6)).current;
  const glowScale = useRef(new RNAnimated.Value(0.97)).current;
  const sheenSpin = useRef(new RNAnimated.Value(0)).current;
  const dotsOp = useRef(new RNAnimated.Value(0)).current;
  const dots = useRef([0, 1, 2].map(() => new RNAnimated.Value(0))).current;

  useEffect(() => {
    const RING_DELAYS = [150, 420, 700];
    // sk-burst-kf: opacity 0→1(10%)→0; scale 1→16; 1.5s, delay .12s
    RNAnimated.sequence([
      RNAnimated.delay(120),
      RNAnimated.parallel([
        RNAnimated.timing(burstScale, { toValue: 16, duration: 1500, easing: POP_EASE_RN, useNativeDriver: true }),
        RNAnimated.sequence([
          RNAnimated.timing(burstOp, { toValue: 1, duration: 150, useNativeDriver: true }),
          RNAnimated.timing(burstOp, { toValue: 0, duration: 1350, useNativeDriver: true }),
        ]),
      ]),
    ]).start();

    // sk-ring-kf: scale .4→5.2; opacity 0→.85(14%)→0; 2.4s, delays .15/.42/.7
    rings.forEach((ring, i) => {
      RNAnimated.sequence([
        RNAnimated.delay(RING_DELAYS[i]),
        RNAnimated.parallel([
          RNAnimated.timing(ring.scale, { toValue: 5.2, duration: 2400, easing: RING_EASE_RN, useNativeDriver: true }),
          RNAnimated.sequence([
            RNAnimated.timing(ring.op, { toValue: 0.85, duration: 336, useNativeDriver: true }),
            RNAnimated.timing(ring.op, { toValue: 0, duration: 2064, useNativeDriver: true }),
          ]),
        ]),
      ]).start();
    });

    // sk-logo-in: scale .62→1 (1.25s), opacity 1 aos 60%; delay .25s
    RNAnimated.sequence([
      RNAnimated.delay(250),
      RNAnimated.parallel([
        RNAnimated.timing(logoScale, { toValue: 1, duration: 1250, easing: POP_EASE_RN, useNativeDriver: true }),
        RNAnimated.timing(logoOp, { toValue: 1, duration: 750, easing: POP_EASE_RN, useNativeDriver: true }),
      ]),
    ]).start();

    // sk-breath: 1↔1.035, 4.2s, delay inicial 2.2s
    RNAnimated.sequence([
      RNAnimated.delay(2200),
      RNAnimated.loop(RNAnimated.sequence([
        RNAnimated.timing(breath, { toValue: 1.035, duration: 2100, easing: RNEasing.inOut(RNEasing.ease), useNativeDriver: true }),
        RNAnimated.timing(breath, { toValue: 1, duration: 2100, easing: RNEasing.inOut(RNEasing.ease), useNativeDriver: true }),
      ])),
    ]).start();

    // sk-glow-pulse: opacity .6↔1 + scale .97↔1.05, 3.6s
    RNAnimated.loop(RNAnimated.parallel([
      RNAnimated.sequence([
        RNAnimated.timing(glowOp, { toValue: 1, duration: 1800, easing: RNEasing.inOut(RNEasing.ease), useNativeDriver: true }),
        RNAnimated.timing(glowOp, { toValue: 0.6, duration: 1800, easing: RNEasing.inOut(RNEasing.ease), useNativeDriver: true }),
      ]),
      RNAnimated.sequence([
        RNAnimated.timing(glowScale, { toValue: 1.05, duration: 1800, easing: RNEasing.inOut(RNEasing.ease), useNativeDriver: true }),
        RNAnimated.timing(glowScale, { toValue: 0.97, duration: 1800, easing: RNEasing.inOut(RNEasing.ease), useNativeDriver: true }),
      ]),
    ])).start();

    // sk-vortex-spin: 360° em 10s, linear
    RNAnimated.loop(RNAnimated.timing(sheenSpin, {
      toValue: 1, duration: 10000, easing: RNEasing.linear, useNativeDriver: true,
    })).start();

    // dots: fade-in .8s aos 2s; bounce 1.25s (40% no pico), delays .18/.36
    RNAnimated.sequence([
      RNAnimated.delay(2000),
      RNAnimated.timing(dotsOp, { toValue: 1, duration: 800, useNativeDriver: true }),
    ]).start();
    dots.forEach((v, i) => {
      RNAnimated.sequence([
        RNAnimated.delay(i * 180),
        RNAnimated.loop(RNAnimated.sequence([
          RNAnimated.timing(v, { toValue: 1, duration: 500, easing: RNEasing.inOut(RNEasing.ease), useNativeDriver: true }),
          RNAnimated.timing(v, { toValue: 0, duration: 750, easing: RNEasing.inOut(RNEasing.ease), useNativeDriver: true }),
        ])),
      ]).start();
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Medidas responsivas do protótipo (clamp/vmin do CSS → px)
  const logoW = Math.min(600, Math.max(190, 0.46 * vmin));
  const glowSize = logoW * 1.35;
  const sheenSize = logoW * 0.215;
  const burstSize = 0.08 * vmin;
  const dotSize = Math.min(12, Math.max(8, 0.014 * vmin));
  const dotsMarginTop = Math.min(40, Math.max(20, 0.04 * vmin));

  const sheenRotate = sheenSpin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <RNAnimated.View style={[styles.root, { opacity: rootOpacity }]} pointerEvents="none">
      {/* Fundo + nebulosa + estrelas + motes (o "canvas" do protótipo) */}
      <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="skBg" cx={w * 0.5} cy={h * 0.42} r={Math.max(w, h) * 1.2} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#0c0618" />
            <Stop offset="0.6" stopColor="#06030d" />
            <Stop offset="1" stopColor="#030106" />
          </RadialGradient>
          <RadialGradient id="skStar" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#e0c4ff" stopOpacity={1} />
            <Stop offset="0.35" stopColor="#be78ff" stopOpacity={0.55} />
            <Stop offset="1" stopColor="#aa5aff" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={w} height={h} fill="url(#skBg)" />
        <Nebula w={w} h={h} />
        {stars.map((s, i) => (
          <Star key={i} cx={s.x * w} cy={s.y * h} r={s.r * 4} appearMs={s.appearMs} twinkleMs={s.twinkleMs} />
        ))}
        {motes.map((m, i) => (
          <Mote key={i} x={m.x * w} y0={m.y * h} r={m.r} speed={m.speed} h={h} />
        ))}
      </Svg>

      {/* Vignette — entre o fundo e os tentáculos, como no protótipo */}
      <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="skVig" cx={w * 0.5} cy={h * 0.5} rx={w * 0.78} ry={h * 0.74} gradientUnits="userSpaceOnUse">
            <Stop offset="0.3" stopColor="#000000" stopOpacity={0} />
            <Stop offset="1" stopColor="#000000" stopOpacity={0.72} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={w} height={h} fill="url(#skVig)" />
      </Svg>

      {/* Tentáculos — mesmo viewBox + "slice" do protótipo (responsivo idêntico:
          âncoras fora da tela, cluster abraçando o centro em qualquer aspecto) */}
      <Svg
        width={w} height={h} style={StyleSheet.absoluteFill}
        viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice"
      >
        {BG_LIMBS.map((l) => <BgLimb key={l.name} anim={l.anim} geo={l.geo} />)}
        {HERO_LIMBS.map((l) => <HeroLimb key={l.name} anim={l.anim} geo={l.geo} />)}
      </Svg>

      {/* Burst radial + anéis de energia */}
      <View style={styles.center} pointerEvents="none">
        <RNAnimated.View
          style={{
            position: 'absolute', width: burstSize, height: burstSize,
            opacity: burstOp, transform: [{ scale: burstScale }],
          }}
        >
          <Svg width={burstSize} height={burstSize}>
            <Defs>
              <RadialGradient id="skBurst" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor="#e4ccff" stopOpacity={0.95} />
                <Stop offset="0.32" stopColor="#a860f5" stopOpacity={0.55} />
                <Stop offset="0.58" stopColor="#7c33d6" stopOpacity={0.22} />
                <Stop offset="0.72" stopColor="#7c33d6" stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={burstSize / 2} cy={burstSize / 2} r={burstSize / 2} fill="url(#skBurst)" />
          </Svg>
        </RNAnimated.View>
        {rings.map((ring, i) => {
          const rs = [140, 100, 180][i];
          return (
            <RNAnimated.View
              key={i}
              style={{
                position: 'absolute', width: rs, height: rs, borderRadius: rs / 2,
                borderWidth: 1.5, borderColor: 'rgba(190,150,255,0.6)',
                opacity: ring.op, transform: [{ scale: ring.scale }],
              }}
            />
          );
        })}
      </View>

      {/* Logo + glow + sheen do vórtice + dots */}
      <View style={styles.center} pointerEvents="none">
        <RNAnimated.View style={{ alignItems: 'center', opacity: logoOp, transform: [{ scale: logoScale }] }}>
          <RNAnimated.View style={{ width: logoW, height: logoW, transform: [{ scale: breath }] }}>
            <RNAnimated.View
              style={{
                position: 'absolute',
                left: logoW / 2 - glowSize / 2, top: logoW * 0.48 - glowSize / 2,
                width: glowSize, height: glowSize,
                opacity: glowOp, transform: [{ scale: glowScale }],
              }}
            >
              <Image
                source={require('../../assets/splash-glow.png')}
                style={{ width: glowSize, height: glowSize }}
                resizeMode="contain"
              />
            </RNAnimated.View>
            <Image
              source={require('../../assets/adaptive-icon.png')}
              style={{ width: logoW, height: logoW }}
              resizeMode="contain"
            />
            {/* Sheen girando sobre a escotilha da marca (49.6%, 41.5%, 21.5%) */}
            <RNAnimated.View
              style={{
                position: 'absolute',
                left: logoW * 0.496 - sheenSize / 2, top: logoW * 0.415 - sheenSize / 2,
                width: sheenSize, height: sheenSize,
                opacity: 0.6, transform: [{ rotate: sheenRotate }],
              }}
            >
              <Svg width={sheenSize} height={sheenSize} viewBox="0 0 100 100">
                <Path d={arcPath(50, 50, 30, 10, 108)} stroke="rgba(220,190,255,0.6)" strokeWidth={38} fill="none" strokeLinecap="round" />
                <Path d={arcPath(50, 50, 30, 160, 250)} stroke="rgba(220,190,255,0.38)" strokeWidth={38} fill="none" strokeLinecap="round" />
                <Path d={arcPath(50, 50, 30, 290, 350)} stroke="rgba(220,190,255,0.5)" strokeWidth={38} fill="none" strokeLinecap="round" />
              </Svg>
            </RNAnimated.View>
          </RNAnimated.View>
          <RNAnimated.View style={{ flexDirection: 'row', gap: 14, marginTop: dotsMarginTop, opacity: dotsOp }}>
            {dots.map((v, i) => (
              <RNAnimated.View
                key={i}
                style={{
                  width: dotSize, height: dotSize, borderRadius: dotSize / 2,
                  backgroundColor: C.purpleBright,
                  opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }),
                  transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -7] }) }],
                }}
              />
            ))}
          </RNAnimated.View>
        </RNAnimated.View>
      </View>
    </RNAnimated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#030106',
    zIndex: 9999,
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
