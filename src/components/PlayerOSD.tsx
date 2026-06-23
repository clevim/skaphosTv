// PlayerOSD.tsx — matches MobilePlayer / TVLive design exactly
import React, { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Animated,
  Platform, PanResponder,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Channel } from '../types';
import TVFocusable, { TVFocusableHandle } from './TVFocusable';
import PulsingDot from './PulsingDot';
import { colors, fontSize, radius, spacing } from '@/utils/theme';
import { IS_TV } from '../utils/tvDetect';

interface Props {
  osdAnim: Animated.Value;
  channel: Channel;
  isPlaying: boolean;
  isMuted: boolean;
  volume: number;
  isLive: boolean;
  position: number;
  duration: number;
  currentIndex: number;
  totalChannels: number;
  retryCount: number;
  onBack: () => void;
  onTogglePlay: () => void;
  onPrevChannel: () => void;
  onNextChannel: () => void;
  onToggleMute: () => void;
  onVolumeChange: (v: number) => void;
  onToggleSidebar: () => void;
  onSeekTo: (pct: number) => void;
  onSeekBy: (seconds: number) => void;
  hasSubtitles?: boolean;
  subtitleActive?: boolean;
  onToggleSubtitles?: () => void;
  hasAudio?: boolean;
  onToggleAudio?: () => void;
  /** TV: avisa o PlayerScreen quando a barra de progresso ganha/perde foco, para que
   *  o D-pad esquerda/direita faça scrubbing do vídeo em vez de navegar nos botões. */
  onScrubFocusChange?: (focused: boolean) => void;
}

function formatTime(seconds: number): string {
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export default function PlayerOSD({
  osdAnim, channel, isPlaying,
  isLive, position, duration,
  currentIndex, totalChannels,
  onBack, onTogglePlay, onPrevChannel, onNextChannel,
  onToggleSidebar, onSeekTo, onSeekBy,
  hasSubtitles, subtitleActive, onToggleSubtitles,
  hasAudio, onToggleAudio, onScrubFocusChange,
}: Props) {
  const progressPct = duration > 0 ? Math.min(1, position / duration) : 0;
  const seekBarWidth = useRef(0);
  // TV: barra de progresso focável + auto-trap horizontal (D-pad esq/dir não sai dela)
  const scrubRef = useRef<TVFocusableHandle>(null);
  const [scrubTag, setScrubTag] = useState<number | null>(null);
  const [scrubFocused, setScrubFocused] = useState(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !isLive && duration > 0,
      onMoveShouldSetPanResponder: () => !isLive && duration > 0,
      onPanResponderGrant: (e) => {
        const pct = Math.max(0, Math.min(1, e.nativeEvent.locationX / seekBarWidth.current));
        onSeekTo(pct);
      },
      onPanResponderMove: (e) => {
        const pct = Math.max(0, Math.min(1, e.nativeEvent.locationX / seekBarWidth.current));
        onSeekTo(pct);
      },
    })
  ).current;

  return (
    <Animated.View style={[styles.osd, { opacity: osdAnim }]}>

      {/* Top bar — back + title + actions */}
      <View style={styles.osdTop}>
        <TVFocusable onPress={onBack} style={styles.backBtn}>
          <Ionicons name={IS_TV ? 'chevron-back' : 'chevron-down'} size={20} color="#fff" />
        </TVFocusable>

        <View style={styles.titleWrap}>
          <Text style={styles.titleLabel}>REPRODUZINDO</Text>
          <Text style={styles.titleName} numberOfLines={1}>{channel.name}</Text>
        </View>

        <View style={styles.topActions}>
          {hasAudio && onToggleAudio && (
            <TVFocusable onPress={onToggleAudio} style={styles.iconBtn}>
              <Ionicons name="musical-notes-outline" size={18} color="#fff" />
            </TVFocusable>
          )}
          {hasSubtitles && onToggleSubtitles && (
            <TVFocusable onPress={onToggleSubtitles} style={[styles.iconBtn, subtitleActive && styles.iconBtnActive]}>
              <Ionicons name="chatbox-ellipses-outline" size={18} color={subtitleActive ? colors.accent : '#fff'} />
            </TVFocusable>
          )}
          <TVFocusable onPress={onToggleSidebar} style={styles.iconBtn}>
            <Ionicons name="scan-outline" size={18} color="#fff" />
          </TVFocusable>
        </View>
      </View>

      {/* Center: play controls */}
      <View style={styles.centerControls} pointerEvents="box-none">
        <TVFocusable onPress={() => onSeekBy(-10)} style={styles.seekBtn}>
          <Ionicons name="play-back" size={IS_TV ? 32 : 28} color="rgba(255,255,255,0.85)" />
        </TVFocusable>

        <TVFocusable onPress={onTogglePlay} style={styles.playBtn} hasTVPreferredFocus>
          <Ionicons name={isPlaying ? 'pause' : 'play'} size={IS_TV ? 28 : 24} color="#0a0a0b" />
        </TVFocusable>

        <TVFocusable onPress={() => onSeekBy(10)} style={styles.seekBtn}>
          <Ionicons name="play-forward" size={IS_TV ? 32 : 28} color="rgba(255,255,255,0.85)" />
        </TVFocusable>
      </View>

      {/* Bottom: progress bar only */}
      <View style={styles.osdBottom}>
        {!isLive && duration > 0 ? (
          <View style={styles.progressSection}>
            {IS_TV ? (
              // TV: foca a barra com o D-pad e segura esquerda/direita para scrubbing.
              // nextFocusLeft/Right apontam para a própria barra → o foco não escapa
              // enquanto se arrasta; o seek é feito pelo onKeyDown do PlayerScreen.
              <TVFocusable
                ref={scrubRef}
                focusScale={1}
                onPress={() => {}}
                onFocus={() => { setScrubFocused(true); onScrubFocusChange?.(true); }}
                onBlur={() => { setScrubFocused(false); onScrubFocusChange?.(false); }}
                nextFocusLeft={scrubTag ?? undefined}
                nextFocusRight={scrubTag ?? undefined}
                style={styles.progressFocusable}
                accessibilityLabel="Barra de progresso"
              >
                <View
                  style={styles.progressBg}
                  onLayout={(e) => {
                    seekBarWidth.current = e.nativeEvent.layout.width;
                    if (scrubTag == null) setScrubTag(scrubRef.current?.getTag() ?? null);
                  }}
                >
                  <View style={[styles.progressFill, { width: `${progressPct * 100}%` }, scrubFocused && styles.progressFillActive]} />
                  <View style={[styles.progressThumb, { left: `${progressPct * 100}%` }, scrubFocused && styles.progressThumbActive]} />
                </View>
              </TVFocusable>
            ) : (
              <View
                style={styles.progressBg}
                onLayout={(e) => { seekBarWidth.current = e.nativeEvent.layout.width; }}
                {...panResponder.panHandlers}
              >
                <View style={[styles.progressFill, { width: `${progressPct * 100}%` }]} />
                <View style={[styles.progressThumb, { left: `${progressPct * 100}%` }]} />
              </View>
            )}
            <View style={styles.timeRow}>
              <Text style={styles.timeText}>{formatTime(position)}</Text>
              <Text style={styles.timeText}>{formatTime(duration)}</Text>
            </View>
          </View>
        ) : isLive ? (
          <View style={styles.liveInfo}>
            <PulsingDot size={6} />
            <Text style={styles.liveInfoText}>Ao vivo</Text>
            <View style={{ flex: 1 }} />
            <Text style={styles.channelCounter}>
              CH {currentIndex + 1}/{totalChannels}
            </Text>
          </View>
        ) : null}

        {/* Channel nav — only show for non-live with no progress */}
        {!isLive && duration === 0 && (
          <View style={styles.bottomRow}>
            <TVFocusable onPress={onPrevChannel} style={styles.navBtn} disabled={currentIndex === 0}>
              <Ionicons name="play-skip-back" size={18} color={currentIndex === 0 ? 'rgba(255,255,255,0.3)' : '#fff'} />
            </TVFocusable>
            <Text style={styles.channelCounter}>
              CH {currentIndex + 1}/{totalChannels}
            </Text>
            <TVFocusable onPress={onNextChannel} style={styles.navBtn} disabled={currentIndex === totalChannels - 1}>
              <Ionicons name="play-skip-forward" size={18} color={currentIndex === totalChannels - 1 ? 'rgba(255,255,255,0.3)' : '#fff'} />
            </TVFocusable>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  osd: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },

  // Top
  osdTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: IS_TV ? spacing.xxxl : 18,
    paddingTop: IS_TV ? 32 : 54,
    paddingBottom: spacing.lg,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.full,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: {
    flex: 1,
    alignItems: 'center',
  },
  titleLabel: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  titleName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
    marginTop: 1,
  },
  topActions: { flexDirection: 'row', gap: 8 },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.full,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnActive: {
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accent,
  },

  // Center
  centerControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: IS_TV ? 36 : 28,
  },
  seekBtn: {
    width: IS_TV ? 52 : 44,
    height: IS_TV ? 52 : 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtn: {
    width: IS_TV ? 76 : 64,
    height: IS_TV ? 76 : 64,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Bottom
  osdBottom: {
    paddingHorizontal: IS_TV ? spacing.xxxl : 22,
    paddingBottom: IS_TV ? 60 : 56,
    gap: spacing.sm,
  },
  progressSection: { gap: spacing.sm },
  progressFocusable: {
    paddingVertical: 6,
  },
  progressBg: {
    height: 20,
    justifyContent: 'center',
    position: 'relative',
  },
  progressFill: {
    position: 'absolute',
    left: 0,
    height: 3,
    backgroundColor: colors.accent,
    borderRadius: 2,
    top: 8.5,
  },
  // Realce quando a barra está focada na TV (scrubbing ativo)
  progressFillActive: {
    height: 5,
    top: 7.5,
  },
  progressThumb: {
    position: 'absolute',
    top: 4.5,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: '#fff',
    marginLeft: -5.5,
  },
  progressThumbActive: {
    top: 1.5,
    width: 17,
    height: 17,
    borderRadius: 9,
    marginLeft: -8.5,
    borderWidth: 2,
    borderColor: colors.accent,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: fontSize.xs,
  },

  liveInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveInfoText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: fontSize.xs,
    fontWeight: '600',
  },

  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
  },
  navBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  channelCounter: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: fontSize.xs,
    letterSpacing: 0.4,
  },
});
