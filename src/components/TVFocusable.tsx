/**
 * TVFocusable — wrapper focalizável para TV e Mobile.
 *
 * A animação de escala ao focar é feita 100% NATIVA pelo módulo
 * TvFocus (modules/tv-focus/) via ViewPropertyAnimator — sem JS,
 * sem jank, funciona mesmo com JS thread ocupado.
 *
 * Detecção de foco usa dois mecanismos em paralelo:
 *   1. addFocusListener (ViewTreeObserver da Activity) — funciona em telas normais
 *   2. Pressable onFocus/onBlur — fallback para dentro de Modal
 *      (Modal cria uma Window separada, fora do ViewTreeObserver da Activity)
 *
 * Ambos escrevem no mesmo estado isFocused, de forma idempotente.
 */

import React, { useRef, useEffect, useState, useImperativeHandle } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  ViewStyle,
  StyleProp,
  findNodeHandle,
} from 'react-native';

export interface TVFocusableHandle {
  focus: () => void;
}
import { IS_TV } from '../utils/tvDetect';
import { addFocusListener } from '../../modules/tv-focus';

const RING_W     = IS_TV ? 2.5 : 2;
const RING_COLOR = IS_TV ? 'rgba(167,139,250,0.85)' : 'transparent';
const RING_BG    = IS_TV ? 'rgba(167,139,250,0.06)' : 'transparent';

export interface TVFocusableProps {
  children: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
  focusStyle?: StyleProp<ViewStyle>;
  hasTVPreferredFocus?: boolean;
  accessible?: boolean;
  accessibilityLabel?: string;
  disabled?: boolean;
  borderRadius?: number;
  onFocus?: () => void;
  onBlur?: () => void;
}

const TVFocusable = React.forwardRef<TVFocusableHandle, TVFocusableProps>(function TVFocusable({
  children,
  onPress,
  onLongPress,
  style,
  focusStyle,
  hasTVPreferredFocus = false,
  accessible = true,
  accessibilityLabel,
  disabled = false,
  borderRadius = 10,
  onFocus: onFocusProp,
  onBlur:  onBlurProp,
}, ref) {
  const pressableRef = useRef<View>(null);
  const [isFocused, setIsFocused] = useState(false);

  // Refs para callbacks — permite que o useEffect abaixo use deps=[] (subscription estável)
  // sem closure stale, independente de re-renders do componente pai.
  const onFocusPropRef = useRef(onFocusProp);
  const onBlurPropRef  = useRef(onBlurProp);
  onFocusPropRef.current = onFocusProp;
  onBlurPropRef.current  = onBlurProp;

  useImperativeHandle(ref, () => ({
    focus: () => { (pressableRef.current as any)?.focus?.(); },
  }));

  // Mecanismo 1: ViewTreeObserver da Activity principal (não funciona dentro de Modal)
  // deps=[] → subscription estável, cleanup apenas no unmount, sem reset acidental de isFocused
  useEffect(() => {
    if (!IS_TV) return;
    const sub = addFocusListener((event) => {
      const myTag = findNodeHandle(pressableRef.current);
      if (myTag == null) return;
      if (event.newViewTag === myTag) {
        setIsFocused(true);
        onFocusPropRef.current?.();
      } else if (event.oldViewTag === myTag) {
        setIsFocused(false);
        onBlurPropRef.current?.();
      }
    });
    return () => {
      sub?.remove();
      setIsFocused(false);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Pressable
      ref={pressableRef as any}
      onPress={disabled ? undefined : () => { setIsFocused(false); onPress?.(); }}
      onLongPress={disabled ? undefined : onLongPress}
      // Mecanismo 2: Pressable onFocus/onBlur — fallback para Modal
      // (Modal cria Window separada, ViewTreeObserver não alcança)
      onFocus={IS_TV ? () => { setIsFocused(true);  onFocusPropRef.current?.(); } : undefined}
      onBlur ={IS_TV ? () => { setIsFocused(false); onBlurPropRef.current?.();  } : undefined}
      style={[style, isFocused && focusStyle]}
      accessible={accessible}
      accessibilityLabel={accessibilityLabel}
      {...({
        focusable:           !disabled,
        hasTVPreferredFocus: hasTVPreferredFocus && !disabled,
        isTVSelectable:      !disabled,
        collapsable:         false,
      } as any)}
    >
      {children}

      {/* Anel de foco — por cima de tudo */}
      {isFocused && (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius,
              borderWidth:     RING_W,
              borderColor:     RING_COLOR,
              backgroundColor: RING_BG,
            },
          ]}
        />
      )}
    </Pressable>
  );
});

export default TVFocusable;
