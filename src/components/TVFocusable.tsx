/**
 * TVFocusable — wrapper focalizável para TV e Mobile.
 *
 * Foco detectado via addFocusListener (ViewTreeObserver da Activity).
 * Focus trapping em sheets: use nextFocusUp/Down/Left/Right (IDs nativos obtidos via getTag())
 * para redirecionar o D-pad antes que o FocusFinder escape para o conteúdo de trás.
 */

import React, { useRef, useEffect, useState, useImperativeHandle } from 'react';
import {
  Pressable,
  Animated,
  ViewStyle,
  StyleProp,
  findNodeHandle,
} from 'react-native';
import { IS_TV } from '../utils/tvDetect';
import { addFocusListener } from '../../modules/tv-focus';

const FOCUS_SCALE = IS_TV ? 1.05 : 1;
const FOCUS_BG    = 'rgba(167,139,250,0.22)';
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface TVFocusableHandle {
  focus:  () => void;
  /** Retorna o ID nativo do Android View — use com nextFocusLeft/Right/Up/Down */
  getTag: () => number | null;
}

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
  /** Escala do zoom ao focar. Passe 1 para desativar (ex.: linhas full-width em sheets). */
  focusScale?: number;
  onFocus?: () => void;
  onBlur?: () => void;
  /** IDs nativos para redirecionar D-pad — usados para focus trapping em overlays. */
  nextFocusLeft?:  number;
  nextFocusRight?: number;
  nextFocusUp?:    number;
  nextFocusDown?:  number;
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
  focusScale,
  onFocus: onFocusProp,
  onBlur:  onBlurProp,
  nextFocusLeft,
  nextFocusRight,
  nextFocusUp,
  nextFocusDown,
}, ref) {
  const pressableRef = useRef<any>(null);
  // Já inicia destacado se for o foco preferido — assim o highlight aparece ao
  // entrar na tela, sem depender do usuário mexer pro listener disparar.
  const [isFocused, setIsFocused] = useState(IS_TV && hasTVPreferredFocus);

  const targetScale = focusScale ?? FOCUS_SCALE;
  const zooming     = targetScale > 1;

  const scaleAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: isFocused ? targetScale : 1,
      useNativeDriver: true,
      speed: 30,
      bounciness: 4,
    }).start();
  }, [isFocused]); // eslint-disable-line react-hooks/exhaustive-deps

  const onFocusPropRef = useRef(onFocusProp);
  const onBlurPropRef  = useRef(onBlurProp);
  onFocusPropRef.current = onFocusProp;
  onBlurPropRef.current  = onBlurProp;

  useImperativeHandle(ref, () => ({
    focus:  () => { (pressableRef.current as any)?.focus?.(); },
    getTag: () => findNodeHandle(pressableRef.current),
  }));

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

  const nextFocusProps: Record<string, number> = {};
  if (nextFocusLeft  != null) nextFocusProps.nextFocusLeft  = nextFocusLeft;
  if (nextFocusRight != null) nextFocusProps.nextFocusRight = nextFocusRight;
  if (nextFocusUp    != null) nextFocusProps.nextFocusUp    = nextFocusUp;
  if (nextFocusDown  != null) nextFocusProps.nextFocusDown  = nextFocusDown;

  return (
    <AnimatedPressable
      ref={pressableRef}
      onPress={disabled ? undefined : () => { setIsFocused(false); onPress?.(); }}
      onLongPress={disabled ? undefined : onLongPress}
      // Mecanismo 2: Pressable.onFocus/onBlur — redundância para mecanismo 1.
      // Captura o foco inicial do hasTVPreferredFocus antes do listener ser subscrito,
      // e garante highlighting em casos que o ViewTreeObserver não alcança.
      onFocus={IS_TV ? () => { setIsFocused(true);  onFocusPropRef.current?.(); } : undefined}
      onBlur ={IS_TV ? () => { setIsFocused(false); onBlurPropRef.current?.();  } : undefined}
      style={[
        { borderRadius },
        style,
        isFocused && { backgroundColor: FOCUS_BG },
        isFocused && focusStyle,
        isFocused && (zooming
          ? { zIndex: 20, elevation: 8, shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }
          : { zIndex: 20 }),
        { transform: [{ scale: scaleAnim }] },
      ]}
      accessible={accessible}
      accessibilityLabel={accessibilityLabel}
      {...({
        focusable:           !disabled,
        hasTVPreferredFocus: hasTVPreferredFocus && !disabled,
        isTVSelectable:      !disabled,
        collapsable:         false,
        ...nextFocusProps,
      } as any)}
    >
      {children}
    </AnimatedPressable>
  );
});

export default TVFocusable;
