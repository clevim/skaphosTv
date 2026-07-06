// SleepTimerSheet.tsx — dial radial (1min–4h): arraste no anel (touch) ou use
// os botões +/- (D-pad/TV). Substitui a lista fixa de presets antiga.
import React, { useRef, useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, PanResponder, GestureResponderEvent, ScrollView, useWindowDimensions } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import TVFocusable from './TVFocusable';
import { colors, radius, fontFamily } from '../utils/theme';

interface Props {
  visible: boolean;
  selectedMinutes: number | null;
  onSelect: (minutes: number | null) => void;
  onClose: () => void;
}

const MAX_MINUTES = 240;
// Passos finos no começo (1 min) e cada vez mais largos — cobre 1min–4h sem
// travar em 4 valores fixos, mas mantendo um nº razoável de passos pro D-pad.
const STEPS: number[] = [
  ...Array.from({ length: 10 }, (_, i) => i + 1),        // 1..10
  ...Array.from({ length: 10 }, (_, i) => 15 + i * 5),    // 15..60
  ...Array.from({ length: 12 }, (_, i) => 75 + i * 15),   // 75..240
];

function nearestStep(minutes: number): number {
  return STEPS.reduce((best, s) => (Math.abs(s - minutes) < Math.abs(best - minutes) ? s : best), STEPS[0]);
}

function formatDuration(m: number): string {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}h` : `${h}h${String(rem).padStart(2, '0')}`;
}

const STROKE = 14;

export default function SleepTimerSheet({ visible, selectedMinutes, onSelect, onClose }: Props) {
  const { width, height } = useWindowDimensions();
  const active = selectedMinutes !== null;
  const [draft, setDraft] = useState(selectedMinutes ?? 30);
  const dialRef = useRef<View>(null);
  const centerPos = useRef({ x: 0, y: 0 });

  // Dial some pra caber na tela — o player fica sempre em landscape, então a
  // ALTURA (não a largura) é o fator apertado; o resto do sheet (header, botões
  // +/-, ações) tem altura fixa de ~208px, o que sobra vira o tamanho do dial.
  const SIZE = Math.round(Math.max(130, Math.min(220, height * 0.92 - 208, width * 0.36)));
  const R = (SIZE - STROKE) / 2;
  const CIRC = 2 * Math.PI * R;
  const CENTER = SIZE / 2;

  useEffect(() => {
    if (visible) setDraft(selectedMinutes ?? 30);
  }, [visible, selectedMinutes]);

  const angleToMinutes = useCallback((x: number, y: number) => {
    const dx = x - centerPos.current.x;
    const dy = y - centerPos.current.y;
    let deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90; // 0° = topo
    if (deg < 0) deg += 360;
    return nearestStep(Math.max(1, Math.round((deg / 360) * MAX_MINUTES)));
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e: GestureResponderEvent) => setDraft(angleToMinutes(e.nativeEvent.pageX, e.nativeEvent.pageY)),
      onPanResponderMove: (e: GestureResponderEvent) => setDraft(angleToMinutes(e.nativeEvent.pageX, e.nativeEvent.pageY)),
    })
  ).current;

  const step = useCallback((dir: 1 | -1) => {
    setDraft(d => {
      const idx = STEPS.indexOf(nearestStep(d));
      return STEPS[Math.max(0, Math.min(STEPS.length - 1, idx + dir))];
    });
  }, []);

  if (!visible) return null;

  const pct = Math.min(1, draft / MAX_MINUTES);

  return (
    <View style={styles.root} pointerEvents="box-none">
      <View style={StyleSheet.absoluteFillObject} onTouchEnd={onClose} {...({ focusable: false } as any)} />
      {/* maxHeight + ScrollView: rede de segurança pra telas bem baixas (landscape
          em celulares pequenos) — o dial já encolhe sozinho (SIZE acima), isto aqui
          só garante que nada fique inalcançável se ainda assim não couber. */}
      <View style={[styles.sheet, { width: SIZE + 60, maxHeight: height * 0.94 }]}>
        <ScrollView contentContainerStyle={styles.sheetInner} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Ionicons name="moon-outline" size={18} color={colors.accent} />
            <Text style={styles.title}>Temporizador</Text>
          </View>

          <View
            ref={dialRef}
            style={[styles.dialWrap, { width: SIZE, height: SIZE }]}
            onLayout={() => {
              dialRef.current?.measureInWindow((x, y, w, h) => {
                centerPos.current = { x: x + w / 2, y: y + h / 2 };
              });
            }}
            {...panResponder.panHandlers}
          >
            <Svg width={SIZE} height={SIZE}>
              <Circle cx={CENTER} cy={CENTER} r={R} stroke={colors.borderSoft} strokeWidth={STROKE} fill="none" />
              <Circle
                cx={CENTER} cy={CENTER} r={R}
                stroke={colors.accent} strokeWidth={STROKE} fill="none"
                strokeDasharray={`${CIRC} ${CIRC}`}
                strokeDashoffset={CIRC * (1 - pct)}
                strokeLinecap="round"
                rotation={-90}
                origin={`${CENTER}, ${CENTER}`}
              />
            </Svg>
            <View style={styles.dialCenter} pointerEvents="none">
              <Text style={[styles.dialValue, { fontSize: Math.round(SIZE * 0.145) }]}>{formatDuration(draft)}</Text>
            </View>
          </View>

          <View style={styles.stepRow}>
            <TVFocusable onPress={() => step(-1)} style={styles.stepBtn} borderRadius={20}>
              <Ionicons name="remove" size={20} color={colors.white} />
            </TVFocusable>
            <TVFocusable
              onPress={() => { onSelect(draft); onClose(); }}
              style={styles.confirmBtn}
              hasTVPreferredFocus
              borderRadius={radius.md}
            >
              <Text style={styles.confirmText}>{active ? 'Atualizar' : 'Ativar'}</Text>
            </TVFocusable>
            <TVFocusable onPress={() => step(1)} style={styles.stepBtn} borderRadius={20}>
              <Ionicons name="add" size={20} color={colors.white} />
            </TVFocusable>
          </View>

          <View style={styles.actions}>
            {active && (
              <TVFocusable onPress={() => { onSelect(null); onClose(); }} style={styles.disableBtn} borderRadius={radius.md}>
                <Text style={styles.disableText}>Desativar</Text>
              </TVFocusable>
            )}
            <TVFocusable onPress={onClose} style={styles.closeBtn} borderRadius={radius.md}>
              <Text style={styles.closeText}>Fechar</Text>
            </TVFocusable>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  sheet: {
    backgroundColor: colors.bg1,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  sheetInner: { alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    alignSelf: 'stretch',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: colors.borderSoft,
  },
  title: { fontSize: 15, fontFamily: fontFamily.semiBold, color: colors.text1 },
  dialWrap: {
    marginTop: 24,
    alignItems: 'center', justifyContent: 'center',
  },
  dialCenter: { position: 'absolute', alignItems: 'center' },
  dialValue: { fontSize: 32, fontFamily: fontFamily.semiBold, color: colors.text1 },
  stepRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    marginTop: 22,
  },
  stepBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  confirmBtn: {
    minWidth: 120, height: 40, borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 16,
  },
  confirmText: { fontSize: 13, fontWeight: '700', color: colors.textInverse },
  actions: { flexDirection: 'row', gap: 10, padding: 16, alignSelf: 'stretch' },
  disableBtn: {
    flex: 1, height: 40, borderRadius: radius.md,
    backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  disableText: { fontSize: 13, fontWeight: '500', color: colors.text2 },
  closeBtn: {
    flex: 1, height: 40, borderRadius: radius.md,
    backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  closeText: { fontSize: 13, fontWeight: '500', color: colors.text2 },
});
