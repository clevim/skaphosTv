// TopHeader.tsx — Mobile top header
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import TVFocusable from './TVFocusable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius } from '../utils/theme';

interface Props {
  onSettingsPress?: () => void;
  onAddPress?: () => void;
}

export default function TopHeader({ onSettingsPress, onAddPress }: Props) {
  // Status bar agora é visível no mobile — o header precisa descer o inset dela
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, { paddingTop: 8 + insets.top }]}>
      {/* Logo / Wordmark */}
      <View style={styles.wordmark}>
        {/* Logo oficial (escafandro). A arte tem ~15% de margem interna — o
            zoom-crop (imagem maior que o quadro, overflow hidden) preenche o
            selo sem redesenhar o asset. */}
        <View style={styles.logoIcon}>
          <Image source={require('../../assets/icon.png')} style={styles.logoImg} contentFit="cover" />
        </View>

        <View>
          <Text style={styles.logoText}>
            SKAPHOS<Text style={styles.logoDot}>·</Text>TV
          </Text>
          <Text style={styles.logoSub}>IPTV</Text>
        </View>
      </View>

      {/* Right actions */}
      <View style={styles.actions}>
        {/* Add / manage lists */}
        <TVFocusable accessibilityLabel="Adicionar lista" onPress={onAddPress || (() => {})} style={styles.addBtn} hitSlop={9}>
          <Ionicons name="add" size={17} color={colors.textInverse} />
        </TVFocusable>

        {/* Settings */}
        <TVFocusable accessibilityLabel="Ajustes" onPress={onSettingsPress || (() => {})} style={styles.iconBtn} hitSlop={9}>
          <Ionicons name="settings-outline" size={19} color={colors.text2} />
        </TVFocusable>

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingBottom: 12,
  },

  // Logo
  wordmark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  logoIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.25)',
    backgroundColor: colors.bg0,
  },
  // 145% do quadro, centralizado — recorta a margem interna da arte
  logoImg: { width: 42, height: 42, marginTop: -7, marginLeft: -7 },

  logoText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text1,
    letterSpacing: 2,
  },
  logoDot: {
    color: colors.accent,
  },
  logoSub: {
    fontSize: 8.5,
    fontWeight: '600',
    color: colors.text3,
    letterSpacing: 1.5,
    marginTop: 1,
  },

  // Actions
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  addBtn: {
    width: 30,
    height: 30,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtn: {
    width: 30,
    height: 30,
    borderRadius: radius.full,
    backgroundColor: colors.bg1,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
