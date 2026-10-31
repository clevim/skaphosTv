// TVCatalogLayout.tsx — Two-panel TV browse layout: left sidebar + right grid
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import TVFocusable from './TVFocusable';
import { IS_NATIVE_TV } from '../utils/tvDetect';
import { colors, spacing, fontSize, radius, fontFamily } from '../utils/theme';
import { cleanGroupName } from '../utils/channelUtils';
import { useAccentColors } from '../hooks/useAccentColors';

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
  const { accent } = useAccentColors();
  const listRef = useRef<FlatList<string>>(null);
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [title]);
  return (
    <View style={styles.root}>
      {/* Sidebar = só navegação: título da categoria, UMA fileira de ferramentas e a lista.
          Ferramentas numa linha só deixam o D-pad previsível: ↓ de qualquer uma cai em
          "Todos", ↑ de "Todos" volta pra ferramenta de cima, ↑ das ferramentas sobe à barra
          (antes eram 2 linhas desalinhadas e ↓/↑ caíam em "Atualizar" em vez de "Sorte").
          Ordem fica no MEIO: o FocusFinder sobe de "Todos" pelo centro, e é ela que importa. */}
      <View style={styles.sidebar}>
        <View style={styles.sidebarHeader}>
          <Text style={styles.sidebarTitle} numberOfLines={1}>{title}</Text>
          <Text style={styles.sidebarCount} numberOfLines={1}>
            {`${count.toLocaleString('pt-BR')} ${count === 1 ? 'título' : 'títulos'}`}
          </Text>
          {(onSort || onRandom || onReload) && (
            <View style={styles.toolRow}>
              {onRandom && (
                <TVFocusable accessibilityLabel="Sortear um título" onPress={onRandom} style={styles.toolBtn} borderRadius={8}>
                  <Ionicons name="shuffle" size={16} color={colors.text2} />
                </TVFocusable>
              )}
              {onSort && (
                <TVFocusable
                  accessibilityLabel={`Ordenar: ${sortLabel ?? 'Padrão'}`}
                  onPress={onSort}
                  style={[styles.toolBtn, styles.sortBtn]}
                  borderRadius={8}
                >
                  <Ionicons name={(sortIcon ?? 'swap-vertical-outline') as any} size={14} color={colors.text2} />
                  <Text style={styles.toolText} numberOfLines={1}>{sortLabel ?? 'Padrão'}</Text>
                </TVFocusable>
              )}
              {onReload && (
                <TVFocusable accessibilityLabel="Recarregar catálogo" onPress={onReload} style={styles.toolBtn} borderRadius={8}>
                  <Ionicons name="refresh" size={15} color={colors.text2} />
                </TVFocusable>
              )}
            </View>
          )}
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
              style={styles.groupItem}
              focusScale={1}
            >
              <Text
                style={[styles.groupName, !selectedGroup && [styles.groupNameActive, { color: accent }]]}
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
                style={styles.groupItem}
                // Lista não amplia: o zoom empurrava o anel pra fora da sidebar (cortado na borda).
                focusScale={1}
              >
                <Text
                  style={[styles.groupName, isActive && [styles.groupNameActive, { color: accent }]]}
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
        {/* Atalhos do controle que ninguém descobriria sozinho — só na TV física. */}
        {IS_NATIVE_TV && (
          <Text style={styles.hint} numberOfLines={2}>{'Avançar e voltar rápido pulam uma página. Menu muda a ordem.'}</Text>
        )}
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
    // minHeight:0 é OBRIGATÓRIO aqui para o ScrollView filho conseguir rolar no web:
    // por padrão CSS, um item flex não encolhe abaixo do tamanho do seu CONTEÚDO
    // (min-height:auto), então a lista de subcategorias cresce e empurra a tela
    // ao invés de rolar internamente. O Yoga (motor nativo) não tem essa regra —
    // por isso funcionava normal na TV/Android e só quebrava no web.
    minHeight: 0,
  },
  sidebarHeader: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  sidebarTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
    color: colors.text1,
    letterSpacing: -0.6,
  },
  sidebarCount: {
    fontSize: 13,
    color: colors.text3,
    marginTop: 2,
    fontFamily: fontFamily.regular,
    fontVariant: ['tabular-nums'],
  },
  toolRow: { flexDirection: 'row', gap: 8, marginTop: spacing.lg },
  toolBtn: {
    width: 36, height: 34, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  sortBtn: {
    flex: 1, width: undefined, paddingHorizontal: 10,
    flexDirection: 'row', justifyContent: 'flex-start', gap: 8,
  },
  toolText: { flexShrink: 1, fontFamily: fontFamily.medium, fontSize: 13, color: colors.text2 },
  sidebarList: {
    paddingTop: spacing.xs,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.md,
    gap: 2,
  },
  hint: {
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
    fontFamily: fontFamily.regular, fontSize: 11, color: colors.text3, lineHeight: 16,
  },

  groupItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.md,
  },
  groupName: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: 15,
    color: colors.text2,
    lineHeight: 19,
  },
  // Ativo = cor do acento + peso; sem pílula preenchida (o foco já é o anel).
  groupNameActive: {
    fontFamily: fontFamily.semiBold,
  },

  divider: {
    width: 1,
    marginVertical: spacing.lg,
    backgroundColor: colors.borderSoft,
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
