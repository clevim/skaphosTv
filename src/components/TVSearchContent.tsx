// TVSearchContent.tsx — TV search UI, two-panel layout
import React, { memo, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, TextInput, FlatList,
} from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Channel } from '../types';
import TVFocusable from './TVFocusable';
import { colors, spacing, fontSize, radius, fontFamily, UI_FONT_SCALE } from '../utils/theme';
import { getSeriesBaseName, cleanGroupName, LAUNCH_YEAR } from '../utils/channelUtils';
import { resolveChannelType, useStore } from '../store/useStore';
import { SearchType, useSearchPending } from '../utils/search';
import { SkSectionHeader } from './sk';
import { useAccentColors, withAlpha } from '../hooks/useAccentColors';

/** Estilos de chip no acento do tema: selecionado = tinta + borda acento; FOCADO = fundo
 *  mais forte (o anel vem do TVFocusable) — focado != selecionado. */
function useChipStyles() {
  const ac = useAccentColors();
  return useMemo(() => ({
    // Ativo = acento suave (estado); foco = clareado neutro + anel (igual ao resto do app).
    active: { backgroundColor: withAlpha(ac.accent, 0.14), borderColor: 'transparent' },
    focus: { backgroundColor: 'rgba(255,255,255,0.12)' },
    activeText: { color: ac.accent2 },
  }), [ac]);
}


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

/** Linha de chips (wrap) reutilizada pra gênero/ano/qualidade — clicar de novo
 *  no já ativo desmarca (volta pra "todos"). */
function FilterChipsRow({ options, value, onChange }: {
  options: string[]; value: string | null; onChange: (v: string | null) => void;
}) {
  const cs = useChipStyles();
  if (options.length === 0) return null;
  return (
    <View style={styles.filterRow}>
      {options.map(opt => {
        const active = value === opt;
        return (
          <TVFocusable
            key={opt}
            onPress={() => onChange(active ? null : opt)}
            style={[styles.filterChip, active && cs.active]}
            focusStyle={cs.focus}
            focusScale={1}
          >
            <Text style={[styles.filterChipText, active && cs.activeText, active && styles.filterChipTextActive]} numberOfLines={1}>{opt}</Text>
          </TVFocusable>
        );
      })}
    </View>
  );
}

const TYPE_LABEL: Record<string, string> = {
  live: 'Canal', movies: 'Filme', series: 'Série',
};

const TYPE_FILTERS: { key: SearchType; label: string }[] = [
  { key: 'all',    label: 'Tudo'    },
  { key: 'movies', label: 'Filmes'  },
  { key: 'series', label: 'Séries'  },
  { key: 'live',   label: 'Ao Vivo' },
];

const SUGGESTIONS = ['Ao Vivo', 'Filmes', 'Séries', `Lançamentos ${LAUNCH_YEAR}`];

// memo + onPress estável (recebe o canal): antes cada render do painel (a cada
// tecla/foco de filtro) re-renderizava TODAS as linhas montadas, pois a arrow
// inline `() => onResultPress(item)` nascia nova por item.
const ResultItem = memo(function ResultItem({ channel, onPress, preferred }: {
  channel: Channel; onPress: (c: Channel) => void; preferred?: boolean;
}) {
  const handlePress = useCallback(() => onPress(channel), [onPress, channel]);
  const scale = useStore(s => UI_FONT_SCALE[s.settings.uiFontScale]);
  const ac = useAccentColors();
  const type = resolveChannelType(channel);
  const displayName = type === 'series' ? getSeriesBaseName(channel.name) : channel.name;
  const groupClean = channel.group ? cleanGroupName(channel.group) : '';

  return (
    <TVFocusable onPress={handlePress} style={styles.resultItem} hasTVPreferredFocus={preferred}>
      <View style={styles.resultThumb}>
        {channel.logo ? (
          <Image source={channel.logo} style={styles.resultThumbImg} contentFit="contain" transition={0} cachePolicy="memory-disk" recyclingKey={channel.id} />
        ) : (
          <View style={styles.resultThumbFallback}>
            <Text style={styles.resultThumbText}>{displayName.slice(0, 2).toUpperCase()}</Text>
          </View>
        )}
      </View>
      <View style={styles.resultMeta}>
        <Text style={[styles.resultName, { fontSize: fontSize.sm * scale }]} numberOfLines={1}>{displayName}</Text>
        <Text style={[styles.resultSub, { fontSize: fontSize.xs * scale }]} numberOfLines={1}>
          <Text style={styles.resultType}>{TYPE_LABEL[type] || 'Item'}</Text>
          {groupClean ? `  ·  ${groupClean}` : ''}
        </Text>
      </View>
      <Ionicons name="play-circle-outline" size={22} color={colors.text2} />
    </TVFocusable>
  );
});

export default function TVSearchContent({
  query, onQueryChange, results, onResultPress,
  searchType, onSearchTypeChange, recent, onRecentPress, onClearRecent,
  genreOptions, filterGenre, onFilterGenreChange,
  yearOptions, filterYear, onFilterYearChange,
  qualityOptions, filterQuality, onFilterQualityChange,
}: Props) {
  const inputRef = useRef<TextInput>(null);
  const cs = useChipStyles();
  const ac = useAccentColors();
  const hasResults = results.length > 0;
  const isEmpty = query.trim() === '';
  const pending = useSearchPending(query);

  // Escolher uma sugestão/busca recente DESMONTA a lista de sugestões (o painel
  // troca para os resultados) — o Android então joga o foco no primeiro focável
  // da tela, que é o campo de busca. Marcamos aqui e o primeiro resultado a
  // montar puxa o foco pra si, que é pra onde o usuário está olhando.
  const wantResultFocus = useRef(false);
  const pickQuery = (q: string) => { wantResultFocus.current = true; onQueryChange(q); };
  const takeResultFocus = () => {
    if (!wantResultFocus.current) return false;
    wantResultFocus.current = false;
    return true;
  };

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
                style={[styles.filterChip, active && cs.active]}
                focusStyle={cs.focus}
                focusScale={1}
              >
                <Text style={[styles.filterChipText, active && cs.activeText, active && styles.filterChipTextActive]}>{f.label}</Text>
              </TVFocusable>
            );
          })}
        </View>

        {/* Filtros combinados — só fazem sentido com uma busca ativa */}
        {!isEmpty && (
          <>
            <FilterChipsRow options={genreOptions} value={filterGenre} onChange={onFilterGenreChange} />
            <FilterChipsRow options={yearOptions} value={filterYear} onChange={onFilterYearChange} />
            <FilterChipsRow options={qualityOptions} value={filterQuality} onChange={onFilterQualityChange} />
          </>
        )}

        <View style={styles.stateArea}>
          {isEmpty ? (
            <>
              <Ionicons name="search" size={44} color={colors.text3} style={{ opacity: 0.4 }} />
              <Text style={styles.stateTitle}>{'Busque canais, filmes e séries'}</Text>
              <Text style={styles.stateSub}>digite o nome, categoria ou gênero</Text>
            </>
          ) : pending ? (
            <Text style={styles.stateSub}>{'Buscando…'}</Text>
          ) : null /* contagem já mora no título da lista à direita (sem "número herói") */}
        </View>
      </View>

      {/* Right panel: suggestions or results */}
      <View style={styles.rightPanel}>
        {isEmpty ? (
          <>
            {recent.length > 0 && (
              <>
                <View style={styles.recentHeaderRow}>
                  <SkSectionHeader title="buscas recentes" />
                  <TVFocusable onPress={onClearRecent} focusScale={1} style={{ marginLeft: 12 }}>
                    <Text style={styles.recentClear}>Limpar</Text>
                  </TVFocusable>
                </View>
                {recent.map((q) => (
                  <TVFocusable key={q} onPress={() => { wantResultFocus.current = true; onRecentPress(q); }} style={styles.suggestionItem}>
                    <Ionicons name="time-outline" size={14} color={colors.text3} />
                    <Text style={styles.suggestionText} numberOfLines={1}>{q}</Text>
                  </TVFocusable>
                ))}
              </>
            )}
            <View style={[styles.sectionLabel, recent.length > 0 && { marginTop: spacing.lg }]}>
              <SkSectionHeader title="sugestões" />
            </View>
            {SUGGESTIONS.map((s) => (
              <TVFocusable
                key={s}
                onPress={() => pickQuery(s)}
                style={styles.suggestionItem}
              >
                <Ionicons name="search-outline" size={14} color={colors.text3} />
                <Text style={styles.suggestionText}>{s}</Text>
              </TVFocusable>
            ))}
          </>
        ) : hasResults ? (
          <>
            <View style={styles.sectionLabel}>
              <SkSectionHeader title={`${results.length} resultado${results.length !== 1 ? 's' : ''}`} />
            </View>
            {/* Virtualizada: eram até 100 linhas montadas de uma vez, cada uma
                com imagem e listener de foco — caro demais pra uma Fire Stick.
                removeClippedSubviews FALSO porque clipar destrói a view nativa
                focada e o foco vai junto (mesma regra das fileiras da Home). */}
            <FlatList
              // flex + minHeight:0: a lista precisa de altura LIMITADA para
              // virtualizar (e, no web, para rolar dentro do painel em vez de
              // esticar o layout) — mesma regra do grid em TVCatalogLayout.
              style={{ flex: 1, minHeight: 0 }}
              data={results}
              keyExtractor={ch => ch.id}
              renderItem={({ item, index }) => (
                <ResultItem
                  channel={item}
                  onPress={onResultPress}
                  preferred={index === 0 && takeResultFocus()}
                />
              )}
              showsVerticalScrollIndicator={false}
              initialNumToRender={10}
              maxToRenderPerBatch={6}
              updateCellsBatchingPeriod={50}
              windowSize={5}
              removeClippedSubviews={false}
            />
          </>
        ) : (
          // Antes era null: o painel ficava em branco quando a busca não achava nada.
          <View style={styles.rightEmpty}>
            <Ionicons
              name={pending ? 'hourglass-outline' : 'alert-circle-outline'}
              size={56} color={colors.text3} style={{ opacity: 0.5 }}
            />
            <Text style={styles.rightEmptyTitle}>
              {pending ? 'Buscando…' : `Sem resultados para "${query.trim()}"`}
            </Text>
            {!pending && <Text style={styles.rightEmptySub}>tente outro termo ou limpe os filtros</Text>}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rightEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  rightEmptyTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.lg, fontWeight: '600', color: colors.text2, textAlign: 'center' },
  rightEmptySub: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.text3, textAlign: 'center' },
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
    fontFamily: fontFamily.semiBold,
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
  filterChipText: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, fontWeight: '500', color: colors.text1 },
  filterChipTextActive: { fontWeight: '700' },
  recentHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  recentClear: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xs, color: colors.text2 },
  stateArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  stateTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text1,
    marginTop: spacing.sm,
  },
  stateSub: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.text2,
    textAlign: 'center',
  },
  statsCount: {
    fontSize: 56,
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: -1.5,
    lineHeight: 62,
  },
  statsLabel: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.xs,
    color: colors.text2,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },

  // Right panel
  rightPanel: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
  },
  sectionLabel: { marginBottom: spacing.sm },

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
  resultType: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.text3 },
  resultName: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text1 },
  resultSub: { fontSize: fontSize.xs, color: colors.text2, marginTop: 2 },

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
