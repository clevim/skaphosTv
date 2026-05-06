// FavoritesScreen.tsx
import React from 'react';
import { View, Text, StyleSheet, FlatList, Dimensions } from 'react-native';
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
const numCols = Math.floor((width - 220 - 32) / 175);

export function FavoritesScreen() {
  const navigation = useNavigation<Nav>();
  const { channels, favorites, setCurrentChannel } = useStore();
  const favChannels = channels.filter(c => favorites.includes(c.id));

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TVFocusable onPress={() => navigation.goBack()} style={styles.back}>
          <Ionicons name="chevron-back" size={22} color={colors.text2} />
        </TVFocusable>
        <Ionicons name="star" size={22} color={colors.yellow} />
        <Text style={styles.title}>Favoritos ({favChannels.length})</Text>
      </View>
      {favChannels.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="star-outline" size={64} color={colors.text3} />
          <Text style={styles.emptyTitle}>Nenhum favorito ainda</Text>
          <Text style={styles.emptySub}>Pressione e segure um canal para favoritar</Text>
        </View>
      ) : (
        <FlatList
          data={favChannels}
          keyExtractor={c => c.id}
          numColumns={numCols}
          contentContainerStyle={{ padding: spacing.lg }}
          renderItem={({ item }) => (
            <ChannelCard
              channel={item}
              isFavorite
              onPress={() => { setCurrentChannel(item); navigation.navigate('Player', { channel: item }); }}
            />
          )}
        />
      )}
    </View>
  );
}

export default FavoritesScreen;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg0 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border,
    backgroundColor: colors.bg1,
  },
  back: { padding: 6, borderRadius: radius.sm },
  title: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text1 },
  emptySub: { fontSize: fontSize.sm, color: colors.text3 },
});
