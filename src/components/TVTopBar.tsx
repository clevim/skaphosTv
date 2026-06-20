// TVTopBar.tsx — TV horizontal top nav with proper D-pad focus
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import TVFocusable from './TVFocusable';
import { colors, spacing, radius, fontFamily } from '../utils/theme';
import { LAUNCH_YEAR } from '../utils/channelUtils';

const TV_NAV_STATIC_BEFORE = [
  { key: 'home',    label: 'Início'  },
  { key: 'live',    label: 'Ao vivo' },
  { key: 'movies',  label: 'Filmes'  },
  { key: 'series',  label: 'Séries'  },
];

const TV_NAV_STATIC_AFTER = [
  { key: 'year',   label: String(LAUNCH_YEAR) },
  { key: 'search', label: 'Buscar'            },
];

interface Props {
  active: string;
  clock: string;
  onNavPress: (key: string) => void;
  onSettingsPress?: () => void;
  jellyfinSources?: Array<{ id: string; serverName?: string; name: string }>;
}

function NavItem({
  item,
  active,
  onPress,
}: {
  item: { key: string; label: string };
  active: boolean;
  onPress: () => void;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <TVFocusable
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={styles.navItem}
      focusStyle={styles.navItemFocused}
      focusScale={1}            // sem zoom no menu inline (evita invadir vizinhos)
      borderRadius={radius.full}
    >
      <Text style={[
        styles.navLabel,
        active && styles.navLabelActive,
        focused && styles.navLabelFocused,
      ]}>
        {item.label}
      </Text>
      {active && (
        <View style={styles.activeDotWrap}>
          <View style={styles.activeDot} />
        </View>
      )}
    </TVFocusable>
  );
}

export default function TVTopBar({ active, clock, onNavPress, onSettingsPress, jellyfinSources }: Props) {
  const navItems = [
    ...TV_NAV_STATIC_BEFORE,
    ...(jellyfinSources ?? []).map(s => ({ key: `jf-${s.id}`, label: s.serverName || s.name })),
    ...TV_NAV_STATIC_AFTER,
  ];

  return (
    <View style={styles.container}>
      {/* Wordmark */}
      <View style={styles.wordmark}>
        <View style={styles.logoIcon}>
          <Ionicons name="tv" size={14} color={colors.accent} />
        </View>
        <Text style={styles.logoText}>
          Skaphos<Text style={styles.logoDot}>·</Text>TV
        </Text>
      </View>

      {/* Nav items */}
      <View style={styles.navItems}>
        {navItems.map(item => (
          <NavItem
            key={item.key}
            item={item}
            active={item.key === active}
            onPress={() => onNavPress(item.key)}
          />
        ))}
      </View>

      {/* Right: clock + settings */}
      <View style={styles.rightSection}>
        <Text style={styles.clock}>{clock}</Text>
        <View style={styles.separator} />
        <TVFocusable
          onPress={onSettingsPress || (() => {})}
          style={styles.settingsBtn}
          borderRadius={radius.full}
        >
          <Ionicons name="settings-outline" size={18} color={colors.text2} />
        </TVFocusable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,   // 48 → 32
    paddingVertical: 14,              // 20 → 14
    gap: 20,                          // 36 → 20
    backgroundColor: 'rgba(10,8,16,0.85)',
  },

  // Wordmark
  wordmark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoIcon: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: 'rgba(167,139,250,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    fontSize: 15,
    fontFamily: fontFamily.semiBold,
    color: colors.text1,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  logoDot: { color: colors.accent },

  // Nav items
  navItems: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 2,
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.full,
  },
  navItemFocused: {
    backgroundColor: 'rgba(167,139,250,0.25)',
  },
  navLabel: {
    fontSize: 14,
    fontFamily: fontFamily.medium,
    color: colors.text2,
    letterSpacing: -0.1,
  },
  navLabelActive: {
    fontFamily: fontFamily.semiBold,
    color: colors.text1,
  },
  navLabelFocused: {
    // Texto branco no item focado — contraste forte sobre a pílula
    color: colors.text1,
    fontFamily: fontFamily.semiBold,
  },
  activeDotWrap: {
    // Absoluto: não entra no fluxo — todos os itens ficam da mesma altura.
    // left:0/right:0 + alignItems:'center' garantem centralização pixel-perfect.
    position: 'absolute',
    bottom: 2,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.accent,
  },

  // Right
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  clock: {
    fontSize: 13,
    color: colors.text2,
    fontFamily: fontFamily.medium,
  },
  separator: {
    width: 1,
    height: 14,
    backgroundColor: colors.border,
  },
  settingsBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg1,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
