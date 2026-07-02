// TVSearchContent.tsx — TV search UI, two-panel layout
import React, { useRef } from 'react';
import {
  View, Text, StyleSheet, TextInput, ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Channel } from '../types';
import TVFocusable from './TVFocusable';
import { colors, spacing, fontSize, radius } from '../utils/theme';
import { resolveContentType, getSeriesBaseName } from '../utils/channelUtils';
import { SearchType } from '../utils/search';

interface Props {
  query: string;
  onQueryChange: (q: string) => void;
  results: Channel[];
  onResultPress: (channel: Channel) => void;
  searchType: SearchType;
  onSearchTypeChange: (t: SearchType) => void;
  recent: string[];
  onRecentPress: (q: string) => void;
  onClearRecent: () => void;
}

const TYPE_LABEL: Record<string, string> = {
  live: 'CANAL', movies: 'FILME', series: 'SÉRIE',
};

const TYPE_FILTERS: { key: SearchType; label: string }[] = [
  { key: 'all',    label: 'Tudo'    },
  { key: 'movies', label: 'Filmes'  },
  { key: 'series', label: 'Séries'  },
  { key: 'live',   label: 'Ao Vivo' },
];

const SUGGESTIONS = ['Ao Vivo', 'Filmes', 'Séries', 'Lançamentos 2026'];

function ResultItem({ channel, onPress }: { channel: Channel; onPress: () => void }) {
  const type = resolveContentType(channel);
  const displayName = type === 'series' ? getSeriesBaseName(channel.name) : channel.name;
  const groupClean = channel.group?.replace(/[♦◆️\uFE0F]\s*/g, '').trim() || '';

  return (
    <TVFocusable onPress={onPress} style={styles.resultItem}>
      <View style={styles.resultThumb}>
        {channel.logo ? (
          <Image source={channel.logo} style={styles.resultThumbImg} contentFit="contain" transition={0} recyclingKey={channel.id} />
        ) : (
          <View style={styles.resultThumbFallback}>
            <Text style={styles.resultThumbText}>{displayName.slice(0, 2).toUpperCase()}</Text>
          </View>
        )}
      </View>
      <View style={styles.resultMeta}>
        <Text style={styles.resultType}>{TYPE_LABEL[type] || 'CONTEÚDO'}</Text>
        <Text style={styles.resultName} numberOfLines={1}>{displayName}</Text>
        {groupClean ? <Text style={styles.resultSub} numberOfLines={1}>{groupClean}</Text> : null}
      </View>
      <Ionicons name="play-circle-outline" size={22} color={colors.text3} />
    </TVFocusable>
  );
}

export default function TVSearchContent({
  query, onQueryChange, results, onResultPress,
  searchType, onSearchTypeChange, recent, onRecentPress, onClearRecent,
}: Props) {
  const inputRef = useRef<TextInput>(null);
  const hasResults = results.length > 0;
  const isEmpty = query.trim() === '';

  return (
    <View style={styles.root}>
      {/* Left panel: input + state */}
      <View style={styles.leftPanel}>
        <Text style={styles.panelTitle}>Buscar</Text>

        <TVFocusable
          hasTVPreferredFocus
          onPress={() => inputRef.current?.focus()}
          style={styles.inputWrapFocusable}
          borderRadius={radius.lg}
        >
          <View style={styles.inputWrap}>
            <Ionicons name="search-outline" size={18} color={colors.text3} />
            <TextInput
              ref={inputRef}
              value={query}
              onChangeText={onQueryChange}
              placeholder="Canais, filmes, séries..."
              placeholderTextColor={colors.text3}
              style={styles.input}
              returnKeyType="search"
              {...({ focusable: false } as any)}
            />
            {query.length > 0 && (
              <Ionicons name="close-circle" size={16} color={colors.text3} onPress={() => onQueryChange('')} />
            )}
          </View>
        </TVFocusable>

        {/* Filtros de tipo */}
        <View style={styles.filterRow}>
          {TYPE_FILTERS.map(f => {
            const active = searchType === f.key;
            return (
              <TVFocusable
                key={f.key}
                onPress={() => onSearchTypeChange(f.key)}
                style={[styles.filterChip, active && styles.filterChipActive]}
                focusScale={1}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{f.label}</Text>
              </TVFocusable>
            );
          })}
        </View>

        <View style={styles.stateArea}>
          {isEmpty ? (
            <>
              <Ionicons name="search" size={44} color={colors.text3} style={{ opacity: 0.4 }} />
              <Text style={styles.stateTitle}>Busque por canais</Text>
              <Text style={styles.stateSub}>Digite o nome ou categoria</Text>
            </>
          ) : hasResults ? (
            <>
              <Text style={styles.statsCount}>{results.length}</Text>
              <Text style={styles.statsLabel}>resultado{results.length !== 1 ? 's' : ''} encontrado{results.length !== 1 ? 's' : ''}</Text>
            </>
          ) : (
            <>
              <Ionicons name="alert-circle-outline" size={44} color={colors.text3} style={{ opacity: 0.4 }} />
              <Text style={styles.stateTitle}>Sem resultados</Text>
              <Text style={styles.stateSub}>Tente outro termo de busca</Text>
            </>
          )}
        </View>
      </View>

      {/* Right panel: suggestions or results */}
      <View style={styles.rightPanel}>
        {isEmpty ? (
          <>
            {recent.length > 0 && (
              <>
                <View style={styles.recentHeaderRow}>
                  <Text style={styles.sectionLabel}>BUSCAS RECENTES</Text>
                  <TVFocusable onPress={onClearRecent} focusScale={1}>
                    <Text style={styles.recentClear}>Limpar</Text>
                  </TVFocusable>
                </View>
                {recent.map((q) => (
                  <TVFocusable key={q} onPress={() => onRecentPress(q)} style={styles.suggestionItem}>
                    <Ionicons name="time-outline" size={14} color={colors.text3} />
                    <Text style={styles.suggestionText} numberOfLines={1}>{q}</Text>
                  </TVFocusable>
                ))}
              </>
            )}
            <Text style={[styles.sectionLabel, recent.length > 0 && { marginTop: spacing.lg }]}>SUGESTÕES</Text>
            {SUGGESTIONS.map((s) => (
              <TVFocusable
                key={s}
                onPress={() => onQueryChange(s)}
                style={styles.suggestionItem}
              >
                <Ionicons name="trending-up-outline" size={14} color={colors.text3} />
                <Text style={styles.suggestionText}>{s}</Text>
              </TVFocusable>
            ))}
          </>
        ) : hasResults ? (
          <>
            <Text style={styles.sectionLabel}>
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
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
    paddingTop: 72,
  },

  // Left panel
  leftPanel: {
    width: '40%',
    borderRightWidth: 1,
    borderRightColor: colors.border,
    paddingHorizontal: spacing.xxxl,
    paddingTop: spacing.xl,
    gap: spacing.lg,
  },
  panelTitle: {
    fontSize: 28,
    fontWeight: '600',
    color: colors.text1,
    letterSpacing: -0.6,
  },
  inputWrapFocusable: {
    borderRadius: radius.lg,
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
  input: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.text1,
    height: '100%',
  },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterChip: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 999, backgroundColor: colors.bg1,
    borderWidth: 1, borderColor: colors.border,
  },
  filterChipActive: { backgroundColor: colors.text1, borderColor: colors.text1 },
  filterChipText: { fontSize: fontSize.sm, fontWeight: '500', color: colors.text1 },
  filterChipTextActive: { color: colors.textInverse, fontWeight: '600' },
  recentHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  recentClear: { fontSize: fontSize.xs, color: colors.accent, fontWeight: '500' },
  stateArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  stateTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text1,
    marginTop: spacing.sm,
  },
  stateSub: {
    fontSize: fontSize.xs,
    color: colors.text3,
    textAlign: 'center',
  },
  statsCount: {
    fontSize: 72,
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: -2,
    lineHeight: 78,
  },
  statsLabel: {
    fontSize: fontSize.xs,
    color: colors.text3,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },

  // Right panel
  rightPanel: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.text3,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },

  // Result items
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
  resultThumbText: { fontSize: 12, fontWeight: '700', color: colors.text3 },
  resultMeta: { flex: 1 },
  resultType: { fontSize: 9, color: colors.text3, letterSpacing: 0.6, fontWeight: '600' },
  resultName: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text1, marginTop: 1 },
  resultSub: { fontSize: 10, color: colors.text3, marginTop: 2 },

  // Suggestions
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  suggestionText: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.text2,
  },
});
