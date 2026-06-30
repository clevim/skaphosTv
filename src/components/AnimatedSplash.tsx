import React, { useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet, Easing } from 'react-native';

const MIN_VISIBLE_MS = 1600;

export default function AnimatedSplash({ ready, onFinish }: { ready: boolean; onFinish: () => void }) {
  const rootOpacity = useRef(new Animated.Value(1)).current;
  const logoScale  = useRef(new Animated.Value(0.62)).current;
  const glowOp     = useRef(new Animated.Value(0.6)).current;
  const glowSize   = useRef(new Animated.Value(0.97)).current;
  const dotsOp     = useRef(new Animated.Value(0)).current;
  const d1 = useRef(new Animated.Value(0)).current;
  const d2 = useRef(new Animated.Value(0)).current;
  const d3 = useRef(new Animated.Value(0)).current;
  const mountTs = useRef(Date.now());
  const doneRef = useRef(false);

  useEffect(() => {
    // Logo: scale .62 → 1 in 1.25 s (cubic-out), delay 200 ms
    Animated.timing(logoScale, {
      toValue: 1, duration: 1250, delay: 200,
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

    // Dots: fade in at 1 s, then bounce with stagger
    Animated.timing(dotsOp, { toValue: 1, duration: 800, delay: 1000, useNativeDriver: true }).start();
    const dotLoop = (val: Animated.Value) =>
      Animated.loop(Animated.sequence([
        Animated.timing(val, { toValue: -7, duration: 400, easing: Easing.out(Easing.ease),     useNativeDriver: true }),
        Animated.timing(val, { toValue:  0, duration: 450, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.delay(600),
      ]));
    const t1 = setTimeout(() => dotLoop(d1).start(), 1300);
    const t2 = setTimeout(() => dotLoop(d2).start(), 1480);
    const t3 = setTimeout(() => dotLoop(d3).start(), 1660);

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
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: '#06030d',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    elevation: 1000,
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
