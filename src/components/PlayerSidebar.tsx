import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Channel } from '../types';
import TVFocusable from './TVFocusable';
import { colors, fontSize, radius, spacing } from '@/utils/theme';


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
  const currentIndex = channels.findIndex(c => c.id === currentChannel.id);

  return (
    <View style={styles.sidebar}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>{title ?? currentChannel.group}</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Ionicons name="close" size={20} color={colors.text2} />
        </TouchableOpacity>
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
          return (
            <TVFocusable
              onPress={() => onSelectChannel(item)}
              style={[styles.item, isActive && styles.itemActive]}
            >
              {item.logo ? (
                <Image source={item.logo} style={styles.logo} contentFit="contain" transition={0} recyclingKey={item.id} />
              ) : (
                <View style={styles.logoPlaceholder}>
                  <Text style={styles.logoText}>{item.name.slice(0, 2).toUpperCase()}</Text>
                </View>
              )}
              <View style={styles.meta}>
                <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                {/* Episódio: título real ("Pilot") vale mais que repetir o grupo */}
                <Text style={styles.group} numberOfLines={1}>{item.epTitle || item.group}</Text>
              </View>
            </TVFocusable>
          );
        }}
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
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.text1,
    flex: 1,
  },
  closeBtn: { padding: 4 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: spacing.md,
    height: 64,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.03)',
  },
  itemActive: { backgroundColor: colors.accent + '22' },
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