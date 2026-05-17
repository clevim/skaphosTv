/**
 * TVFocusCursor — cursor de foco global para TV.
 *
 * Animações 100% native driver (translateX, translateY, opacity).
 * Sem JS driver → sem jank no FireTV mesmo com JS thread ocupado.
 *
 * Tamanho (width/height/borderRadius): setValue() síncrono, zero overhead.
 * Anti-blink: aguarda 80ms antes de esconder para não piscar na troca A→B.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Animated, View } from 'react-native';
// colors removed — using hardcoded white for max visibility on TV
import { IS_TV } from '../utils/tvDetect';

export interface FocusRect {
  x: number;
  y: number;
  width: number;
  height: number;
  borderRadius: number;
}

type Listener = (rect: FocusRect | null) => void;
let _listener: Listener | null = null;

export function reportFocus(rect: FocusRect | null): void {
  _listener?.(rect);
}

function TVFocusCursorInner() {
  const [rect, setRect] = useState<FocusRect | null>(null);

  useEffect(() => {
    _listener = setRect;
    return () => { _listener = null; };
  }, []);

  // Native driver: posição + opacidade (zero jank)
  const xAnim       = useRef(new Animated.Value(0)).current;
  const yAnim       = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  // Tamanho via setValue — síncrono, sem animation loop
  const wAnim = useRef(new Animated.Value(60)).current;
  const hAnim = useRef(new Animated.Value(40)).current;
  const rAnim = useRef(new Animated.Value(10)).current;

  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }

    if (!rect) {
      hideTimer.current = setTimeout(() => {
        Animated.timing(opacityAnim, {
          toValue: 0, duration: 120, useNativeDriver: true,
        }).start();
      }, 80);
      return;
    }

    // Snap de tamanho: síncrono, sem custo
    wAnim.setValue(rect.width);
    hAnim.setValue(rect.height);
    rAnim.setValue(Math.max(rect.borderRadius, 6));

    // Move + aparece via native driver
    Animated.parallel([
      Animated.timing(xAnim,       { toValue: rect.x, duration: 140, useNativeDriver: true }),
      Animated.timing(yAnim,       { toValue: rect.y, duration: 140, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 1,      duration: 80,  useNativeDriver: true }),
    ]).start();
  }, [rect]);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position:  'absolute',
        top:       0,
        left:      0,
        opacity:   opacityAnim,
        transform: [{ translateX: xAnim }, { translateY: yAnim }],
      }}
    >
      {/*
        Animated.View para width/height/borderRadius (não suportam native driver).
        setValue() é síncrono — zero overhead de animation loop.
      */}
      <Animated.View
        style={{
          width:           wAnim,
          height:          hAnim,
          borderRadius:    rAnim,
          borderWidth:     4,
          borderColor:     '#ffffff',
          backgroundColor: 'rgba(255,255,255,0.12)',
        }}
      />
    </Animated.View>
  );
}

export default function TVFocusCursor() {
  if (!IS_TV) return null;
  return <TVFocusCursorInner />;
}
