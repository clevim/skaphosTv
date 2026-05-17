// BottomTabBar.tsx — Mobile bottom tab bar matching MTabBar design
import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import TVFocusable from './TVFocusable';
import { colors } from '../utils/theme';
import { LAUNCH_YEAR } from '../utils/channelUtils';

const TABS = [
  { id: 'home',      label: 'Início',   icon: 'home-outline',        activeIcon: 'home'        },
  { id: 'live',      label: 'Ao Vivo',  icon: 'radio-outline',       activeIcon: 'radio'       },
  { id: 'movies',    label: 'Filmes',   icon: 'film-outline',        activeIcon: 'film'        },
  { id: 'series',    label: 'Séries',   icon: 'tv-outline',          activeIcon: 'tv'          },
  { id: 'year',      label: LAUNCH_YEAR, icon: 'star-outline',       activeIcon: 'star'        },
  { id: 'favorites', label: 'Favoritos', icon: 'heart-outline',      activeIcon: 'heart'       },
  { id: 'search',   label: 'Buscar',   icon: 'search-outline',      activeIcon: 'search'      },
];

interface Props {
  active: string;
  onPress: (id: string) => void;
}

export default function BottomTabBar({ active, onPress }: Props) {
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
          {TABS.map(t => {
            const on = t.id === active;
            return (
              <TVFocusable
                key={t.id}
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
  },
  tab: {
    alignItems: 'center',
    gap: 3,
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
