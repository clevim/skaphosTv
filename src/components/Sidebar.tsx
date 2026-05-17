import React from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import TVFocusable from './TVFocusable';
import { useThemeStore } from '../store/useThemeStore';
import { colors, spacing, fontSize, radius } from '../utils/theme';
import { IS_TV } from '../utils/tvDetect';

interface NavItem { key: string; label: string; icon: string; }
interface Props {
  navKey: string;
  selectedGroup: string | null;
  navItems: NavItem[];
  filteredGroups: string[];
  navCount: (key: string) => number;
  groupCount: (group: string) => number;
  onNavPress: (key: string) => void;
  onGroupPress: (group: string) => void;
  onBack: () => void;
  categorySearch: string;
  onCategorySearchChange: (q: string) => void;
  catScrollH: number;
  collapsed?: boolean;
}

export default function Sidebar({
  navKey, selectedGroup, navItems, filteredGroups,
  navCount, groupCount, onNavPress, onGroupPress,
  onBack, categorySearch, onCategorySearchChange,
  catScrollH, collapsed = false,
}: Props) {
  const { preset } = useThemeStore();

  const isHome = navKey === 'home';
  const currentNav = navItems.find(n => n.key === navKey);
  const cleanGroupName = selectedGroup
    ? selectedGroup.replace(/[♦◆️\uFE0F]\s*/g, '').trim()
    : '';

  // ── Modo Home: mostra todos os itens de nav ──────────────────────────────
  if (isHome) {
    return (
      <View style={[styles.sidebar, collapsed && styles.sidebarCollapsed]}>
        <Logo preset={preset} collapsed={collapsed} />
        <View style={styles.navSection}>
          {!collapsed && <Text style={styles.sectionLabel}>NAVEGAÇÃO</Text>}
          {navItems.map(item => (
            <NavItem
              key={item.key}
              item={item}
              isActive={false}
              count={navCount(item.key)}
              collapsed={collapsed}
              preset={preset}
              onPress={() => onNavPress(item.key)}
            />
          ))}
        </View>
      </View>
    );
  }

  // ── Modo Seção com grupo selecionado ─────────────────────────────────────
  if (selectedGroup) {
    return (
      <View style={[styles.sidebar, collapsed && styles.sidebarCollapsed]}>
        <Logo preset={preset} collapsed={collapsed} />

        {/* Voltar para a lista de grupos */}
        <TVFocusable onPress={onBack} style={styles.backBtn}>
          <Ionicons name="arrow-back-outline" size={14} color={colors.text2} />
          {!collapsed && <Text style={styles.backLabel}>{currentNav?.label ?? 'Voltar'}</Text>}
        </TVFocusable>

        {!collapsed && (
          <View style={[styles.catSection, { height: catScrollH }]}>
            {/* Nome do grupo */}
            <View style={[styles.groupContextBox, { borderColor: preset.primary + '40', backgroundColor: preset.primary + '12' }]}>
              <View style={[styles.groupContextDot, { backgroundColor: preset.accent }]} />
              <Text style={[styles.groupContextName, { color: preset.accent }]} numberOfLines={2}>
                {cleanGroupName}
              </Text>
            </View>

            {/* Busca dentro do grupo */}
            <SearchInput
              value={categorySearch}
              onChange={onCategorySearchChange}
              placeholder="Buscar neste grupo..."
            />
          </View>
        )}
      </View>
    );
  }

  // ── Modo Seção sem grupo: mostra subcategorias ───────────────────────────
  return (
    <View style={[styles.sidebar, collapsed && styles.sidebarCollapsed]}>
      <Logo preset={preset} collapsed={collapsed} />

      {/* Voltar para o Início */}
      <TVFocusable onPress={() => onNavPress('home')} style={styles.backBtn}>
        <Ionicons name="home-outline" size={14} color={colors.text2} />
        {!collapsed && <Text style={styles.backLabel}>Início</Text>}
      </TVFocusable>

      {!collapsed && (
        <>
          {/* Header da seção atual */}
          <View style={[styles.sectionHeader, { borderColor: preset.primary + '40', backgroundColor: preset.primary + '10' }]}>
            <Ionicons
              name={currentNav?.icon as any ?? 'grid-outline'}
              size={14}
              color={preset.accent}
            />
            <Text style={[styles.sectionHeaderLabel, { color: preset.accent }]}>
              {currentNav?.label ?? ''}
            </Text>
            <Text style={[styles.sectionHeaderCount, { color: preset.accent + 'aa' }]}>
              {navCount(navKey) > 9999 ? '9k+' : navCount(navKey)}
            </Text>
          </View>

          {/* Busca na seção */}
          <SearchInput
            value={categorySearch}
            onChange={onCategorySearchChange}
            placeholder={`Buscar em ${currentNav?.label ?? 'seção'}...`}
          />

          {/* Lista de subcategorias */}
          {filteredGroups.length > 0 && (
            <View style={[styles.catSection, { height: catScrollH }]}>
              <View style={styles.catHeader}>
                <Text style={styles.sectionLabel}>CATEGORIAS</Text>
                <Text style={[styles.countText, { color: preset.accent }]}>{filteredGroups.length}</Text>
              </View>
              <ScrollView
                style={{ flex: 1 }}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled
                bounces={false}
              >
                {filteredGroups.map(group => {
                  const isActive = selectedGroup === group;
                  const cleanName = group.replace(/[♦◆️\uFE0F]\s*/g, '').trim();
                  const count = groupCount(group);
                  return (
                    <TVFocusable
                      key={group}
                      onPress={() => onGroupPress(group)}
                      style={[
                        styles.groupItem,
                        isActive && { backgroundColor: preset.primary + '18', borderLeftColor: preset.accent },
                      ]}
                    >
                      <View style={[styles.groupDot, { backgroundColor: isActive ? preset.accent : colors.text3 + '55' }]} />
                      <Text
                        style={[styles.groupLabel, isActive && { color: preset.accent, fontWeight: '600' }]}
                        numberOfLines={1}
                      >
                        {cleanName}
                      </Text>
                      <Text style={styles.groupCount}>{count}</Text>
                    </TVFocusable>
                  );
                })}
              </ScrollView>
            </View>
          )}
        </>
      )}
    </View>
  );
}

// ── Sub-componentes internos ─────────────────────────────────────────────────

function Logo({ preset, collapsed }: { preset: any; collapsed: boolean }) {
  return (
    <View style={[styles.logoArea, collapsed && styles.logoAreaCollapsed]}>
      <View style={[styles.logoIconWrap, { backgroundColor: preset.primary + '25', borderColor: preset.primary + '50' }]}>
        <Ionicons name="tv" size={15} color={preset.accent} />
      </View>
      {!collapsed && (
        <View>
          <Text style={[styles.logoText, { color: preset.accent }]}>SkaphosTV</Text>
          <Text style={styles.logoSub}>IPTV Player</Text>
        </View>
      )}
    </View>
  );
}

function NavItem({
  item, isActive, count, collapsed, preset, onPress,
}: {
  item: { key: string; label: string; icon: string };
  isActive: boolean;
  count: number;
  collapsed: boolean;
  preset: any;
  onPress: () => void;
}) {
  return (
    <TVFocusable
      onPress={onPress}
      style={[
        styles.navItem,
        collapsed && styles.navItemCollapsed,
        isActive && { borderLeftColor: preset.accent, backgroundColor: preset.primary + '18' },
        collapsed && isActive && { backgroundColor: preset.primary + '25', borderLeftColor: 'transparent' },
      ]}
    >
      <View style={[styles.iconWrap, isActive && { backgroundColor: preset.primary + '30' }]}>
        <Ionicons
          name={item.icon as any}
          size={IS_TV ? 18 : 16}
          color={isActive ? preset.accent : colors.text3}
        />
      </View>
      {!collapsed && (
        <>
          <Text style={[styles.navLabel, isActive && { color: preset.accent, fontWeight: '700' }]}>
            {item.label}
          </Text>
          {count > 0 && (
            <Text style={[styles.countText, isActive && { color: preset.accent }]}>
              {count > 9999 ? '9k+' : count}
            </Text>
          )}
        </>
      )}
      {collapsed && isActive && (
        <View style={[styles.activeDot, { backgroundColor: preset.accent }]} />
      )}
    </TVFocusable>
  );
}

function SearchInput({
  value, onChange, placeholder,
}: {
  value: string;
  onChange: (q: string) => void;
  placeholder: string;
}) {
  return (
    <View style={[styles.searchBox, { borderColor: colors.border, backgroundColor: colors.bg3 }]}>
      <Ionicons name="search-outline" size={13} color={colors.text3} />
      <TextInput
        style={styles.searchInput}
        placeholder={placeholder}
        placeholderTextColor={colors.text3}
        value={value}
        onChangeText={onChange}
        autoCorrect={false}
        autoCapitalize="none"
      />
      {value.length > 0 && (
        <TVFocusable onPress={() => onChange('')} style={styles.clearBtn}>
          <Ionicons name="close-circle" size={13} color={colors.text3} />
        </TVFocusable>
      )}
    </View>
  );
}

// ── Estilos ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  sidebar: {
    flex: 1,
    backgroundColor: colors.bg0,
    borderRightWidth: 1,
    borderRightColor: colors.borderSoft,
    paddingTop: IS_TV ? spacing.xl : spacing.lg,
  },
  sidebarCollapsed: { alignItems: 'center' },

  logoArea: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14,
    marginBottom: IS_TV ? spacing.xl : spacing.lg,
  },
  logoAreaCollapsed: { paddingHorizontal: 0, justifyContent: 'center' },
  logoIconWrap: {
    width: IS_TV ? 36 : 30, height: IS_TV ? 36 : 30,
    borderRadius: 9, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  logoText: { fontSize: IS_TV ? 19 : 15, fontWeight: '800', letterSpacing: -0.5, lineHeight: IS_TV ? 21 : 17 },
  logoSub: { fontSize: 8, color: colors.text3, fontWeight: '600', letterSpacing: 1.2 },

  navSection: { marginBottom: spacing.sm },
  sectionLabel: {
    fontSize: 8, fontWeight: '700', color: colors.text3,
    letterSpacing: 1.5, paddingHorizontal: 14, marginBottom: 6,
  },
  navItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: IS_TV ? 11 : 8, paddingHorizontal: 10,
    borderLeftWidth: 3, borderLeftColor: 'transparent',
    marginHorizontal: 4, borderRadius: radius.sm, marginBottom: 2,
  },
  navItemCollapsed: {
    justifyContent: 'center', paddingHorizontal: 0,
    marginHorizontal: 4, borderLeftWidth: 0,
    width: 44, position: 'relative',
  },
  iconWrap: {
    width: IS_TV ? 30 : 26, height: IS_TV ? 30 : 26,
    borderRadius: 8, alignItems: 'center', justifyContent: 'center',
  },
  navLabel: { flex: 1, fontSize: IS_TV ? fontSize.sm : 12, color: colors.text2, fontWeight: '500' },
  countText: { fontSize: 9, fontWeight: '700', color: colors.text3 },
  activeDot: { position: 'absolute', right: 2, top: 2, width: 6, height: 6, borderRadius: 3 },

  // Back
  backBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 7, paddingHorizontal: 12,
    marginHorizontal: 4, borderRadius: radius.sm, marginBottom: spacing.xs,
  },
  backLabel: { fontSize: IS_TV ? fontSize.xs : 11, color: colors.text2, fontWeight: '500' },

  // Section header
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    marginHorizontal: 4, marginBottom: spacing.xs,
    paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: radius.sm, borderWidth: 1,
  },
  sectionHeaderLabel: { flex: 1, fontSize: IS_TV ? fontSize.xs : 11, fontWeight: '700' },
  sectionHeaderCount: { fontSize: 9, fontWeight: '700' },

  // Search
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginHorizontal: 4, marginBottom: spacing.xs,
    paddingHorizontal: 10, paddingVertical: IS_TV ? 8 : 6,
    borderRadius: radius.sm, borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: IS_TV ? fontSize.xs : 11, color: colors.text1, padding: 0 },
  clearBtn: { padding: 2 },

  // Categories
  catSection: {
    flex: 1, borderTopWidth: 1, borderTopColor: colors.borderSoft, paddingTop: spacing.sm,
  },
  catHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, marginBottom: 4,
  },
  groupItem: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: IS_TV ? 8 : 6, paddingHorizontal: 12,
    borderLeftWidth: 2, borderLeftColor: 'transparent',
    marginHorizontal: 4, borderRadius: radius.sm, marginBottom: 1,
  },
  groupDot: { width: 5, height: 5, borderRadius: 3, flexShrink: 0 },
  groupLabel: { flex: 1, fontSize: IS_TV ? fontSize.xs : 11, color: colors.text2 },
  groupCount: { fontSize: 9, color: colors.text3, fontWeight: '600' },

  // Group context (quando grupo selecionado)
  groupContextBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 4, marginBottom: spacing.sm,
    paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: radius.sm, borderWidth: 1,
  },
  groupContextDot: { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
  groupContextName: { flex: 1, fontSize: IS_TV ? fontSize.xs : 11, fontWeight: '700' },
});
