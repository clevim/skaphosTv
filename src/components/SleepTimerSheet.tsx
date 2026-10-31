// SleepTimerSheet.tsx — dial radial (1min–4h): arraste no anel (touch) ou use
// os botões +/- (D-pad/TV). Substitui a lista fixa de presets antiga.
import React, { useRef, useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, PanResponder, GestureResponderEvent, ScrollView, useWindowDimensions } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Ionicons from '@expo/vector-icons/Ionicons';
import TVFocusable from './TVFocusable';
import { colors, radius, fontFamily } from '../utils/theme';
import { sheet, PANEL_W } from './playerSheetStyles';
import { useAccentColors } from '../hooks/useAccentColors';
import { IS_MOBILE } from '../utils/tvDetect';

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
  const ac = useAccentColors();
  const { height } = useWindowDimensions();
  const active = selectedMinutes !== null;
  const [draft, setDraft] = useState(selectedMinutes ?? 30);
  const dialRef = useRef<View>(null);
  const centerPos = useRef({ x: 0, y: 0 });

  // Dial some pra caber na tela — o player fica sempre em landscape, então a
  // ALTURA (não a largura) é o fator apertado; o resto do sheet (header, botões
  // +/-, ações) tem altura fixa de ~228px, o que sobra vira o tamanho do dial.
  // Painel lateral (altura cheia): o dial pode crescer até ~260.
  const SIZE = Math.round(IS_MOBILE
    ? Math.max(110, Math.min(200, height * 0.88 - 250))   // bottom sheet em paisagem: altura é o aperto
    : Math.max(130, Math.min(260, height - 300, PANEL_W - 120)));
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
    <View style={sheet.root} pointerEvents="box-none">
      <View style={StyleSheet.absoluteFillObject} onTouchEnd={onClose} {...({ focusable: false } as any)} />
      <View style={sheet.panel}>
        <ScrollView contentContainerStyle={styles.inner} showsVerticalScrollIndicator={false}>
          <Text style={sheet.title}>Desligar em</Text>
          {/* Contexto do estado atual: sem isto não dava pra saber se já estava ligado */}
          <Text style={styles.status}>{active ? `Ativo · ${formatDuration(selectedMinutes!)}` : 'Desativado'}</Text>

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
              <Circle cx={CENTER} cy={CENTER} r={R} stroke="rgba(255,255,255,0.08)" strokeWidth={STROKE} fill="none" />
              <Circle
                cx={CENTER} cy={CENTER} r={R}
                stroke={ac.accent} strokeWidth={STROKE} fill="none"
                strokeDasharray={`${CIRC} ${CIRC}`}
                strokeDashoffset={CIRC * (1 - pct)}
                strokeLinecap="round"
                rotation={-90}
                origin={`${CENTER}, ${CENTER}`}
              />
            </Svg>
            <View style={styles.dialCenter} pointerEvents="none">
              <Text style={[styles.dialValue, { fontSize: Math.round(SIZE * 0.16) }]}>{formatDuration(draft)}</Text>
            </View>
          </View>

          {/* − [Ativar] +  : ←/→ ajustam a partir do botão central (foco inicial) */}
          <View style={styles.stepRow}>
            <TVFocusable accessibilityLabel="Diminuir tempo" onPress={() => step(-1)} style={styles.stepBtn} borderRadius={24} focusScale={1}>
              <Ionicons name="remove" size={24} color={colors.text1} />
            </TVFocusable>
            <TVFocusable
              onPress={() => { onSelect(draft); onClose(); }}
              style={[styles.confirmBtn, { backgroundColor: ac.accent }]}
              focusStyle={{ backgroundColor: ac.accent2 }}
              hasTVPreferredFocus
              borderRadius={radius.md}
            >
              <Text style={styles.confirmText}>{active ? 'Atualizar' : 'Ativar'}</Text>
            </TVFocusable>
            <TVFocusable accessibilityLabel="Aumentar tempo" onPress={() => step(1)} style={styles.stepBtn} borderRadius={24} focusScale={1}>
              <Ionicons name="add" size={24} color={colors.text1} />
            </TVFocusable>
          </View>

          <View style={styles.actions}>
            {active && (
              <TVFocusable onPress={() => { onSelect(null); onClose(); }} style={sheet.close} focusScale={1}>
                <Text style={sheet.closeText}>Desativar</Text>
              </TVFocusable>
            )}
            <TVFocusable onPress={onClose} style={sheet.close} focusScale={1}>
              <Text style={sheet.closeText}>Fechar</Text>
            </TVFocusable>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  inner: { alignItems: 'stretch', paddingBottom: 8 },
  status: { paddingHorizontal: 32, marginTop: -8, fontSize: 14, fontFamily: fontFamily.regular, color: colors.text3 },
  dialWrap: { marginTop: 28, alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  dialCenter: { position: 'absolute', alignItems: 'center' },
  dialValue: { fontFamily: fontFamily.bold, fontVariant: ['tabular-nums'], color: colors.text1, letterSpacing: -0.5 },
  stepRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14,
    marginTop: 28, paddingVertical: 6,
  },
  stepBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  confirmBtn: {
    minWidth: 150, height: 48, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 16,
  },
  confirmText: { fontSize: 16, fontFamily: fontFamily.semiBold, color: colors.textInverse },
  actions: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 20, paddingHorizontal: 18 },
});
