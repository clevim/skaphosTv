import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { colors, radius, spacing } from '../utils/theme';

export default function SkeletonCard() {
  const anim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View style={[styles.card, { opacity: anim }]}>
      <View style={styles.logo} />
      <View style={styles.line1} />
      <View style={styles.line2} />
      <View style={styles.badges}>
        <View style={styles.badge} />
        <View style={styles.badge} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bg2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    margin: spacing.xs,
    width: 160,
    height: 160,
    justifyContent: 'space-between',
  },
  logo: { width: 52, height: 52, borderRadius: radius.sm, backgroundColor: colors.bg3 },
  line1: { height: 12, borderRadius: 4, backgroundColor: colors.bg3, width: '80%' },
  line2: { height: 10, borderRadius: 4, backgroundColor: colors.bg3, width: '50%' },
  badges: { flexDirection: 'row', gap: 4 },
  badge: { height: 16, width: 32, borderRadius: 4, backgroundColor: colors.bg3 },
});