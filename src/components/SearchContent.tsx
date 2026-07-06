import React from 'react';
import {
  View, Text, StyleSheet, TextInput,
  ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Channel } from '../types';
import TVFocusable from './TVFocusable';
import { colors, spacing, fontSize, radius, UI_FONT_SCALE } from '../utils/theme';
import { getSeriesBaseName, cleanGroupName } from '../utils/channelUtils';
import { resolveChannelType, useStore } from '../store/useStore';
import { SearchType } from '../utils/search';
import { IS_TV } from '../utils/tvDetect';

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
  genreOptions: string[];
  filterGenre: string | null;
  onFilterGenreChange: (g: string | null) => void;
  yearOptions: string[];
  filterYear: string | null;
  onFilterYearChange: (y: string | null) => void;
  qualityOptions: string[];
  filterQuality: string | null;
  onFilterQualityChange: (q: string | null) => void;
}

/** Linha de chips de filtro reutilizada pra gênero/ano/qualidade — clicar de novo
 *  no já ativo desmarca (volta pra "todos"). */
function FilterChipsRow({ options, value, onChange }: {
  options: string[]; value: string | null; onChange: (v: string | null) => void;
}) {
  if (options.length === 0) return null;
  return (
    <ScrollView
      horizontal showsHorizontalScrollIndicator={false}
      style={styles.filterScroll} contentContainerStyle={styles.filterRow}
      keyboardShouldPersistTaps="handled"
    >
      {options.map(opt => {
        const active = value === opt;
        return (
          <TVFocusable
            key={opt}
            onPress={() => onChange(active ? null : opt)}
            style={[styles.filterChip, active && styles.filterChipActive]}
          >
            <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{opt}</Text>
          </TVFocusable>
        );
      })}
    </ScrollView>
  );
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

function ResultRow({ channel, onPress }: { channel: Channel; onPress: () => void }) {
  const scale = useStore(s => UI_FONT_SCALE[s.settings.uiFontScale]);
  const type = resolveChannelType(channel);
  const displayName = type === 'series' ? getSeriesBaseName(channel.name) : channel.name;
  const groupClean = channel.group ? cleanGroupName(channel.group) : '';

  return (
    <TVFocusable onPress={onPress} style={rowStyles.row}>
      <View style={rowStyles.thumb}>
        {channel.logo ? (
          <Image source={channel.logo} style={rowStyles.thumbImg} contentFit="cover" transition={0} recyclingKey={channel.id} />
        ) : (
          <View style={rowStyles.thumbFallback}>
            <Text style={rowStyles.thumbInitials}>{displayName.slice(0, 2).toUpperCase()}</Text>
          </View>
        )}
      </View>
      <View style={rowStyles.info}>
        <Text style={rowStyles.typeLabel}>{TYPE_LABEL[type] ?? 'ITEM'}</Text>
        <Text style={[rowStyles.name, { fontSize: 14 * scale }]} numberOfLines={1}>{displayName}</Text>
        {groupClean ? <Text style={[rowStyles.sub, { fontSize: 11 * scale }]} numberOfLines={1}>{groupClean}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={14} color={colors.text3} />
    </TVFocusable>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center',
    gap: 12, paddingVertical: 11,
    paddingHorizontal: IS_TV ? spacing.xxxl : 22,
    borderBottomWidth: 1, borderBottomColor: colors.borderSoft,
  },
  thumb: {
    width: 44, height: 44, borderRadius: 8,
    overflow: 'hidden', backgroundColor: colors.bg2, flexShrink: 0,
  },
  thumbImg: { width: '100%', height: '100%' },
  thumbFallback: {
    width: '100%', height: '100%',
    alignItems: 'center', justifyContent: 'center',
  },
  thumbInitials: { fontSize: 13, fontWeight: '700', color: colors.accent },
  info: { flex: 1, minWidth: 0 },
  typeLabel: {
    fontSize: 9, color: colors.text3,
    letterSpacing: 0.6, textTransform: 'uppercase',
    fontWeight: '500',
  },
  name: { fontSize: 14, fontWeight: '500', color: colors.text1, marginTop: 1 },
  sub: { fontSize: 11, color: colors.text2, marginTop: 1 },
});

function BestMatch({ channel, onPress }: { channel: Channel; onPress: () => void }) {
  const scale = useStore(s => UI_FONT_SCALE[s.settings.uiFontScale]);
  const type = resolveChannelType(channel);
  const displayName = type === 'series' ? getSeriesBaseName(channel.name) : channel.name;
  const groupClean = channel.group ? cleanGroupName(channel.group) : '';

  return (
    <View style={bmStyles.wrap}>
      <Text style={bmStyles.sectionLabel}>MELHOR RESULTADO</Text>
      <TVFocusable onPress={onPress} style={bmStyles.card}>
        <View style={bmStyles.poster}>
          {channel.logo ? (
            <Image source={channel.logo} style={bmStyles.posterImg} contentFit="cover" transition={0} recyclingKey={channel.id} />
          ) : (
            <View style={bmStyles.posterFallback}>
              <Text style={bmStyles.posterInitials}>{displayName.slice(0, 3).toUpperCase()}</Text>
            </View>
          )}
        </View>
        <View style={bmStyles.info}>
          <Text style={[bmStyles.name, { fontSize: 15 * scale }]} numberOfLines={2}>{displayName}</Text>
          <Text style={[bmStyles.meta, { fontSize: 11 * scale }]}>{TYPE_LABEL[type] ?? 'ITEM'} · {groupClean || channel.quality || 'HD'}</Text>
          <View style={bmStyles.playBtn}>
            <Ionicons name="play" size={11} color={colors.white} />
            <Text style={bmStyles.playText}>Assistir</Text>
          </View>
        </View>
      </TVFocusable>
    </View>
  );
}

const bmStyles = StyleSheet.create({
  wrap: { paddingHorizontal: IS_TV ? spacing.xxxl : 22, paddingBottom: 16 },
  sectionLabel: {
    fontSize: 10, color: colors.text3,
    letterSpacing: 0.6, textTransform: 'uppercase',
    fontWeight: '500', marginBottom: 10,
  },
  card: {
    flexDirection: 'row', gap: 12,
    padding: 12, backgroundColor: colors.bg1,
    borderRadius: 12, borderWidth: 1, borderColor: colors.border,
  },
  poster: {
    width: 62, height: 92, borderRadius: 8,
    overflow: 'hidden', backgroundColor: colors.bg3, flexShrink: 0,
  },
  posterImg: { width: '100%', height: '100%' },
  posterFallback: {
    width: '100%', height: '100%',
    alignItems: 'center', justifyContent: 'center',
  },
  posterInitials: { fontSize: 14, fontWeight: '800', color: colors.accent, opacity: 0.6 },
  info: { flex: 1, minWidth: 0, justifyContent: 'center', gap: 4 },
  name: { fontSize: 15, fontWeight: '600', color: colors.text1 },
  meta: { fontSize: 11, color: colors.text2 },
  playBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start', marginTop: 6,
    backgroundColor: colors.accent, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  playText: { fontSize: 11, fontWeight: '600', color: colors.white },
});

export default function SearchContent({
  query, onQueryChange, results, onResultPress,
  searchType, onSearchTypeChange, recent, onRecentPress, onClearRecent,
  genreOptions, filterGenre, onFilterGenreChange,
  yearOptions, filterYear, onFilterYearChange,
  qualityOptions, filterQuality, onFilterQualityChange,
}: Props) {
  const otherResults = results.slice(1);

  return (
    <View style={{ flex: 1 }}>
      {/* Search bar */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={20} color={colors.text3} />
        <TextInput
          style={styles.input}
          placeholder="Buscar canais, filmes, séries..."
          placeholderTextColor={colors.text3}
          value={query}
          onChangeText={onQueryChange}
          autoFocus
        />
        {query.length > 0 && (
          <TVFocusable onPress={() => onQueryChange('')}>
            <Ionicons name="close-circle" size={20} color={colors.text3} />
          </TVFocusable>
        )}
      </View>

      {/* Type filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterRow}
        keyboardShouldPersistTaps="handled"
      >
        {TYPE_FILTERS.map(f => {
          const active = searchType === f.key;
          return (
            <TVFocusable
              key={f.key}
              onPress={() => onSearchTypeChange(f.key)}
              style={[styles.filterChip, active && styles.filterChipActive]}
            >
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{f.label}</Text>
            </TVFocusable>
          );
        })}
      </ScrollView>

      {/* Filtros combinados — só fazem sentido com uma busca ativa */}
      {query.trim() !== '' && (
        <>
          <FilterChipsRow options={genreOptions} value={filterGenre} onChange={onFilterGenreChange} />
          <FilterChipsRow options={yearOptions} value={filterYear} onChange={onFilterYearChange} />
          <FilterChipsRow options={qualityOptions} value={filterQuality} onChange={onFilterQualityChange} />
        </>
      )}

      {/* Result count */}
      {results.length > 0 && (
        <Text style={styles.countLabel}>
          {results.length} RESULTADO{results.length !== 1 ? 'S' : ''} · CANAIS, FILMES, SÉRIES
        </Text>
      )}

      {/* States */}
      {query.trim() === '' ? (
        recent.length > 0 ? (
          <ScrollView
            style={{ flex: 1 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.recentHeader}>
              <Text style={styles.recentTitle}>BUSCAS RECENTES</Text>
              <TVFocusable onPress={onClearRecent}>
                <Text style={styles.recentClear}>Limpar</Text>
              </TVFocusable>
            </View>
            {recent.map(q => (
              <TVFocusable key={q} onPress={() => onRecentPress(q)} style={styles.recentRow}>
                <Ionicons name="time-outline" size={16} color={colors.text3} />
                <Text style={styles.recentText} numberOfLines={1}>{q}</Text>
                <Ionicons name="arrow-up-outline" size={14} color={colors.text3} style={{ transform: [{ rotate: '45deg' }] }} />
              </TVFocusable>
            ))}
          </ScrollView>
        ) : (
          <View style={styles.empty}>
            <Ionicons name="search" size={48} color={colors.text3} />
            <Text style={styles.emptyTitle}>Digite para buscar</Text>
            <Text style={styles.emptySub}>Pesquise em toda a sua lista</Text>
          </View>
        )
      ) : results.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.text3} />
          <Text style={styles.emptyTitle}>Sem resultados para "{query}"</Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Best match */}
          <BestMatch channel={results[0]} onPress={() => onResultPress(results[0])} />

          {/* Other results */}
          {otherResults.length > 0 && (
            <View>
              <Text style={styles.othersLabel}>OUTROS RESULTADOS</Text>
              {otherResults.map(ch => (
                <ResultRow key={ch.id + ch.name} channel={ch} onPress={() => onResultPress(ch)} />
              ))}
            </View>
          )}

          <View style={{ height: 80 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    margin: IS_TV ? spacing.xxxl : spacing.lg,
    marginBottom: IS_TV ? spacing.lg : spacing.sm,
    backgroundColor: colors.bg1, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 16, paddingVertical: 12,
  },
  input: { flex: 1, color: colors.text1, fontSize: fontSize.md },
  filterScroll: { flexGrow: 0, flexShrink: 0, marginBottom: 12 },
  filterRow: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: IS_TV ? spacing.xxxl : 22,
  },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 999, backgroundColor: colors.bg1,
    borderWidth: 1, borderColor: colors.border,
  },
  filterChipActive: { backgroundColor: colors.text1, borderColor: colors.text1 },
  filterChipText: { fontSize: 12, fontWeight: '500', color: colors.text1 },
  filterChipTextActive: { color: colors.textInverse, fontWeight: '600' },
  recentHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: IS_TV ? spacing.xxxl : 22,
    marginBottom: 6,
  },
  recentTitle: {
    fontSize: 10, color: colors.text3, letterSpacing: 0.6,
    textTransform: 'uppercase', fontWeight: '500',
  },
  recentClear: { fontSize: 12, color: colors.accent, fontWeight: '500' },
  recentRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12,
    paddingHorizontal: IS_TV ? spacing.xxxl : 22,
    borderBottomWidth: 1, borderBottomColor: colors.borderSoft,
  },
  recentText: { flex: 1, fontSize: 14, color: colors.text1 },
  countLabel: {
    fontSize: 10, color: colors.text3,
    letterSpacing: 0.4, textTransform: 'uppercase',
    fontWeight: '500',
    paddingHorizontal: IS_TV ? spacing.xxxl : 22,
    marginBottom: 14,
  },
  othersLabel: {
    fontSize: 10, color: colors.text3,
    letterSpacing: 0.6, textTransform: 'uppercase',
    fontWeight: '500',
    paddingHorizontal: IS_TV ? spacing.xxxl : 22,
    marginBottom: 4, marginTop: 4,
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingTop: 80 },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text1, textAlign: 'center' },
  emptySub: { fontSize: fontSize.sm, color: colors.text3 },
});
