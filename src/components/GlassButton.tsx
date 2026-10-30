// GlassButton.tsx — Frosted-glass button
// Web: real backdropFilter blur via style prop
// Native: simulated with semi-transparent bg + border
import React, { useState } from 'react';
import { Text, StyleSheet, ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import TVFocusable from './TVFocusable';
import { colors, radius } from '../utils/theme';
import { IS_WEB } from '../utils/tvDetect';

interface Props {
  icon: string;
  label: string;
  onPress?: () => void;
  style?: ViewStyle;
  /** Ação principal: violeta mesmo em repouso. Focado é sempre violeta. */
  primary?: boolean;
}

export default function GlassButton({ icon, label, onPress, style, primary }: Props) {
  const [focused, setFocused] = useState(false);
  const violet = primary || focused;
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
      style={[styles.btn, glassStyle, primary && { backgroundColor: colors.accent3, borderColor: colors.accent3 }, style]}
      focusStyle={{ backgroundColor: colors.accent3, borderColor: colors.accent2 }}
    >
      <Ionicons name={icon as any} size={18} color={violet ? '#fff' : colors.text2} />
      <Text style={[styles.label, violet && { color: '#fff' }]}>{label}</Text>
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
