import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, radius } from '@/utils/theme';
import TVFocusable from './TVFocusable';

interface Props {
  channelName: string;
  error: string | null;
  retryCount: number;
  retryingIn: number | null;
  maxRetries: number;
  retryDelays: number[];
  onRetryNow: () => void;
  onNextChannel: () => void;
}

export default function PlayerError({
  channelName,
  error,
  retryCount,
  retryingIn,
  maxRetries,
  retryDelays,
  onRetryNow,
  onNextChannel,
}: Props) {
  const isRetrying = retryingIn !== null;
  const delaySeconds = Math.ceil((retryDelays[retryCount - 1] ?? 30000) / 1000);
  const countdownPct = isRetrying ? (retryingIn! / delaySeconds) * 100 : 0;

  return (
    <View style={styles.overlay}>
      <View style={styles.box}>
        <Ionicons
          name={isRetrying ? 'reload-circle' : 'warning'}
          size={52}
          color={isRetrying ? colors.accent2 : colors.red}
        />

        <Text style={styles.title}>
          {isRetrying ? 'Reconectando...' : 'Falha na reprodução'}
        </Text>

        <Text style={styles.channelName} numberOfLines={2}>
          {channelName}
        </Text>

        {isRetrying ? (
          <View style={styles.countdownBox}>
            <Text style={styles.countdownText}>
              Nova tentativa em {retryingIn}s
              {retryCount > 0 && ` (${retryCount + 1}/${maxRetries})`}
            </Text>
            <View style={styles.countdownBar}>
              <View style={[styles.countdownFill, { width: `${countdownPct}%` }]} />
            </View>
          </View>
        ) : (
          <Text style={styles.errorDetail} numberOfLines={3}>
            {error}
          </Text>
        )}

        <View style={styles.actions}>
          <TVFocusable onPress={onRetryNow} style={styles.retryBtn} hasTVPreferredFocus>
            <Ionicons name="reload" size={18} color={colors.white} />
            <Text style={styles.retryText}>Tentar Agora</Text>
          </TVFocusable>

          <TVFocusable onPress={onNextChannel} style={styles.skipBtn}>
            <Text style={styles.skipText}>Próximo Canal</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.text2} />
          </TVFocusable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
  },
  box: {
    alignItems: 'center',
    gap: 10,
    padding: 36,
    backgroundColor: 'rgba(10,8,20,0.95)',
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.red + '44',
    maxWidth: 360,
    width: '90%',
  },
  title: {
    color: colors.white,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  channelName: {
    color: colors.text2,
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  errorDetail: {
    color: colors.text3,
    fontSize: fontSize.xs,
    textAlign: 'center',
  },
  countdownBox: {
    alignItems: 'center',
    gap: 8,
    width: '100%',
  },
  countdownText: {
    color: colors.accent2,
    fontSize: fontSize.sm,
  },
  countdownBar: {
    width: '100%',
    height: 4,
    backgroundColor: colors.bg3,
    borderRadius: 2,
    overflow: 'hidden',
  },
  countdownFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    borderRadius: radius.sm,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  retryText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: fontSize.sm,
  },
  skipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.bg3,
    borderRadius: radius.sm,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  skipText: {
    color: colors.text2,
    fontSize: fontSize.sm,
  },
});