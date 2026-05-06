// SearchScreen.tsx
import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, StyleSheet, FlatList, Dimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store/useStore';
import ChannelCard from '../components/ChannelCard';
import TVFocusable from '../components/TVFocusable';
import { colors, spacing, fontSize, radius } from '../utils/theme';
import { RootStackParamList } from '../../App';

type Nav = StackNavigationProp<RootStackParamList>;
const { width } = Dimensions.get('window');

export function SearchScreen() {
  const navigation = useNavigation<Nav>();
  const { channels, favorites, setCurrentChannel } = useStore();
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return channels.filter(c =>
      c.name.toLowerCase().includes(q) || (c.group || '').toLowerCase().includes(q)
    );
  }, [channels, query]);

  const numCols = Math.max(1, Math.floor((width - 32) / 175));

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TVFocusable onPress={() => navigation.goBack()} style={styles.back}>
          <Ionicons name="chevron-back" size={22} color={colors.text2} />
        </TVFocusable>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.text3} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar canais..."
            placeholderTextColor={colors.text3}
            value={query}
            onChangeText={setQuery}
            autoFocus
          />
          {query.length > 0 && (
            <TVFocusable onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={18} color={colors.text3} />
            </TVFocusable>
          )}
        </View>
      </View>
      {query.trim() === '' ? (
        <View style={styles.empty}>
          <Ionicons name="search" size={64} color={colors.text3} />
          <Text style={styles.emptyTitle}>Busque por canais</Text>
          <Text style={styles.emptySub}>Digite o nome ou categoria</Text>
        </View>
      ) : results.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.text3} />
          <Text style={styles.emptyTitle}>Sem resultados para "{query}"</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={c => c.id}
          numColumns={numCols}
          contentContainerStyle={{ padding: spacing.lg }}
          renderItem={({ item }) => (
            <ChannelCard
              channel={item}
              isFavorite={favorites.includes(item.id)}
              onPress={() => { setCurrentChannel(item); navigation.navigate('Player', { channel: item }); }}
            />
          )}
        />
      )}
    </View>
  );
}

export default SearchScreen;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg0 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border,
    backgroundColor: colors.bg1,
  },
  back: { padding: 6, borderRadius: radius.sm },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.bg2, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 8,
  },
  searchInput: { flex: 1, color: colors.text1, fontSize: fontSize.md },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text1 },
  emptySub: { fontSize: fontSize.sm, color: colors.text3 },
});
