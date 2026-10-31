/**
 * TVFocusable — wrapper focalizável para TV e Mobile.
 *
 * Foco detectado via addFocusListener (ViewTreeObserver da Activity).
 * Focus trapping em sheets: use nextFocusUp/Down/Left/Right (IDs nativos obtidos via getTag())
 * para redirecionar o D-pad antes que o FocusFinder escape para o conteúdo de trás.
 */

import React, { useRef, useEffect, useState, useImperativeHandle, useContext } from 'react';
import { NavigationRouteContext } from '@react-navigation/native';
import {
  View,
  Pressable,
  Animated,
  ViewStyle,
  StyleProp,
  findNodeHandle,
} from 'react-native';
import { IS_TV, IS_WEB, IS_NATIVE_TV } from '../utils/tvDetect';
import { shadow, colors } from '../utils/theme';
import { useReducedMotion } from '../utils/reducedMotion';
import { reportTVFocus, claimTVFocus, releaseTVFocus } from '../utils/tvFocusMemory';
import { addFocusListener, watchView } from '../../modules/tv-focus';

const FOCUS_SCALE = IS_TV ? 1.05 : 1;
// Anel "com respiro" (estilo Google TV): branco, fino, afastado do elemento.
// Neutro de propósito — o acento do tema fica pro estado ATIVO, não pro foco.
const RING_W   = 2;
const RING_GAP = 3;
const RING_OUT = RING_W + RING_GAP;
// Sem zoom (botões/linhas): clareia o fundo em vez de tingir com o tema.
const FOCUS_LIFT = 'rgba(255,255,255,0.10)';
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
  const isFocusedInit = useRef(IS_TV && hasTVPreferredFocus);

  // Web: hover (mouse) tem estado próprio, mais fraco que o foco. Mobile: toque
  // ganha feedback de pressionado. Nenhum dos dois existe na TV física.
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

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

  const idRef = useRef({}).current;
  // Rota dona deste focável (contexto estável — não re-renderiza ao trocar de tela).
  const routeKey = useContext(NavigationRouteContext)?.key;
  const routeKeyRef = useRef(routeKey);
  routeKeyRef.current = routeKey;
  // Apagado à força (outro focável assumiu sem blur nativo — troca de janela/tela):
  // avisa o onBlur também, senão quem guarda estado próprio de foco (aba da
  // TVTopBar, pill de temporada, card de episódio) ficava "aceso" pra sempre.
  const forceOff = useRef(() => { setIsFocused(false); onBlurPropRef.current?.(); }).current;
  // Único ponto que acende/apaga: acender reivindica o foco global (apaga o anterior).
  const light = useRef((on: boolean) => {
    setIsFocused(on);
    if (on) claimTVFocus(idRef, forceOff);
    else releaseTVFocus(idRef);
  }).current;
  // Identidade estável: é ela que a memória de foco da tela guarda para
  // devolver o D-pad aqui quando o usuário voltar (ver tvFocusMemory).
  //
  // Android: `View.focus()` do RN 0.74 é no-op (ReactViewManager não trata o comando
  // "focus" — só TextInput tem), então a memória de foco, o redirecionamento da
  // TVTopBar e o play do player nunca devolviam o foco de verdade. O setter nativo
  // de `hasTVPreferredFocus` chama requestFocus(); via setNativeProps ele roda a
  // cada chamada, sem mexer no estado do React (o próximo render segue com false).
  const focusSelf = useRef(() => {
    const r = pressableRef.current as any;
    if (IS_NATIVE_TV && r?.setNativeProps) r.setNativeProps({ hasTVPreferredFocus: true });
    else r?.focus?.();
  }).current;

  useImperativeHandle(ref, () => ({
    focus:  focusSelf,
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
      light(focused);
      if (focused) reportTVFocus(focusSelf, routeKeyRef.current);
      (focused ? onFocusPropRef : onBlurPropRef).current?.();
    });
    // Aceso pelo hasTVPreferredFocus no 1º render: entra no "um aceso por vez" também.
    // Sem isso, dois preferidos na tela (ex.: aba da topbar + CTA do hero) ficavam
    // os dois destacados até o usuário mexer o D-pad.
    if (isFocusedInit.current) claimTVFocus(idRef, forceOff);
    // Modais RN abrem outra janela nativa (Dialog) — garante que o observer de
    // foco também esteja nela, senão o highlight não segue o D-pad em modais.
    watchView(myTag);
    return () => {
      focusHandlers.delete(myTag);
      releaseTVFocus(idRef);
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
      onFocus={IS_TV ? () => { light(true);  reportTVFocus(focusSelf, routeKeyRef.current); onFocusPropRef.current?.(); } : undefined}
      onBlur ={IS_TV ? () => { light(false); onBlurPropRef.current?.();  } : undefined}
      {...(IS_WEB && !disabled ? { onHoverIn: () => setHovered(true), onHoverOut: () => setHovered(false) } : null)}
      {...(!IS_TV && !disabled ? { onPressIn: () => setPressed(true), onPressOut: () => setPressed(false) } : null)}
      style={[
        { borderRadius },
        style,
        // Card com zoom já se destaca pela escala+sombra: fundo tingido só sujava o pôster.
        isFocused && !zooming && { backgroundColor: FOCUS_LIFT },
        isFocused && focusStyle,
        // Sem `elevation` no Android: num card sem fundo próprio (pôster + legenda) a
        // sombra nativa é desenhada pelo contorno da caixa inteira e virava uma placa
        // cinza sob a legenda. Zoom + anel já marcam o foco; a sombra fica pro web.
        isFocused && (zooming
          ? { zIndex: 20, ...(IS_WEB ? shadow.focus : null) }
          : { zIndex: 20 }),
        hovered && !isFocused && !zooming && { backgroundColor: FOCUS_LIFT },
        pressed && { opacity: 0.6 },
        // Web: o anel desenhado acima substitui o outline do navegador (eram dois anéis).
        IS_WEB && ({ outlineStyle: 'none' } as any),
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
      {/* Anel com respiro: fora do elemento (RING_GAP de folga), acompanha o raio. */}
      {IS_TV && (isFocused || hovered) && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute', top: -RING_OUT, left: -RING_OUT, right: -RING_OUT, bottom: -RING_OUT,
            borderRadius: borderRadius + RING_OUT, borderWidth: RING_W,
            // Hover (web) = anel a meia força; foco = anel cheio.
            borderColor: isFocused ? colors.text1 : 'rgba(255,255,255,0.45)',
          }}
        />
      )}
    </AnimatedPressable>
  );
});

export default TVFocusable;
