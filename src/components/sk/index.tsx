/**
 * Primitivos tipográficos do app (título de seção, rótulo, medidor).
 * Quietos de propósito: Geist, sem mono, sem brilho, sem animação.
 */
import React, { memo } from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { colors, fontFamily } from '../../utils/theme';
import { useAccentColors } from '../../hooks/useAccentColors';

// Seletor narrow (string primitiva): re-render só quando a cor muda, seguro em célula de lista.
const usePrimary = () => useAccentColors().accent;

// ── SkSectionHeader ────────────────────────────────────────────
// Só o título, em sentence case. O tick de acento + fio que existiam aqui eram
// enfeite repetido em toda seção do app (cara de template); a hierarquia vem do
// peso e do respiro, não de ornamento.
export const SkSectionHeader = memo(function SkSectionHeader({ title }: { title: string }) {
  const label = title ? title[0].toUpperCase() + title.slice(1) : title;
  return <Text style={s.shName} numberOfLines={1}>{label}</Text>;
});

// ── SkChip ─────────────────────────────────────────────────────
// Quieto por padrão: rótulo em Geist, sem borda/fundo/brilho. Só "live" vira
// pílula sólida (convenção de streaming: AO VIVO vermelho) — o resto é texto.
export type SkChipVariant = 'live' | 'ok' | 'warn' | 'accent';
const CHIP: Record<SkChipVariant, string> = {
  live: colors.live, ok: colors.text2, warn: colors.yellow, accent: colors.text2,
};
export const SkChip = memo(function SkChip({ label, variant = 'accent', style }: {
  label: string; variant?: SkChipVariant; /** legado: ignorado */ dot?: boolean; style?: StyleProp<ViewStyle>;
}) {
  if (variant === 'live') {
    return (
      <View style={[s.chipLive, style]}>
        <Text style={s.chipLiveText} numberOfLines={1}>{label}</Text>
      </View>
    );
  }
  return <Text style={[s.chipText, { color: CHIP[variant] }, style as any]} numberOfLines={1}>{label}</Text>;
});

// ── SkMeter ────────────────────────────────────────────────────
export const SkMeter = memo(function SkMeter({ label, value, valueText, style }: {
  label: string; /** 0..1 */ value: number; valueText?: string; style?: StyleProp<ViewStyle>;
}) {
  const v = Math.max(0, Math.min(1, value || 0));
  const primary = usePrimary();
  return (
    <View style={[s.meter, style]}>
      <View style={s.meterTrack}><View style={[s.meterFill, { width: `${v * 100}%`, backgroundColor: primary }]} /></View>
      <Text style={s.meterValue} numberOfLines={1}>{valueText ?? `${Math.round(v * 100)}%`}</Text>
    </View>
  );
});

// ── SkDecodeText ───────────────────────────────────────────────
// Era um "scramble" de glifos no mount (efeito terminal). Agora é texto puro —
// mantém a API pros callers. ponytail: remover o wrapper se ninguém mais usar.
export const SkDecodeText = memo(function SkDecodeText({ text, style, numberOfLines }: {
  text: string; style?: StyleProp<any>; numberOfLines?: number;
}) {
  return <Text style={style} numberOfLines={numberOfLines}>{text}</Text>;
});

const s = StyleSheet.create({
  shName: { fontFamily: fontFamily.semiBold, fontSize: 19, color: colors.text1, letterSpacing: -0.3, flexShrink: 1 },
  chipLive: {
    alignSelf: 'flex-start', backgroundColor: colors.live,
    borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2,
  },
  chipLiveText: { fontFamily: fontFamily.semiBold, fontSize: 10, color: colors.white, letterSpacing: 0.4 },
  chipText: { fontFamily: fontFamily.medium, fontSize: 12, letterSpacing: 0.2 },
  meter: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  meterTrack: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden' },
  meterFill: { height: 3 },
  meterValue: { fontFamily: fontFamily.medium, fontSize: 12, color: colors.text2, fontVariant: ['tabular-nums'] },
});
