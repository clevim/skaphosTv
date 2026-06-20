// TVCatalogLayout.tsx — Two-panel TV browse layout: left sidebar + right grid
import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import TVFocusable from './TVFocusable';
import { colors, spacing, fontSize, radius } from '../utils/theme';

interface Props {
  title: string;
  count: number;
  groups: string[];
  selectedGroup: string | null;
  onGroupSelect: (g: string | null) => void;
  onReload?: () => void;
  children: React.ReactNode;
}

export default function TVCatalogLayout({
  title, count, groups, selectedGroup, onGroupSelect, onReload, children,
}: Props) {
  return (
    <View style={styles.root}>
      {/* Left sidebar */}
      <View style={styles.sidebar}>
        <View style={styles.sidebarHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sidebarTitle}>{title}</Text>
            <Text style={styles.sidebarCount}>{count} itens</Text>
          </View>
          {onReload && (
            <TVFocusable onPress={onReload} style={styles.reloadBtn} borderRadius={8}>
              <Ionicons name="refresh-outline" size={16} color={colors.text2} />
            </TVFocusable>
          )}
        </View>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.sidebarList}
        >
          {/* All option */}
          <TVFocusable
            onPress={() => onGroupSelect(null)}
            style={[styles.groupItem, !selectedGroup && styles.groupItemActive]}
          >
            <View style={[styles.groupDot, !selectedGroup && styles.groupDotActive]} />
            <Text
              style={[styles.groupName, !selectedGroup && styles.groupNameActive]}
              numberOfLines={2}
            >
              Todos
            </Text>
          </TVFocusable>

          {groups.map(g => {
            const clean = g.replace(/[♦◆️\uFE0F]\s*/g, '').trim();
            const isActive = selectedGroup === g;
            return (
              <TVFocusable
                key={g}
                onPress={() => onGroupSelect(isActive ? null : g)}
                style={[styles.groupItem, isActive && styles.groupItemActive]}
              >
                <View style={[styles.groupDot, isActive && styles.groupDotActive]} />
                <Text
                  style={[styles.groupName, isActive && styles.groupNameActive]}
                  numberOfLines={2}
                >
                  {clean}
                </Text>
              </TVFocusable>
            );
          })}
        </ScrollView>
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
  },
  sidebarHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  reloadBtn: {
    width: 32, height: 32,
    borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.bg2,
    borderWidth: 1, borderColor: colors.border,
    marginTop: 2,
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
    paddingVertical: spacing.sm,
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
  groupDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.text3,
  },
  groupDotActive: {
    backgroundColor: colors.accent,
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
  },
});
