import React, { memo } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import TVFocusable from './TVFocusable';
import { colors, radius, fontSize, spacing } from '../utils/theme';
import { Channel } from '../../App';

interface ChannelCardProps {
  channel: Channel;
  isPlaying?: boolean;
  isFavorite?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  hasTVPreferredFocus?: boolean;
}

const qualityColors: Record<string, string> = {
  '4K': '#a855f7',
  'FHD': '#3b82f6',
  'HD': '#22c55e',
  'SD': '#9d97b8',
};

function ChannelCard({
  channel,
  isPlaying,
  isFavorite,
  onPress,
  onLongPress,
  hasTVPreferredFocus,
}: ChannelCardProps) {
  const qColor = qualityColors[channel.quality || 'HD'] || qualityColors.HD;

  return (
    <TVFocusable
      onPress={onPress}
      onLongPress={onLongPress}
      hasTVPreferredFocus={hasTVPreferredFocus}
      accessibilityLabel={`Canal ${channel.name}`}
      style={[styles.card, isPlaying && styles.cardPlaying]}
    >
      {/* Logo */}
      <View style={styles.logoContainer}>
        {channel.logo ? (
          <Image
            source={{ uri: channel.logo }}
            style={styles.logo}
            resizeMode="contain"
            defaultSource={require('../../assets/icon.png')}
          />
        ) : (
          <View style={[styles.logoPlaceholder]}>
            <Text style={styles.logoText} numberOfLines={1}>
              {channel.name.slice(0, 3).toUpperCase()}
            </Text>
          </View>
        )}
        {isPlaying && (
          <View style={styles.playingBadge}>
            <View style={styles.playingDot} />
          </View>
        )}
      </View>

      {/* Info */}
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={2}>{channel.name}</Text>
        <Text style={styles.group} numberOfLines={1}>{channel.group || 'Geral'}</Text>
      </View>

      {/* Badges */}
      <View style={styles.badges}>
        <View style={[styles.badge, { backgroundColor: qColor + '22' }]}>
          <Text style={[styles.badgeText, { color: qColor }]}>{channel.quality || 'HD'}</Text>
        </View>
        <View style={[styles.badge, styles.liveBadge]}>
          <Text style={styles.liveText}>AO VIVO</Text>
        </View>
        {isFavorite && (
          <Ionicons name="star" size={12} color={colors.yellow} />
        )}
      </View>
    </TVFocusable>
  );
}

export default memo(ChannelCard);

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bg1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    margin: spacing.xs,
    width: 160,
    gap: spacing.sm,
  },
  cardPlaying: {
    backgroundColor: colors.accent + '1a',
    borderColor: colors.accent2,
  },
  logoContainer: {
    width: 52,
    height: 52,
    position: 'relative',
  },
  logo: {
    width: 52,
    height: 52,
    borderRadius: radius.sm,
    backgroundColor: colors.bg3,
  },
  logoPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: radius.sm,
    backgroundColor: colors.bg3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    color: colors.text2,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  playingBadge: {
    position: 'absolute',
    bottom: -3,
    right: -3,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.bg1,
  },
  playingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.white,
  },
  info: {
    gap: 2,
  },
  name: {
    color: colors.text1,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  group: {
    color: colors.text3,
    fontSize: fontSize.xs,
  },
  badges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  badge: {
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  liveBadge: {
    backgroundColor: colors.red + '22',
  },
  liveText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.red,
  },
});
