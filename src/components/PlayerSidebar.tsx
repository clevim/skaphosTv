import React from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Channel } from '../types';
import TVFocusable from './TVFocusable';
import { colors, fontSize, fontFamily, radius, spacing } from '@/utils/theme';
import { IS_TV } from '../utils/tvDetect';
import { useAccentColors } from '../hooks/useAccentColors';


interface Props {
  channels: Channel[];
  currentChannel: Channel;
  onSelectChannel: (ch: Channel) => void;
  onClose: () => void;
  /** Título do cabeçalho. Padrão: grupo do canal atual (ex.: "Episódios" para séries). */
  title?: string;
}

export default function PlayerSidebar({
  channels,
  currentChannel,
  onSelectChannel,
  onClose,
  title,
}: Props) {
  const acc = useAccentColors();
  const currentIndex = channels.findIndex(c => c.id === currentChannel.id);
  // A lista abre já com o D-pad em cima do item atual — sem isso o foco fica no
  // botão do OSD que abriu o painel e o usuário precisa "caçar" a lista. Uma vez
  // só por abertura: a virtualização remonta o item ao rolar e ele roubaria o
  // foco de volta a cada movimento.
  const focusGrantedRef = React.useRef(false);

  return (
    <View style={styles.sidebar}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>{title ?? currentChannel.group}</Text>
        <Text style={styles.count}>{currentIndex >= 0 ? currentIndex + 1 : '–'}/{channels.length}</Text>
        <TVFocusable accessibilityLabel="Fechar lista" onPress={onClose} style={styles.closeBtn}>
          <Ionicons name="close" size={20} color={colors.text2} />
        </TVFocusable>
      </View>

      {/* Lista */}
      <FlatList
        data={channels}
        keyExtractor={item => item.id}
        showsVerticalScrollIndicator={false}
        getItemLayout={(_, index) => ({ length: 64, offset: 64 * index, index })}
        initialScrollIndex={Math.max(0, currentIndex)}
        renderItem={({ item }) => {
          const isActive = item.id === currentChannel.id;
          let preferred = false;
          if (IS_TV && isActive && !focusGrantedRef.current) {
            focusGrantedRef.current = true;
            preferred = true;
          }
          return (
            <TVFocusable
              onPress={() => onSelectChannel(item)}
              style={[styles.item, isActive && [styles.itemActive, { backgroundColor: acc.accentSoft, borderLeftColor: acc.accent }]]}
              hasTVPreferredFocus={preferred}
            >
              {item.logo ? (
                <Image source={item.logo} style={styles.logo} contentFit="contain" transition={0} cachePolicy="memory-disk" recyclingKey={item.id} />
              ) : (
                <View style={styles.logoPlaceholder}>
                  <Text style={styles.logoText}>{item.name.slice(0, 2).toUpperCase()}</Text>
                </View>
              )}
              <View style={styles.meta}>
                <Text style={[styles.name, isActive && [styles.nameActive, { color: acc.accent2 }]]} numberOfLines={1}>{item.name}</Text>
                {/* Episódio: título real ("Pilot") vale mais que repetir o grupo */}
                <Text style={styles.group} numberOfLines={1}>{item.epTitle || item.group}</Text>
              </View>
            </TVFocusable>
          );
        }}
        // Esta lista abre POR CIMA de um vídeo em reprodução, e alimenta-se de uma
        // categoria inteira (centenas ou milhares de canais). Nos defaults do RN
        // — windowSize 21, ~10 telas de folga para cada lado — são centenas de
        // itens montados, cada um com pôster e listener de foco, disputando a
        // thread com a decodificação. Aqui só a janela útil existe.
        //
        // windowSize 5 e não 3: é a lista de zapping, o usuário SEGURA o
        // direcional; com folga curta ele alcança o vazio e o foco se perde.
        // Clipar está proibido — destruiria a view nativa do item focado.
        initialNumToRender={12}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={50}
        windowSize={5}
        removeClippedSubviews={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: 280,
    backgroundColor: colors.bg1,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: fontSize.md,
    fontFamily: fontFamily.semiBold,
    color: colors.text1,
    flex: 1,
  },
  count: { color: colors.text2, fontSize: fontSize.xs, fontFamily: fontFamily.medium, fontVariant: ['tabular-nums'], marginRight: spacing.sm },
  closeBtn: { padding: 4 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: spacing.md,
    height: 64,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.03)',
    // barra de "tocando agora" reserva espaço sempre — sem deslocar o conteúdo
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  itemActive: { backgroundColor: colors.accentSoft, borderLeftColor: colors.accent },
  nameActive: { color: colors.accent2, fontFamily: fontFamily.semiBold },
  logo: { width: 36, height: 36, borderRadius: radius.sm },
  logoPlaceholder: {
    width: 36, height: 36, borderRadius: radius.sm,
    backgroundColor: colors.bg3,
    alignItems: 'center', justifyContent: 'center',
  },
  logoText: { color: colors.text2, fontSize: 11, fontWeight: '700' },
  meta: { flex: 1 },
  name: { color: colors.text1, fontSize: fontSize.sm, fontWeight: '500' },
  group: { color: colors.text3, fontSize: fontSize.xs },
});