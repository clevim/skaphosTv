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
import { IS_TV, IS_WEB } from '../utils/tvDetect';
import { shadow } from '../utils/theme';
import { useReducedMotion } from '../utils/reducedMotion';
import { addFocusListener, watchView } from '../../modules/tv-focus';

const FOCUS_SCALE = IS_TV ? 1.05 : 1;
// Mais opaco que colors.accentSoft (0.16): o highlight de foco precisa ler à distância na TV
const FOCUS_BG    = 'rgba(167,139,250,0.22)';
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Registro global: UMA assinatura do evento nativo para o app inteiro, com
// lookup O(1) por tag. Antes cada TVFocusable montado assinava o evento — cada
// movimento do D-pad rodava N callbacks (N = focusables montados, centenas num
// grid), todos comparando tags à toa.
const focusHandlers = new Map<number, (focused: boolean) => void>();
let focusSub: ReturnType<typeof addFocusListener> = null;
function ensureFocusSub() {
  if (focusSub) return;
  focusSub = addFocusListener((event) => {
    if (event.oldViewTag !== event.newViewTag) focusHandlers.get(event.oldViewTag)?.(false);
    focusHandlers.get(event.newViewTag)?.(true);
  });
}

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
  /** Expande a área de toque sem mudar o visual (alvo mínimo de 48dp no mobile). */
  hitSlop?: number;
  /** Web: botão direito do mouse (RN-web repassa ao DOM; ignorado no nativo). */
  onContextMenu?: (e: any) => void;
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
  hitSlop,
  onContextMenu,
}, ref) {
  const pressableRef = useRef<any>(null);
  // Já inicia destacado se for o foco preferido — assim o highlight aparece ao
  // entrar na tela, sem depender do usuário mexer pro listener disparar.
  const [isFocused, setIsFocused] = useState(IS_TV && hasTVPreferredFocus);

  const targetScale = focusScale ?? FOCUS_SCALE;
  const zooming     = targetScale > 1;

  const reducedMotion = useReducedMotion();
  const scaleAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    // Remover animações: o destaque continua (bg/sombra/escala), só sem o spring.
    if (reducedMotion) {
      scaleAnim.setValue(isFocused ? targetScale : 1);
      return;
    }
    Animated.spring(scaleAnim, {
      toValue: isFocused ? targetScale : 1,
      useNativeDriver: true,
      speed: 30,
      bounciness: 4,
    }).start();
  }, [isFocused, reducedMotion]); // eslint-disable-line react-hooks/exhaustive-deps

  const onFocusPropRef = useRef(onFocusProp);
  const onBlurPropRef  = useRef(onBlurProp);
  onFocusPropRef.current = onFocusProp;
  onBlurPropRef.current  = onBlurProp;

  useImperativeHandle(ref, () => ({
    focus:  () => { (pressableRef.current as any)?.focus?.(); },
    getTag: () => findNodeHandle(pressableRef.current),
  }));

  // No web hasTVPreferredFocus não move o foco DOM de verdade: sem isto o
  // highlight fica "aceso" sem foco real (Enter morto até o primeiro Tab).
  useEffect(() => {
    if (IS_WEB && hasTVPreferredFocus && !disabled) {
      (pressableRef.current as any)?.focus?.();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!IS_TV) return;
    // Tag resolvida UMA vez por montagem (collapsable={false} garante a view
    // nativa) e registrada no mapa global — dispatch O(1) por evento de foco.
    const myTag = findNodeHandle(pressableRef.current);
    if (myTag == null) return;
    ensureFocusSub();
    focusHandlers.set(myTag, (focused) => {
      setIsFocused(focused);
      (focused ? onFocusPropRef : onBlurPropRef).current?.();
    });
    // Modais RN abrem outra janela nativa (Dialog) — garante que o observer de
    // foco também esteja nela, senão o highlight não segue o D-pad em modais.
    watchView(myTag);
    return () => {
      focusHandlers.delete(myTag);
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
      // Não zera isFocused aqui: o foco nativo CONTINUA no botão após o press
      // (ex.: favoritar no hero) — apagar o highlight deixava o usuário sem
      // referência de onde estava. O blur real chega pelo observer de foco.
      onPress={disabled ? undefined : onPress}
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
          ? { zIndex: 20, ...shadow.focus }
          : { zIndex: 20 }),
        { transform: [{ scale: scaleAnim }] },
      ]}
      accessible={accessible}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={hitSlop}
      {...({
        focusable:           !disabled,
        hasTVPreferredFocus: hasTVPreferredFocus && !disabled,
        isTVSelectable:      !disabled,
        collapsable:         false,
        ...(onContextMenu ? { onContextMenu } : null),
        ...nextFocusProps,
      } as any)}
    >
      {children}
    </AnimatedPressable>
  );
});

export default TVFocusable;
