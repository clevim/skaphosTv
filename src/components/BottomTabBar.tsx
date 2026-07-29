// BottomTabBar.tsx — Mobile bottom tab bar matching MTabBar design
import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import TVFocusable from './TVFocusable';
import { colors } from '../utils/theme';
import { LAUNCH_YEAR } from '../utils/channelUtils';
import { useStore } from '../store/useStore';

const STATIC_TABS_BEFORE = [
  { id: 'home',      label: 'Início',    icon: 'home-outline',   activeIcon: 'home'   },
  { id: 'favorites', label: 'Favoritos', icon: 'heart-outline',  activeIcon: 'heart'  },
  { id: 'live',      label: 'Ao Vivo',   icon: 'radio-outline',  activeIcon: 'radio'  },
  { id: 'epg',       label: 'Guia',      icon: 'calendar-outline', activeIcon: 'calendar' },
  { id: 'movies',    label: 'Filmes',    icon: 'film-outline',   activeIcon: 'film'   },
  { id: 'series',    label: 'Séries',    icon: 'tv-outline',     activeIcon: 'tv'     },
];

const STATIC_TABS_AFTER = [
  { id: 'year',      label: LAUNCH_YEAR, icon: 'star-outline',   activeIcon: 'star'   },
  { id: 'search',    label: 'Buscar',    icon: 'search-outline', activeIcon: 'search' },
];

interface Props {
  active: string;
  onPress: (id: string) => void;
  jellyfinSources?: Array<{ id: string; serverName?: string; name: string }>;
}

export default function BottomTabBar({ active, onPress, jellyfinSources }: Props) {
  const showEpg = useStore(s => s.settings.showEpg);
  const tabs = [
    ...STATIC_TABS_BEFORE.filter(t => t.id !== 'epg' || showEpg),
    ...(jellyfinSources ?? []).map(s => ({
      id: `jf-${s.id}`,
      label: s.serverName || s.name,
      icon: 'play-circle-outline',
      activeIcon: 'play-circle',
    })),
    ...STATIC_TABS_AFTER,
  ];

  return (
    <View style={styles.container} pointerEvents="box-none">
      <LinearGradient
        colors={['transparent', 'rgba(10,8,16,0.9)', colors.bg0]}
        locations={[0, 0.35, 1]}
        style={styles.gradient}
        pointerEvents="none"
      />
      <View style={styles.bar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          bounces={false}
        >
          {tabs.map(t => {
            const on = t.id === active;
            return (
              <TVFocusable
                key={t.id}
                accessibilityLabel={t.label}
                onPress={() => onPress(t.id)}
                style={styles.tab}
              >
                <Ionicons
                  name={(on ? t.activeIcon : t.icon) as any}
                  size={20}
                  color={on ? colors.text1 : colors.text3}
                />
                <Text style={[styles.label, on && styles.labelActive]}>
                  {t.label}
                </Text>
              </TVFocusable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  gradient: {
    position: 'absolute',
    top: -30,
    left: 0,
    right: 0,
    height: 30,
  },
  bar: {
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: colors.bg0,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  scrollContent: {
    paddingHorizontal: 6,
    gap: 0,
    // Centraliza quando as abas não preenchem a largura (tablet, celular
    // deitado). Sem isto elas ficavam amontoadas à esquerda com um vazio à
    // direita — a cara de "layout de celular esticado". Quando as abas passam
    // da largura, o flexGrow não faz efeito e a rolagem volta a valer.
    flexGrow: 1,
    justifyContent: 'center',
  },
  tab: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    // 48dp é o mínimo de alvo de toque do Material. Com ícone 20 + rótulo 13 +
    // gap, o padding de 4 deixava a aba em ~44dp — o TopHeader já resolvia o
    // mesmo problema com hitSlop, aqui faltava.
    minHeight: 48,
    paddingVertical: 4,
    paddingHorizontal: 14,
  },
  label: {
    fontSize: 10,
    fontWeight: '500',
    color: colors.text3,
    letterSpacing: 0.2,
  },
  labelActive: {
    color: colors.text1,
    fontWeight: '600',
  },
});
