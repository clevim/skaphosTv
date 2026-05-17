// SearchScreen.tsx — matches MobileSearch design exactly
import React, { useState, useMemo } from 'react';
import {
  View, Text, TextInput, StyleSheet, FlatList,
  Image, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store/useStore';
import TVFocusable from '../components/TVFocusable';
import { colors, spacing, fontSize, radius } from '../utils/theme';
import { Channel } from '../types';
import { IS_TV } from '../utils/tvDetect';

const TYPE_LABEL: Record<string, string> = {
  live: 'CANAL',
  movies: 'FILME',
  series: 'SÉRIE',
};

export function SearchScreen() {
  const navigation = useNavigation();
  const { channels, setCurrentChannel } = useStore();
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return channels.filter(c =>
      c.name.toLowerCase().includes(q) || (c.group || '').toLowerCase().includes(q)
    );
  }, [channels, query]);

  const bestMatch = results.length > 0 ? results[0] : null;
  const otherResults = results.slice(1);

  const playChannel = (ch: Channel) => {
    setCurrentChannel(ch);
    (navigation as any).navigate('Player', { channel: ch });
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
        <Text style={styles.title}>Buscar</Text>
      </View>

      {/* Search box */}
      <View style={styles.searchWrap}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.text3} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar canais, filmes, séries..."
            placeholderTextColor={colors.text3}
            value={query}
            onChangeText={setQuery}
            autoFocus={!IS_TV}
          />
          {query.length > 0 && (
            <TVFocusable onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={18} color={colors.text3} />
            </TVFocusable>
          )}
        </View>
        {query.trim().length > 0 && results.length > 0 && (
          <Text style={styles.resultCount}>
            {results.length} resultado{results.length !== 1 ? 's' : ''} · canais, filmes, séries
          </Text>
        )}
      </View>

      {query.trim() === '' ? (
        <View style={styles.empty}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="search" size={IS_TV ? 48 : 40} color={colors.text3} />
          </View>
          <Text style={styles.emptyTitle}>Busque por canais</Text>
          <Text style={styles.emptySub}>Digite o nome ou categoria</Text>
        </View>
      ) : results.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="alert-circle-outline" size={IS_TV ? 48 : 40} color={colors.text3} />
          </View>
          <Text style={styles.emptyTitle}>Sem resultados para "{query}"</Text>
          <Text style={styles.emptySub}>Tente outro termo de busca</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={c => c.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            bestMatch ? (
              <View style={styles.bestMatchSection}>
                <Text style={styles.sectionLabel}>MELHOR RESULTADO</Text>
                <TVFocusable
                  onPress={() => playChannel(bestMatch)}
                  style={styles.bestMatchCard}
                >
                  <View style={styles.bestMatchPoster}>
                    {bestMatch.logo ? (
                      <Image source={{ uri: bestMatch.logo }} style={styles.bestMatchImg} resizeMode="cover" />
                    ) : (
                      <View style={[styles.bestMatchFallback, { backgroundColor: colors.accentSoft }]}>
                        <Text style={styles.bestMatchInitials}>
                          {bestMatch.name.slice(0, 2).toUpperCase()}
                        </Text>
                      </View>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.bestMatchName} numberOfLines={1}>{bestMatch.name}</Text>
                    <Text style={styles.bestMatchSub} numberOfLines={1}>
                      {TYPE_LABEL['live']}
                      {bestMatch.group ? ` · ${bestMatch.group.replace(/[♦◆️]\s*/g, '').trim()}` : ''}
                    </Text>
                    <Text style={styles.bestMatchDesc} numberOfLines={2}>
                      {bestMatch.group
                        ? `${bestMatch.group.replace(/[♦◆️]\s*/g, '').trim()} · ${bestMatch.quality || 'HD'}`
                        : bestMatch.name}
                    </Text>
                    <View style={styles.bestMatchPlayBtn}>
                      <Ionicons name="play" size={11} color="#fff" />
                      <Text style={styles.bestMatchPlayText}>Assistir</Text>
                    </View>
                  </View>
                </TVFocusable>

                {otherResults.length > 0 && (
                  <Text style={[styles.sectionLabel, { marginTop: spacing.xl }]}>
                    OUTROS RESULTADOS
                  </Text>
                )}
              </View>
            ) : null
          }
          renderItem={({ item, index }) => {
            if (index === 0) return null; // best match already shown
            return (
              <TVFocusable
                onPress={() => playChannel(item)}
                style={styles.resultRow}
              >
                <View style={styles.resultThumb}>
                  {item.logo ? (
                    <Image source={{ uri: item.logo }} style={styles.resultThumbImg} resizeMode="cover" />
                  ) : (
                    <View style={[styles.resultThumbFallback, { backgroundColor: colors.accentSoft }]}>
                      <Text style={styles.resultThumbText}>{item.name.slice(0, 2).toUpperCase()}</Text>
                    </View>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.resultType}>
                    {TYPE_LABEL['live']}
                  </Text>
                  <Text style={styles.resultName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.resultSub} numberOfLines={1}>
                    {item.group ? item.group.replace(/[♦◆️]\s*/g, '').trim() : ''}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color={colors.text3} />
              </TVFocusable>
            );
          }}
        />
      )}
    </View>
  );
}

export default SearchScreen;

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

  searchWrap: {
    paddingHorizontal: IS_TV ? spacing.xxxl : 22,
    paddingBottom: spacing.md,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.bg1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: IS_TV ? 12 : 10,
    marginTop: 14,
  },
  searchInput: {
    flex: 1,
    color: colors.text1,
    fontSize: 15,
    padding: 0,
  },
  resultCount: {
    fontSize: 10,
    color: colors.text3,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginTop: 10,
  },

  listContent: {
    paddingHorizontal: IS_TV ? spacing.xxxl : 22,
    paddingBottom: 100,
  },

  // Best match
  bestMatchSection: {
    marginBottom: spacing.md,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.text3,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  bestMatchCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    backgroundColor: colors.bg1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bestMatchPoster: {
    width: 62,
    height: 92,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: colors.bg3,
  },
  bestMatchImg: { width: '100%', height: '100%' },
  bestMatchFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bestMatchInitials: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.accent,
    letterSpacing: 1,
  },
  bestMatchName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text1,
  },
  bestMatchSub: {
    fontSize: 11,
    color: colors.text2,
    marginTop: 2,
  },
  bestMatchDesc: {
    fontSize: 11,
    color: colors.text2,
    marginTop: 6,
    lineHeight: 16,
  },
  bestMatchPlayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 10,
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  bestMatchPlayText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },

  // Result rows
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  resultThumb: {
    width: 44,
    height: 44,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: colors.bg3,
  },
  resultThumbImg: { width: '100%', height: '100%' },
  resultThumbFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultThumbText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accent,
  },
  resultType: {
    fontSize: 9,
    color: colors.text3,
    letterSpacing: 0.6,
    fontWeight: '600',
  },
  resultName: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text1,
    marginTop: 1,
  },
  resultSub: {
    fontSize: 11,
    color: colors.text2,
    marginTop: 1,
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
  },
});
