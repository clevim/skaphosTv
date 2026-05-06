import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
  FlatList, Image, Platform, BackHandler, Dimensions,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../store/useStore';
import TVFocusable from '../components/TVFocusable';
import { colors, spacing, fontSize, radius } from '../utils/theme';
import { RootStackParamList, Channel } from '../../App';

type PlayerRoute = RouteProp<RootStackParamList, 'Player'>;
const { width, height } = Dimensions.get('window');
const IS_TV = Platform.isTV;
const OSD_TIMEOUT = 5000;

export default function PlayerScreen() {
  const navigation = useNavigation();
  const route = useRoute<PlayerRoute>();
  const insets = useSafeAreaInsets();
  const { channel } = route.params;

  const { channels, favorites, currentChannel, setCurrentChannel, toggleFavorite, updatePlayerState } = useStore();

  const videoRef = useRef<Video>(null);
  const osdTimer = useRef<NodeJS.Timeout | null>(null);
  const osdAnim = useRef(new Animated.Value(1)).current;

  const [isPlaying, setIsPlaying] = useState(true);
  const [isBuffering, setIsBuffering] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showOSD, setShowOSD] = useState(true);
  const [showSidebar, setShowSidebar] = useState(false);
  const [volume, setVolume] = useState(1.0);
  const [isMuted, setIsMuted] = useState(false);
  const [playingChannel, setPlayingChannel] = useState<Channel>(channel);

  const isFav = favorites.includes(playingChannel.id);
  const currentIndex = channels.findIndex(c => c.id === playingChannel.id);

  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    showOSDTemporarily();
  }, []);

  // Hardware back button
  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      navigation.goBack();
      return true;
    });
    return () => handler.remove();
  }, [navigation]);

  const showOSDTemporarily = useCallback(() => {
    setShowOSD(true);
    Animated.timing(osdAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    if (osdTimer.current) clearTimeout(osdTimer.current);
    osdTimer.current = setTimeout(() => {
      Animated.timing(osdAnim, { toValue: 0, duration: 400, useNativeDriver: true }).start(() => {
        setShowOSD(false);
      });
    }, OSD_TIMEOUT);
  }, [osdAnim]);

  const handleScreenTap = useCallback(() => {
    if (showOSD) {
      if (osdTimer.current) clearTimeout(osdTimer.current);
      Animated.timing(osdAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setShowOSD(false));
    } else {
      showOSDTemporarily();
    }
  }, [showOSD, osdAnim, showOSDTemporarily]);

  const playChannel = useCallback((ch: Channel) => {
    setPlayingChannel(ch);
    setCurrentChannel(ch);
    setIsBuffering(true);
    setError(null);
    showOSDTemporarily();
  }, [setCurrentChannel, showOSDTemporarily]);

  const prevChannel = useCallback(() => {
    if (currentIndex > 0) playChannel(channels[currentIndex - 1]);
  }, [currentIndex, channels, playChannel]);

  const nextChannel = useCallback(() => {
    if (currentIndex < channels.length - 1) playChannel(channels[currentIndex + 1]);
  }, [currentIndex, channels, playChannel]);

  const handlePlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) {
      if (status.error) setError(`Erro: ${status.error}`);
      return;
    }
    setIsBuffering(status.isBuffering);
    setIsPlaying(status.isPlaying);
    updatePlayerState({
      isPlaying: status.isPlaying,
      isBuffering: status.isBuffering,
    });
  }, [updatePlayerState]);

  const togglePlay = useCallback(async () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      await videoRef.current.pauseAsync();
    } else {
      await videoRef.current.playAsync();
    }
    showOSDTemporarily();
  }, [isPlaying, showOSDTemporarily]);

  const groupChannels = channels.filter(c => c.group === playingChannel.group);

  return (
    <View style={styles.root}>
      {/* Video */}
      <TouchableOpacity
        style={styles.videoContainer}
        onPress={handleScreenTap}
        activeOpacity={1}
      >
        <Video
          ref={videoRef}
          source={{ uri: playingChannel.url }}
          style={styles.video}
          resizeMode={ResizeMode.CONTAIN}
          shouldPlay={true}
          isLooping={false}
          isMuted={isMuted}
          volume={volume}
          onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
          onError={(e) => setError('Erro ao reproduzir o canal')}
          useNativeControls={false}
        />

        {/* Buffering */}
        {isBuffering && !error && (
          <View style={styles.bufferingOverlay}>
            <View style={styles.bufferingBox}>
              <Ionicons name="reload" size={32} color={colors.accent2} />
              <Text style={styles.bufferingText}>Carregando...</Text>
            </View>
          </View>
        )}

        {/* Error */}
        {error && (
          <View style={styles.bufferingOverlay}>
            <View style={styles.errorBox}>
              <Ionicons name="warning" size={48} color={colors.red} />
              <Text style={styles.errorTitle}>Erro ao reproduzir</Text>
              <Text style={styles.errorMsg}>{playingChannel.name}</Text>
              <TVFocusable onPress={() => playChannel(playingChannel)} style={styles.retryBtn}>
                <Text style={styles.retryText}>Tentar Novamente</Text>
              </TVFocusable>
            </View>
          </View>
        )}

        {/* OSD overlay */}
        {showOSD && (
          <Animated.View style={[styles.osd, { opacity: osdAnim }]}>
            {/* Top bar */}
            <View style={styles.osdTop}>
              <TVFocusable onPress={() => navigation.goBack()} style={styles.backBtn}>
                <Ionicons name="chevron-back" size={22} color={colors.white} />
                <Text style={styles.backText}>Voltar</Text>
              </TVFocusable>

              <View style={styles.channelMeta}>
                {playingChannel.logo ? (
                  <Image source={{ uri: playingChannel.logo }} style={styles.osdLogo} resizeMode="contain" />
                ) : (
                  <View style={styles.osdLogoPlaceholder}>
                    <Text style={styles.osdLogoText}>{playingChannel.name.slice(0, 2).toUpperCase()}</Text>
                  </View>
                )}
                <View>
                  <Text style={styles.osdChannelName}>{playingChannel.name}</Text>
                  <View style={styles.osdBadges}>
                    <View style={styles.liveBadge}><Text style={styles.liveText}>● AO VIVO</Text></View>
                    <Text style={styles.osdGroup}>{playingChannel.group}</Text>
                    <Text style={styles.osdQuality}>{playingChannel.quality || 'HD'}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.osdTopActions}>
                <TVFocusable onPress={() => toggleFavorite(playingChannel.id)} style={styles.osdBtn}>
                  <Ionicons name={isFav ? 'star' : 'star-outline'} size={22} color={isFav ? colors.yellow : colors.white} />
                </TVFocusable>
                <TVFocusable onPress={() => setShowSidebar(!showSidebar)} style={styles.osdBtn}>
                  <Ionicons name="list" size={22} color={colors.white} />
                </TVFocusable>
              </View>
            </View>

            {/* Bottom controls */}
            <View style={styles.osdBottom}>
              <TVFocusable onPress={prevChannel} style={styles.ctrlBtn}>
                <Ionicons name="play-skip-back" size={28} color={colors.white} />
              </TVFocusable>

              <TVFocusable onPress={togglePlay} style={[styles.ctrlBtn, styles.ctrlBtnMain]} hasTVPreferredFocus>
                <Ionicons name={isPlaying ? 'pause' : 'play'} size={38} color={colors.white} />
              </TVFocusable>

              <TVFocusable onPress={nextChannel} style={styles.ctrlBtn}>
                <Ionicons name="play-skip-forward" size={28} color={colors.white} />
              </TVFocusable>

              <View style={styles.volControl}>
                <TVFocusable onPress={() => setIsMuted(!isMuted)} style={styles.ctrlBtn}>
                  <Ionicons name={isMuted ? 'volume-mute' : 'volume-high'} size={22} color={colors.white} />
                </TVFocusable>
              </View>

              <View style={{ flex: 1 }} />

              <View style={styles.channelNumber}>
                <Text style={styles.channelNumberText}>
                  {currentIndex + 1} / {channels.length}
                </Text>
              </View>
            </View>
          </Animated.View>
        )}
      </TouchableOpacity>

      {/* Sidebar channel list */}
      {showSidebar && (
        <View style={styles.sidebar}>
          <Text style={styles.sidebarTitle}>Canais — {playingChannel.group}</Text>
          <FlatList
            data={groupChannels.length > 0 ? groupChannels : channels}
            keyExtractor={item => item.id}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <TVFocusable
                onPress={() => playChannel(item)}
                style={[styles.sidebarItem, item.id === playingChannel.id && styles.sidebarItemActive]}
              >
                {item.logo ? (
                  <Image source={{ uri: item.logo }} style={styles.sidebarLogo} resizeMode="contain" />
                ) : (
                  <View style={styles.sidebarLogoPlaceholder}>
                    <Text style={styles.sidebarLogoText}>{item.name.slice(0, 2).toUpperCase()}</Text>
                  </View>
                )}
                <View style={styles.sidebarMeta}>
                  <Text style={styles.sidebarName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.sidebarGroup} numberOfLines={1}>{item.group}</Text>
                </View>
                {item.id === playingChannel.id && (
                  <View style={styles.sidebarPlaying} />
                )}
              </TVFocusable>
            )}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000', flexDirection: 'row' },
  videoContainer: { flex: 1, position: 'relative', justifyContent: 'center', alignItems: 'center' },
  video: { width: '100%', height: '100%' },

  // OSD
  osd: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    backgroundColor: 'transparent',
  },
  osdTop: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    padding: spacing.lg,
    paddingTop: spacing.xl,
    backgroundColor: 'rgba(0,0,0,0)',
    backgroundImage: 'linear-gradient(to bottom, rgba(0,0,0,0.85), transparent)',
  },
  osdBottom: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4 },
  backText: { color: colors.white, fontSize: fontSize.sm },
  channelMeta: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  osdLogo: { width: 52, height: 52, borderRadius: radius.sm, backgroundColor: '#ffffff11' },
  osdLogoPlaceholder: { width: 52, height: 52, borderRadius: radius.sm, backgroundColor: '#ffffff22', alignItems: 'center', justifyContent: 'center' },
  osdLogoText: { color: colors.white, fontSize: fontSize.sm, fontWeight: '700' },
  osdChannelName: { color: colors.white, fontSize: fontSize.xl, fontWeight: '700' },
  osdBadges: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  liveBadge: { backgroundColor: colors.red, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  liveText: { color: colors.white, fontSize: 10, fontWeight: '700' },
  osdGroup: { color: 'rgba(255,255,255,0.6)', fontSize: fontSize.xs },
  osdQuality: { color: colors.accent3, fontSize: fontSize.xs, fontWeight: '600' },
  osdTopActions: { flexDirection: 'row', gap: 8 },
  osdBtn: { padding: 8, borderRadius: radius.sm, backgroundColor: 'rgba(255,255,255,0.1)' },

  ctrlBtn: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  ctrlBtnMain: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: colors.accent,
  },
  volControl: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: spacing.md },
  channelNumber: {
    backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: radius.sm,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  channelNumberText: { color: colors.text2, fontSize: fontSize.xs },

  // Overlays
  bufferingOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  bufferingBox: { alignItems: 'center', gap: 12 },
  bufferingText: { color: colors.text2, fontSize: fontSize.md },
  errorBox: { alignItems: 'center', gap: 12, padding: 32, backgroundColor: 'rgba(0,0,0,0.8)', borderRadius: radius.lg },
  errorTitle: { color: colors.white, fontSize: fontSize.lg, fontWeight: '700' },
  errorMsg: { color: colors.text2, fontSize: fontSize.sm },
  retryBtn: { backgroundColor: colors.accent, borderRadius: radius.sm, paddingHorizontal: 20, paddingVertical: 10, marginTop: 8 },
  retryText: { color: colors.white, fontWeight: '700' },

  // Sidebar
  sidebar: { width: 280, backgroundColor: colors.bg1, borderLeftWidth: 1, borderLeftColor: colors.border },
  sidebarTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text1, padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  sidebarItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: spacing.md, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.03)',
  },
  sidebarItemActive: { backgroundColor: colors.accent + '18' },
  sidebarLogo: { width: 36, height: 36, borderRadius: radius.sm },
  sidebarLogoPlaceholder: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.bg3, alignItems: 'center', justifyContent: 'center' },
  sidebarLogoText: { color: colors.text2, fontSize: 11, fontWeight: '700' },
  sidebarMeta: { flex: 1 },
  sidebarName: { color: colors.text1, fontSize: fontSize.sm, fontWeight: '500' },
  sidebarGroup: { color: colors.text3, fontSize: fontSize.xs },
  sidebarPlaying: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent2 },
});
