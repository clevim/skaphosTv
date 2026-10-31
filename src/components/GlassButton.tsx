// GlassButton.tsx — Frosted-glass button
// Web: real backdropFilter blur via style prop
// Native: simulated with semi-transparent bg + border
import React, { useState } from 'react';
import { Text, StyleSheet, ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import TVFocusable from './TVFocusable';
import { colors, radius } from '../utils/theme';
import { IS_WEB } from '../utils/tvDetect';
import { useAccentColors } from '../hooks/useAccentColors';

interface Props {
  icon: string;
  label: string;
  onPress?: () => void;
  style?: ViewStyle;
  /** Ação principal: preenchida com o acento. O foco é sempre o neutro do TVFocusable. */
  primary?: boolean;
}

export default function GlassButton({ icon, label, onPress, style, primary }: Props) {
  const [focused, setFocused] = useState(false);
  const { accent3 } = useAccentColors();
  // Foco não troca a cor (era "fica violeta" — destoava do anel neutro do resto do app).
  const strong = primary;
  const bright = primary || focused;
  const glassStyle: ViewStyle = IS_WEB
    ? ({
        // @ts-ignore — backdropFilter is web-only
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        backgroundColor: 'rgba(255,255,255,0.07)',
        borderColor: 'rgba(255,255,255,0.12)',
      } as ViewStyle)
    : {
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderColor: colors.border,
      };

  return (
    <TVFocusable
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[styles.btn, glassStyle, strong && { backgroundColor: accent3, borderColor: accent3 }, style]}
    >
      <Ionicons name={icon as any} size={18} color={bright ? colors.white : colors.text2} />
      <Text style={[styles.label, bright && { color: colors.white }]}>{label}</Text>
    </TVFocusable>
  );
}

const styles = StyleSheet.create({
  btn: {
    flex: 1,
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  label: {
    fontSize: 10,
    fontWeight: '500',
    color: colors.text2,
  },
});
