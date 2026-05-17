import React, { useRef, useEffect } from 'react';
import { Animated } from 'react-native';
import { colors } from '../utils/theme';

interface Props {
  size?: number;
  color?: string;
}

export default function PulsingDot({ size = 6, color = colors.live }: Props) {
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.3, duration: 600, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 1,   duration: 600, useNativeDriver: true }),
      ])
    ).start();
  }, [anim]);
  return (
    <Animated.View
      style={{
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: color, opacity: anim,
      }}
    />
  );
}
