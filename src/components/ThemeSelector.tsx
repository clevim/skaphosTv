import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore, THEME_PRESETS } from '../store/useThemeStore';
import { colors, fontSize, spacing } from '../utils/theme';

export default function ThemeSelector() {
  const { preset, setPreset } = useThemeStore();

  return (
    <View>
      <Text style={styles.label}>COR DO TEMA</Text>
      <View style={styles.grid}>
        {THEME_PRESETS.map((p) => {
          const isActive = p.key === preset.key;
          return (
            <TouchableOpacity
              key={p.key}
              onPress={() => setPreset(p)}
              activeOpacity={0.8}
            >
              <View style={[styles.swatch, { backgroundColor: p.primary }, isActive && styles.swatchActive]}>
                {isActive && <Ionicons name="checkmark" size={16} color="#fff" />}
              </View>
              <Text style={[styles.swatchLabel, { color: isActive ? p.accent : colors.text3 }]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 10, fontWeight: '700',
    color: colors.text3, letterSpacing: 1,
    marginBottom: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 12,
    columnGap: 12,
  },
  swatch: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4, shadowRadius: 4, elevation: 4,
  },
  swatchActive: {
    transform: [{ scale: 1.18 }],
    shadowOpacity: 0.7, shadowRadius: 8,
  },
  swatchLabel: {
    fontSize: 9, textAlign: 'center',
    fontWeight: '500', marginTop: 4, width: 38,
  },
});