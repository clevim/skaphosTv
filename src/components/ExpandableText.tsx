/**
 * ExpandableText — texto com "ver mais".
 *  • Mobile: expande/recolhe inline (numberOfLines).
 *  • TV: abre um modal com a sinopse completa (evita quebrar layouts fixos e
 *    funciona bem no 10-foot UI).
 * A necessidade do "ver mais" é detectada por tamanho do texto (robusto em
 * Android/TV, onde onTextLayout às vezes não reporta as linhas).
 */
import React, { useState } from 'react';
import { Text, Pressable, View, Modal, ScrollView, StyleSheet, StyleProp, TextStyle } from 'react-native';
import TVFocusable from './TVFocusable';
import { IS_TV } from '../utils/tvDetect';
import { colors, radius, fontFamily } from '../utils/theme';

interface Props {
  text: string;
  style?: StyleProp<TextStyle>;
  collapsedLines?: number;
  toggleStyle?: StyleProp<TextStyle>;
  title?: string;
}

// ~40 caracteres por linha (conservador) — se passar disso, vale o "ver mais"
const CHARS_PER_LINE = 40;

export default function ExpandableText({ text, style, collapsedLines = 4, toggleStyle, title }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [modal, setModal] = useState(false);

  const needsToggle = text.trim().length > collapsedLines * CHARS_PER_LINE;

  if (!needsToggle) {
    return <Text style={style} numberOfLines={collapsedLines}>{text}</Text>;
  }

  const hint = (label: string) => (
    <Text style={[s.toggle, toggleStyle]}>{label}</Text>
  );

  // ── TV: modal com sinopse completa ──────────────────────────────
  if (IS_TV) {
    return (
      <>
        <TVFocusable onPress={() => setModal(true)} focusScale={1} borderRadius={6} style={{ alignSelf: 'stretch' }}>
          <Text style={style} numberOfLines={collapsedLines}>{text}</Text>
          {hint('ver mais')}
        </TVFocusable>

        <Modal visible={modal} transparent animationType="fade" onRequestClose={() => setModal(false)}>
          <View style={s.overlay}>
            <View style={s.box}>
              {title ? <Text style={s.title} numberOfLines={2}>{title}</Text> : null}
              <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
                <Text style={[style, s.fullText]}>{text}</Text>
              </ScrollView>
              <TVFocusable onPress={() => setModal(false)} hasTVPreferredFocus style={s.closeBtn} borderRadius={10}>
                <Text style={s.closeText}>Fechar</Text>
              </TVFocusable>
            </View>
          </View>
        </Modal>
      </>
    );
  }

  // ── Mobile: expand inline ───────────────────────────────────────
  return (
    <Pressable onPress={() => setExpanded(v => !v)}>
      <Text style={style} numberOfLines={expanded ? undefined : collapsedLines}>{text}</Text>
      {hint(expanded ? 'ver menos' : 'ver mais')}
    </Pressable>
  );
}

const s = StyleSheet.create({
  toggle: { color: colors.accent, marginTop: 6, fontWeight: '600', fontSize: 12 },
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center', justifyContent: 'center', padding: 32,
  },
  box: {
    width: '70%', maxWidth: 760, maxHeight: '80%',
    backgroundColor: colors.bg1, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, padding: 28,
  },
  title: { fontSize: 20, fontFamily: fontFamily.semiBold, color: colors.text1, marginBottom: 14 },
  scroll: { flexGrow: 0 },
  fullText: { color: colors.text1 },
  closeBtn: {
    marginTop: 20, alignSelf: 'flex-start',
    paddingHorizontal: 28, paddingVertical: 12, borderRadius: 10,
    backgroundColor: colors.accent,
  },
  closeText: { color: colors.white, fontSize: 15, fontWeight: '700' },
});
