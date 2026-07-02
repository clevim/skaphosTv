// GlassButton.tsx — Frosted-glass button
// Web: real backdropFilter blur via style prop
// Native: simulated with semi-transparent bg + border
import React from 'react';
import { Text, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import TVFocusable from './TVFocusable';
import { colors, radius } from '../utils/theme';
import { IS_WEB } from '../utils/tvDetect';

interface Props {
  icon: string;
  label: string;
  onPress?: () => void;
  style?: ViewStyle;
}

export default function GlassButton({ icon, label, onPress, style }: Props) {
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
    <TVFocusable onPress={onPress} style={[styles.btn, glassStyle, style]}>
      <Ionicons name={icon as any} size={18} color={colors.text2} />
      <Text style={styles.label}>{label}</Text>
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
