/**
 * TVFocusable — wrapper focalizável para TV e Mobile.
 *
 * A animação de escala ao focar é feita 100% NATIVA pelo módulo
 * TvFocus (modules/tv-focus/) via ViewPropertyAnimator — sem JS,
 * sem jank, funciona mesmo com JS thread ocupado.
 *
 * O módulo também emite 'onTvFocusChanged' para JS, que usamos
 * para mostrar/esconder o overlay branco de foco.
 *
 * Anel de foco DENTRO do Pressable para posição correta relativa
 * ao card (não na área de margin entre cards).
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
const RING_COLOR = 'transparent';
const RING_BG    = 'transparent';

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

  useImperativeHandle(ref, () => ({
    focus: () => { (pressableRef.current as any)?.focus?.(); },
  }));

  useEffect(() => {
    if (!IS_TV) return;

    const sub = addFocusListener((event) => {
      const myTag = findNodeHandle(pressableRef.current);
      if (myTag == null) return;

      if (event.newViewTag === myTag) {
        setIsFocused(true);
        onFocusProp?.();
      } else if (event.oldViewTag === myTag) {
        setIsFocused(false);
        onBlurProp?.();
      }
    });

    return () => {
      sub?.remove();
      // Limpa estado ao desmontar (ex: troca de tela)
      setIsFocused(false);
    };
  }, [onFocusProp, onBlurProp]);

  return (
    <Pressable
      ref={pressableRef as any}
      onPress={disabled ? undefined : onPress}
      onLongPress={disabled ? undefined : onLongPress}
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

      {/* Overlay branco de foco — por cima de tudo */}
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
