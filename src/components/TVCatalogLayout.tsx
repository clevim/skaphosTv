// TVCatalogLayout.tsx — Two-panel TV browse layout: left sidebar + right grid
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import TVFocusable from './TVFocusable';
import { colors, spacing, fontSize, radius } from '../utils/theme';
import { cleanGroupName } from '../utils/channelUtils';

interface Props {
  title: string;
  count: number;
  groups: string[];
  selectedGroup: string | null;
  onGroupSelect: (g: string | null) => void;
  onReload?: () => void;
  /** "Estou com sorte": abre uma mídia aleatória da subcategoria atual. */
  onRandom?: () => void;
  /** Cicla o modo de ordenação (Padrão → A-Z → Mais assistido). */
  onSort?: () => void;
  sortIcon?: string;
  /** Rótulo do critério atual, sempre visível no botão de ordenar. */
  sortLabel?: string;
  children: React.ReactNode;
}

export default function TVCatalogLayout({
  title, count, groups, selectedGroup, onGroupSelect, onReload, onRandom, onSort, sortIcon, sortLabel, children,
}: Props) {
  // Trocar de aba (title muda) deixava a lista de subcategorias rolada no meio.
  const listRef = useRef<FlatList<string>>(null);
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [title]);
  return (
    <View style={styles.root}>
      {/* Left sidebar */}
      <View style={styles.sidebar}>
        <View style={styles.sidebarHeader}>
          <Text style={styles.sidebarTitle} numberOfLines={1} adjustsFontSizeToFit>{title}</Text>
          <Text style={styles.sidebarCount} numberOfLines={1}>{count} itens</Text>
          <View style={styles.headerActions}>
            {onSort && (
              // Rótulo visível: o ícone sozinho (antes uma estrela) parecia "favoritar".
              <TVFocusable
                accessibilityLabel={`Ordenar: ${sortLabel ?? 'Padrão'}`}
                onPress={onSort}
                style={styles.sortBtn}
                borderRadius={8}
              >
                <Ionicons name={(sortIcon ?? 'swap-vertical-outline') as any} size={14} color={colors.accent} />
                <Text style={styles.sortText} numberOfLines={1}>{sortLabel ?? 'Ordenar'}</Text>
              </TVFocusable>
            )}
            {onRandom && (
              <TVFocusable accessibilityLabel="Item aleatório" onPress={onRandom} style={styles.reloadBtn} borderRadius={8}>
                <Ionicons name="dice-outline" size={16} color={colors.accent} />
              </TVFocusable>
            )}
            {onReload && (
              <TVFocusable accessibilityLabel="Recarregar" onPress={onReload} style={styles.reloadBtn} borderRadius={8}>
                <Ionicons name="refresh-outline" size={16} color={colors.text2} />
              </TVFocusable>
            )}
          </View>
        </View>
        {/*
          * VIRTUALIZADA. Era um ScrollView com `groups.map()` — TODA categoria
          * do painel montada de uma vez. Um Xtream comum traz de 200 a 600
          * categorias, e cada uma aqui é uma view nativa + uma entrada no mapa
          * de foco + um Animated.Value + um post na UI thread (watchView). Isso
          * era pago inteiro a cada entrada em Ao Vivo/Filmes/Séries, dentro da
          * transição de tela — a grade ao lado já era virtualizada, a sidebar não.
          *
          * Sem getItemLayout de propósito: o nome quebra em até 2 linhas, então
          * a altura varia por item e uma tabela fixa erraria os offsets (mesma
          * decisão da lista de seções da Home).
          */}
        <FlatList
          ref={listRef}
          data={groups}
          keyExtractor={g => g}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.sidebarList}
          // Redesenha os dois itens que trocam de estado ao mudar a seleção.
          extraData={selectedGroup}
          ListHeaderComponent={
            <TVFocusable
              onPress={() => onGroupSelect(null)}
              style={[styles.groupItem, !selectedGroup && styles.groupItemActive]}
            >
              <Text
                style={[styles.groupName, !selectedGroup && styles.groupNameActive]}
                numberOfLines={2}
              >
                Todos
              </Text>
            </TVFocusable>
          }
          renderItem={({ item: g }) => {
            const isActive = selectedGroup === g;
            return (
              <TVFocusable
                onPress={() => onGroupSelect(isActive ? null : g)}
                style={[styles.groupItem, isActive && styles.groupItemActive]}
              >
                <Text
                  style={[styles.groupName, isActive && styles.groupNameActive]}
                  numberOfLines={2}
                >
                  {cleanGroupName(g)}
                </Text>
              </TVFocusable>
            );
          }}
          // Preenche a coluna inteira no primeiro frame: a sidebar tem ~600px de
          // altura útil e o item ~40px, então nasce sem buraco visível.
          initialNumToRender={16}
          maxToRenderPerBatch={8}
          updateCellsBatchingPeriod={50}
          windowSize={5}
          // Clipar destruiria a view nativa do item focado, e o foco vai junto.
          removeClippedSubviews={false}
        />
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Right content area */}
      <View style={styles.content}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
    paddingTop: 72, // space for absolute TVTopBar (14px vertical + ~14px text + 14px = ~72px)
  },

  // Sidebar
  sidebar: {
    width: 240,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    // minHeight:0 é OBRIGATÓRIO aqui para o ScrollView filho conseguir rolar no web:
    // por padrão CSS, um item flex não encolhe abaixo do tamanho do seu CONTEÚDO
    // (min-height:auto), então a lista de subcategorias cresce e empurra a tela
    // ao invés de rolar internamente. O Yoga (motor nativo) não tem essa regra —
    // por isso funcionava normal na TV/Android e só quebrava no web.
    minHeight: 0,
  },
  sidebarHeader: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  headerActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  sortBtn: {
    flex: 1, height: 32, borderRadius: 8, paddingHorizontal: 8,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.border,
  },
  sortText: { flex: 1, fontSize: 11, fontWeight: '600', color: colors.text2 },
  reloadBtn: {
    width: 32, height: 32,
    borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.bg2,
    borderWidth: 1, borderColor: colors.border,
  },
  sidebarTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text1,
    letterSpacing: -0.5,
  },
  sidebarCount: {
    fontSize: 11,
    color: colors.text3,
    marginTop: 3,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  sidebarList: {
    paddingTop: spacing.sm,
    // Folga inferior: a barra de dicas flutua sobre o rodapé e cortava o último item.
    paddingBottom: 96,
    paddingHorizontal: spacing.md,
    gap: 2,
  },

  groupItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.md,
  },
  groupItemActive: {
    backgroundColor: colors.accentSoft,
  },
  groupName: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.text2,
    lineHeight: 18,
  },
  groupNameActive: {
    color: colors.accent,
    fontWeight: '600',
  },

  divider: {
    width: 1,
    backgroundColor: colors.border,
  },

  // Content
  content: {
    flex: 1,
    // Mesma razão do sidebar acima: sem minHeight:0 o grid de cards (FlatList)
    // não rola no web — o container tenta crescer para caber o conteúdo
    // virtualizado inteiro (centenas de milhares de px em listas grandes).
    minHeight: 0,
  },
});
