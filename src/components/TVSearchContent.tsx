// TVSearchContent.tsx — TV voice/text search UI with pulsing animation
import React, { useRef, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, ScrollView, Image,
  Animated, Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Channel } from '../types';
import TVFocusable from './TVFocusable';
import { colors, spacing, fontSize, radius } from '../utils/theme';
import { detectType, getSeriesBaseName } from '../utils/channelUtils';

interface Props {
  query: string;
  onQueryChange: (q: string) => void;
  results: Channel[];
  onResultPress: (channel: Channel) => void;
}

const TYPE_LABEL: Record<string, string> = {
  live: 'CANAL', movies: 'FILME', series: 'SÉRIE',
};

/** Concentric pulsing rings shown when query is empty */
function PulsingRings() {
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;
  const ring3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const makeAnim = (val: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, {
            toValue: 1,
            duration: 1600,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(val, { toValue: 0, duration: 0, useNativeDriver: true }),
        ])
      );
    const a1 = makeAnim(ring1, 0);
    const a2 = makeAnim(ring2, 500);
    const a3 = makeAnim(ring3, 1000);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, [ring1, ring2, ring3]);

  const ringStyle = (val: Animated.Value) => ({
    position: 'absolute' as const,
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 1,
    borderColor: colors.accent,
    opacity: val.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
    transform: [{ scale: val.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] }) }],
  });

  return (
    <View style={rings.container}>
      <Animated.View style={ringStyle(ring1)} />
      <Animated.View style={ringStyle(ring2)} />
      <Animated.View style={ringStyle(ring3)} />
      {/* Center mic icon */}
      <View style={rings.center}>
        <Ionicons name="mic" size={32} color={colors.accent} />
      </View>
    </View>
  );
}

const rings = StyleSheet.create({
  container: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

function ResultItem({ channel, onPress }: { channel: Channel; onPress: () => void }) {
  const type = detectType(channel.group || '', channel.name);
  const displayName = type === 'series' ? getSeriesBaseName(channel.name) : channel.name;
  const groupClean = channel.group?.replace(/[♦◆️\uFE0F]\s*/g, '').trim() || '';

  return (
    <TVFocusable onPress={onPress} style={styles.resultItem}>
      <View style={styles.resultThumb}>
        {channel.logo ? (
          <Image source={{ uri: channel.logo }} style={styles.resultThumbImg} resizeMode="contain" />
        ) : (
          <View style={styles.resultThumbFallback}>
            <Text style={styles.resultThumbText}>{displayName.slice(0, 2).toUpperCase()}</Text>
          </View>
        )}
      </View>
      <View style={styles.resultMeta}>
        <Text style={styles.resultName} numberOfLines={1}>{displayName}</Text>
        <Text style={styles.resultSub} numberOfLines={1}>
          {TYPE_LABEL[type] || 'CONTEÚDO'}{groupClean ? ` · ${groupClean}` : ''}
        </Text>
      </View>
      <Ionicons name="play-circle-outline" size={22} color={colors.text3} />
    </TVFocusable>
  );
}

export default function TVSearchContent({ query, onQueryChange, results, onResultPress }: Props) {
  const inputRef = useRef<TextInput>(null);
  const hasResults = results.length > 0;
  const isEmpty = query.trim() === '';

  return (
    <View style={styles.root}>
      {/* Left panel: search input + pulsing animation */}
      <View style={styles.leftPanel}>
        {/* Search input */}
        <View style={styles.inputWrap}>
          <Ionicons name="search-outline" size={18} color={colors.text3} style={styles.inputIcon} />
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={onQueryChange}
            placeholder="Buscar canais, filmes, séries..."
            placeholderTextColor={colors.text3}
            style={styles.input}
            autoFocus
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TVFocusable onPress={() => onQueryChange('')} style={styles.clearBtn}>
              <Ionicons name="close-circle" size={16} color={colors.text3} />
            </TVFocusable>
          )}
        </View>

        {/* Pulsing animation area */}
        <View style={styles.animArea}>
          {isEmpty ? (
            <>
              <PulsingRings />
              <Text style={styles.promptText}>Falar agora ou digitar</Text>
              <Text style={styles.promptSub}>Busque canais, filmes e séries</Text>
            </>
          ) : hasResults ? (
            <View style={styles.statsBlock}>
              <Text style={styles.statsCount}>{results.length}</Text>
              <Text style={styles.statsLabel}>resultados encontrados</Text>
            </View>
          ) : (
            <View style={styles.noResults}>
              <Ionicons name="search-outline" size={40} color={colors.text3} />
              <Text style={styles.noResultsText}>Nenhum resultado para "{query}"</Text>
            </View>
          )}
        </View>
      </View>

      {/* Right panel: results list */}
      <View style={styles.rightPanel}>
        {hasResults && (
          <>
            <Text style={styles.resultsHeader}>
              {results.length} RESULTADO{results.length !== 1 ? 'S' : ''}
            </Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {results.map(ch => (
                <ResultItem
                  key={ch.id}
                  channel={ch}
                  onPress={() => onResultPress(ch)}
                />
              ))}
            </ScrollView>
          </>
        )}

        {isEmpty && (
          <View style={styles.suggestions}>
            <Text style={styles.suggestionsTitle}>Sugestões</Text>
            {['Ao Vivo', 'Filmes', 'Séries', 'Lançamentos 2026'].map((s, i) => (
              <TVFocusable
                key={s}
                onPress={() => onQueryChange(s)}
                style={styles.suggestionItem}
                hasTVPreferredFocus={i === 0}
              >
                <Ionicons name="trending-up-outline" size={14} color={colors.text3} />
                <Text style={styles.suggestionText}>{s}</Text>
              </TVFocusable>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
    paddingTop: 88, // clear TVTopBar
  },

  // Left panel
  leftPanel: {
    width: '45%',
    borderRightWidth: 1,
    borderRightColor: colors.border,
    paddingHorizontal: spacing.xxxl,
    paddingTop: spacing.xl,
    gap: spacing.xl,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    height: 48,
    gap: 10,
  },
  inputIcon: {},
  input: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.text1,
    height: '100%',
  },
  clearBtn: {
    padding: 4,
  },
  animArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  promptText: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text1,
    letterSpacing: -0.3,
  },
  promptSub: {
    fontSize: fontSize.sm,
    color: colors.text3,
  },
  statsBlock: {
    alignItems: 'center',
    gap: 4,
  },
  statsCount: {
    fontSize: 64,
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: -2,
  },
  statsLabel: {
    fontSize: fontSize.sm,
    color: colors.text3,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  noResults: {
    alignItems: 'center',
    gap: spacing.md,
  },
  noResultsText: {
    fontSize: fontSize.sm,
    color: colors.text3,
    textAlign: 'center',
  },

  // Right panel
  rightPanel: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
  },
  resultsHeader: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.text3,
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  resultThumb: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.bg2,
  },
  resultThumbImg: { width: '100%', height: '100%' },
  resultThumbFallback: {
    width: '100%', height: '100%',
    alignItems: 'center', justifyContent: 'center',
  },
  resultThumbText: {
    fontSize: 12, fontWeight: '700', color: colors.text3,
  },
  resultMeta: { flex: 1 },
  resultName: {
    fontSize: fontSize.sm, fontWeight: '600', color: colors.text1,
  },
  resultSub: {
    fontSize: 10, color: colors.text3, marginTop: 2,
  },

  // Suggestions
  suggestions: {
    gap: spacing.sm,
  },
  suggestionsTitle: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.text3,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.md,
  },
  suggestionText: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.text2,
  },
});
