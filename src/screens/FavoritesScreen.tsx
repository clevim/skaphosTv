// FavoritesScreen.tsx — matches MobileLibrary design exactly
import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, Dimensions,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store/useStore';
import ChannelCard from '../components/ChannelCard';
import TVFocusable from '../components/TVFocusable';
import { colors, spacing, fontSize, radius } from '../utils/theme';
import { Channel } from '../types';
import { IS_TV } from '../utils/tvDetect';

const { width } = Dimensions.get('window');

const TABS = ['Minha Lista', 'Gravações', 'Histórico', 'Baixados'] as const;
type Tab = typeof TABS[number];

const RecRow = React.memo(function RecRow({
  item, onPress, mode,
}: { item: Channel; onPress: (ch: Channel) => void; mode: 'rec' | 'history' }) {
  const handlePress = useCallback(() => onPress(item), [onPress, item]);
  return (
    <TVFocusable onPress={handlePress} style={styles.recRow}>
      <View style={styles.recThumb}>
        {item.logo ? (
          <Image source={item.logo} style={styles.recThumbImg} contentFit="cover" transition={0} recyclingKey={item.id} />
        ) : (
          <View style={styles.recThumbFallback}>
            <Text style={styles.recThumbText}>{mode === 'rec' ? 'REC' : item.name.slice(0, 2).toUpperCase()}</Text>
          </View>
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.recTitle} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.recChannel} numberOfLines={1}>
          {item.group ? item.group.replace(/[♦◆️]\s*/g, '').trim() : ''}
        </Text>
        {mode === 'rec' && <Text style={styles.recMeta}>{item.quality || 'HD'} · Canal</Text>}
      </View>
      <Ionicons name="chevron-forward" size={14} color={colors.text3} />
    </TVFocusable>
  );
});

const FavCard = React.memo(function FavCard({
  item, isFavorite, onPress,
}: { item: Channel; isFavorite: boolean; onPress: (ch: Channel) => void }) {
  const handlePress = useCallback(() => onPress(item), [onPress, item]);
  return <ChannelCard channel={item} isFavorite={isFavorite} onPress={handlePress} />;
});

export function FavoritesScreen() {
  const navigation = useNavigation();
  const { channels, favorites, recentChannels, setCurrentChannel } = useStore();
  const [activeTab, setActiveTab] = useState<Tab>('Minha Lista');

  const favChannels = useMemo(
    () => channels.filter(c => favorites.includes(c.id)),
    [channels, favorites],
  );

  const numCols = Math.max(1, Math.floor((width - (IS_TV ? 96 : 48)) / (IS_TV ? 172 : 118)));

  const playChannel = useCallback((ch: Channel) => {
    setCurrentChannel(ch);
    (navigation as any).navigate('Player', { channel: ch });
  }, [navigation, setCurrentChannel]);

  const keyExtractor = useCallback((c: Channel) => c.id, []);

  const renderRec = useCallback(
    ({ item }: { item: Channel }) => <RecRow item={item} onPress={playChannel} mode="rec" />,
    [playChannel]
  );
  const renderHistory = useCallback(
    ({ item }: { item: Channel }) => <RecRow item={item} onPress={playChannel} mode="history" />,
    [playChannel]
  );
  const renderFavCard = useCallback(
    ({ item }: { item: Channel }) => (
      <FavCard item={item} isFavorite={favorites.includes(item.id)} onPress={playChannel} />
    ),
    [playChannel, favorites]
  );

  // Data based on active tab
  const getData = (): Channel[] => {
    switch (activeTab) {
      case 'Minha Lista': return favChannels;
      case 'Histórico': return recentChannels;
      case 'Gravações': return recentChannels.slice(0, 5); // placeholder
      case 'Baixados': return [];
      default: return [];
    }
  };
  const data = getData();

  const emptyConfig = {
    'Minha Lista': { icon: 'star-outline' as const, title: 'Nenhum favorito ainda', sub: 'Pressione e segure um canal para favoritar' },
    'Gravações': { icon: 'radio-outline' as const, title: 'Nenhuma gravação', sub: 'As gravações aparecerão aqui' },
    'Histórico': { icon: 'time-outline' as const, title: 'Nenhum canal assistido', sub: 'Os canais assistidos aparecerão aqui' },
    'Baixados': { icon: 'download-outline' as const, title: 'Nenhum download', sub: 'Os downloads aparecerão aqui' },
  };

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        {!IS_TV && (
          <TVFocusable onPress={() => navigation.goBack()} style={styles.back}>
            <Ionicons name="chevron-back" size={20} color={colors.text2} />
          </TVFocusable>
        )}
        <Text style={styles.title}>Biblioteca</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        {TABS.map((tab, i) => {
          const on = tab === activeTab;
          return (
            <TVFocusable
              key={tab}
              onPress={() => setActiveTab(tab)}
              hasTVPreferredFocus={IS_TV && i === 0}
            >
              <Text style={[styles.tab, on && styles.tabActive]}>{tab}</Text>
              {on && <View style={styles.tabIndicator} />}
            </TVFocusable>
          );
        })}
      </View>

      {/* Info row */}
      <View style={styles.infoRow}>
        <Text style={styles.infoText}>
          {data.length} {data.length === 1 ? 'item' : 'itens'}
        </Text>
        <View style={styles.infoActions}>
          <Ionicons name="funnel-outline" size={16} color={colors.text2} />
          <Ionicons name="list-outline" size={16} color={colors.text2} />
        </View>
      </View>

      {data.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIconWrap}>
            <Ionicons
              name={emptyConfig[activeTab].icon}
              size={IS_TV ? 48 : 40}
              color={colors.text3}
            />
          </View>
          <Text style={styles.emptyTitle}>{emptyConfig[activeTab].title}</Text>
          <Text style={styles.emptySub}>{emptyConfig[activeTab].sub}</Text>
        </View>
      ) : activeTab === 'Gravações' ? (
        <FlatList
          data={data}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          renderItem={renderRec}
        />
      ) : activeTab === 'Histórico' ? (
        <FlatList
          data={data}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          renderItem={renderHistory}
        />
      ) : (
        <FlatList
          data={data}
          keyExtractor={keyExtractor}
          numColumns={numCols}
          contentContainerStyle={styles.gridContent}
          renderItem={renderFavCard}
        />
      )}
    </View>
  );
}

export default FavoritesScreen;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg0 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: IS_TV ? spacing.xxxl : 22,
    paddingTop: IS_TV ? spacing.xxl : spacing.lg,
    paddingBottom: spacing.sm,
  },
  back: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.bg1,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: IS_TV ? fontSize.xxl : 28,
    fontWeight: '600',
    color: colors.text1,
    letterSpacing: -0.6,
  },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    gap: 18,
    paddingHorizontal: IS_TV ? spacing.xxxl : 22,
    paddingTop: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  tab: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.text3,
    paddingBottom: 10,
  },
  tabActive: {
    color: colors.text1,
    fontWeight: '600',
  },
  tabIndicator: {
    height: 2,
    backgroundColor: colors.accent,
    borderRadius: 1,
    marginBottom: -1,
  },

  // Info row
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: IS_TV ? spacing.xxxl : 22,
    paddingVertical: 12,
  },
  infoText: {
    fontSize: 10,
    color: colors.text3,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  infoActions: {
    flexDirection: 'row',
    gap: 12,
  },

  listContent: {
    paddingHorizontal: IS_TV ? spacing.xxxl : 22,
    paddingBottom: 100,
  },
  gridContent: {
    paddingHorizontal: IS_TV ? spacing.xxxl : 22,
    paddingBottom: 60,
  },

  // Recording rows
  recRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  recThumb: {
    width: 84,
    height: 60,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: colors.bg3,
  },
  recThumbImg: { width: '100%', height: '100%' },
  recThumbFallback: {
    width: '100%', height: '100%',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.bg2,
  },
  recThumbText: { fontSize: 10, fontWeight: '700', color: colors.accent },
  recTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text1,
  },
  recChannel: {
    fontSize: 11,
    color: colors.text2,
    marginTop: 2,
  },
  recMeta: {
    fontSize: 10,
    color: colors.text3,
    marginTop: 4,
  },

  // Empty
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  emptyIconWrap: {
    width: IS_TV ? 96 : 80,
    height: IS_TV ? 96 : 80,
    borderRadius: IS_TV ? 48 : 40,
    backgroundColor: colors.bg2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  emptyTitle: {
    fontSize: IS_TV ? fontSize.lg : fontSize.md,
    fontWeight: '600',
    color: colors.text1,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: fontSize.xs,
    color: colors.text3,
    textAlign: 'center',
    maxWidth: 280,
  },
});
