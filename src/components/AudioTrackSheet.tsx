import React, { useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import TVFocusable, { TVFocusableHandle } from './TVFocusable';
import Ionicons from '@expo/vector-icons/Ionicons';
import { sheet } from './playerSheetStyles';
import { useAccentColors } from '../hooks/useAccentColors';
import { JellyfinAudioTrack } from '../utils/jellyfinLoader';
import { IS_TV } from '../utils/tvDetect';

interface Props {
  visible: boolean;
  tracks: JellyfinAudioTrack[];
  selectedIndex: number | null;
  onSelect: (streamIndex: number) => void;
  onClose: () => void;
}

export default function AudioTrackSheet({ visible, tracks, selectedIndex, onSelect, onClose }: Props) {
  const ac = useAccentColors();
  // Refs para os elementos de borda do sheet — usados para focus trapping via nextFocus*.
  const closeRef = useRef<TVFocusableHandle | null>(null);
  const firstRef = useRef<TVFocusableHandle | null>(null);
  const [closeTag, setCloseTag] = useState<number | null>(null);
  const [firstTag, setFirstTag] = useState<number | null>(null);

  // Captura IDs nativos após o sheet aparecer e o FlatList renderizar o primeiro item.
  useEffect(() => {
    if (!visible || !IS_TV) return;
    const t = setTimeout(() => {
      setCloseTag(closeRef.current?.getTag() ?? null);
      setFirstTag(firstRef.current?.getTag() ?? null);
    }, 150);
    return () => clearTimeout(t);
  }, [visible]);

  if (!visible) return null;

  return (
    <View style={sheet.root} pointerEvents="box-none">
      {/* Backdrop — clicável para fechar, não focável pelo D-pad */}
      <Pressable
        style={StyleSheet.absoluteFillObject}
        onPress={onClose}
        {...({ focusable: false } as any)}
      />

      <View style={sheet.panel}>
        <Text style={sheet.title}>Áudio</Text>

        <FlatList
          data={tracks}
          keyExtractor={t => String(t.index)}
          style={sheet.list}
          contentContainerStyle={sheet.listInner}
          renderItem={({ item, index: listIndex }) => {
            const active  = item.index === selectedIndex;
            const isFirst = listIndex === 0;
            const isLast  = listIndex === tracks.length - 1;
            return (
              <TVFocusable
                ref={isFirst ? firstRef : undefined}
                onPress={() => { onSelect(item.index); onClose(); }}
                style={sheet.row}
                focusScale={1}
                hasTVPreferredFocus={active || (isFirst && !tracks.some(t => t.index === selectedIndex))}
                // Trap: UP do 1º item e DOWN do último → botão Fechar (fecha o ciclo); L/R → Fechar
                nextFocusUp={isFirst && closeTag ? closeTag : undefined}
                nextFocusDown={isLast && closeTag ? closeTag : undefined}
                nextFocusLeft={closeTag ?? undefined}
                nextFocusRight={closeTag ?? undefined}
              >
                <View style={sheet.rowText}>
                  <Text style={[sheet.rowTitle, active && sheet.rowTitleOn]}>{item.displayTitle}</Text>
                  {item.isDefault && <Text style={sheet.rowSub}>Padrão</Text>}
                </View>
                {active && <Ionicons name="checkmark" size={20} color={ac.accent} />}
              </TVFocusable>
            );
          }}
        />

        <View style={sheet.footer}>
          <TVFocusable
            ref={closeRef}
            onPress={onClose}
            style={sheet.close}
            focusScale={1}
            // Trap: DOWN do botão → primeiro item da lista (loop)
            nextFocusDown={firstTag ?? undefined}
          >
            <Text style={sheet.closeText}>Fechar</Text>
          </TVFocusable>
        </View>
      </View>
    </View>
  );
}
