import React, { useRef, useEffect } from 'react';
import { Animated } from 'react-native';
import { colors } from '../utils/theme';
import { useReducedMotion } from '../utils/reducedMotion';

interface Props {
  size?: number;
  color?: string;
}

export default function PulsingDot({ size = 6, color = colors.live }: Props) {
  const reducedMotion = useReducedMotion();
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reducedMotion) {
      anim.setValue(1); // dot estático — a cor já comunica "ao vivo"
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.3, duration: 600, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 1,   duration: 600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim, reducedMotion]);
  return (
    <Animated.View
      style={{
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: color, opacity: anim,
      }}
    />
  );
}
