/**
 * AnimatedSplash — animação de entrada por cima do app enquanto ele carrega
 * (fontes + dados do cache). Continua a splash nativa (mesmo fundo), faz uma
 * entrada com "pop" + respiração e some suave quando `ready` fica true.
 * Tem duração mínima pra a animação ser sempre percebida.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet, Easing } from 'react-native';

const BG = '#0a0a0f';
const MIN_VISIBLE_MS = 1600; // garante que a animação apareça mesmo se carregar rápido

export default function AnimatedSplash({ ready, onFinish }: { ready: boolean; onFinish: () => void }) {
  const scale = useRef(new Animated.Value(0.7)).current;   // pop de entrada
  const pulse = useRef(new Animated.Value(0)).current;     // respiração (loop)
  const glow = useRef(new Animated.Value(0)).current;      // brilho atrás do logo
  const rootOpacity = useRef(new Animated.Value(1)).current;
  const mountTs = useRef(Date.now());
  const doneRef = useRef(false);

  useEffect(() => {
    // entrada com leve bounce
    Animated.spring(scale, { toValue: 1, friction: 5, tension: 45, useNativeDriver: true }).start();

    // respiração + brilho pulsando (loop contínuo enquanto carrega)
    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(glow, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(glow, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    Animated.timing(rootOpacity, { toValue: 0, duration: 450, useNativeDriver: true }).start(() => onFinish());
  };

  useEffect(() => {
    if (!ready) return;
    const wait = Math.max(0, MIN_VISIBLE_MS - (Date.now() - mountTs.current));
    const t = setTimeout(finish, wait);
    return () => clearTimeout(t);
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // Trava de segurança: nunca fica preso na splash (mesmo se as fontes falharem)
  useEffect(() => {
    const hard = setTimeout(finish, 6000);
    return () => clearTimeout(hard);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.5] });
  const glowScale = glow.interpolate({ inputRange: [0, 1], outputRange: [1.1, 1.45] });

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, { opacity: rootOpacity }]} pointerEvents="none">
      {/* brilho roxo pulsando atrás */}
      <Animated.View style={[styles.glow, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]} />
      <Animated.View style={{ transform: [{ scale: Animated.multiply(scale, pulseScale) }] }}>
        <Image source={require('../../assets/icon.png')} style={styles.logo} resizeMode="contain" />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: BG, alignItems: 'center', justifyContent: 'center', zIndex: 1000, elevation: 1000 },
  logo: { width: 140, height: 140, borderRadius: 30 },
  glow: {
    position: 'absolute',
    width: 240, height: 240, borderRadius: 120,
    backgroundColor: '#7c3aed',
  },
});
