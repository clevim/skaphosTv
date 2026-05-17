import React from 'react';
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Channel } from '../types';
import TVFocusable from './TVFocusable';
import { colors, fontSize, radius, spacing } from '@/utils/theme';


interface Props {
  channels: Channel[];
  currentChannel: Channel;
  onSelectChannel: (ch: Channel) => void;
  onClose: () => void;
}

export default function PlayerSidebar({
  channels,
  currentChannel,
  onSelectChannel,
  onClose,
}: Props) {
  const currentIndex = channels.findIndex(c => c.id === currentChannel.id);

  return (
    <View style={styles.sidebar}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>{currentChannel.group}</Text>
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
                <Image source={{ uri: item.logo }} style={styles.logo} resizeMode="contain" />
              ) : (
                <View style={styles.logoPlaceholder}>
                  <Text style={styles.logoText}>{item.name.slice(0, 2).toUpperCase()}</Text>
                </View>
              )}
              <View style={styles.meta}>
                <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.group} numberOfLines={1}>{item.group}</Text>
              </View>
              {isActive && <View style={styles.activeDot} />}
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
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent2 },
});