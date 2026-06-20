/**
 * ExpandableText — texto com "ver mais/ver menos".
 *
 * Mede uma vez (primeiro paint sem limite) para saber se realmente trunca; só então
 * mostra o toggle. Funciona em TV (TVFocusable) e mobile (Pressable).
 */
import React, { useCallback, useState } from 'react';
import { Text, Pressable, StyleProp, TextStyle } from 'react-native';
import TVFocusable from './TVFocusable';
import { IS_TV } from '../utils/tvDetect';
import { colors } from '../utils/theme';

interface Props {
  text: string;
  style?: StyleProp<TextStyle>;
  collapsedLines?: number;
  toggleStyle?: StyleProp<TextStyle>;
}

export default function ExpandableText({ text, style, collapsedLines = 4, toggleStyle }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [needsToggle, setNeedsToggle] = useState(false);
  const [measured, setMeasured] = useState(false);

  const onTextLayout = useCallback((e: { nativeEvent: { lines: unknown[] } }) => {
    if (measured) return;
    setMeasured(true);
    if (e.nativeEvent.lines.length > collapsedLines) setNeedsToggle(true);
  }, [measured, collapsedLines]);

  const textEl = (
    <Text
      style={style}
      // 1º paint (measuring) sem limite p/ contar linhas; depois clampa quando recolhido
      numberOfLines={measured && !expanded ? collapsedLines : undefined}
      onTextLayout={onTextLayout}
    >
      {text}
    </Text>
  );

  if (!needsToggle) return textEl;

  const label = expanded ? 'ver menos' : 'ver mais';
  const toggle = () => setExpanded(v => !v);
  const labelEl = (
    <Text style={[{ color: colors.accent, marginTop: 6, fontWeight: '600', fontSize: 12 }, toggleStyle]}>
      {label}
    </Text>
  );

  return IS_TV ? (
    <TVFocusable onPress={toggle} focusScale={1} borderRadius={6} style={{ alignSelf: 'stretch' }}>
      {textEl}
      {labelEl}
    </TVFocusable>
  ) : (
    <Pressable onPress={toggle}>
      {textEl}
      {labelEl}
    </Pressable>
  );
}
