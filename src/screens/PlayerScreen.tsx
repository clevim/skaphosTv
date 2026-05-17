import React, { useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, BackHandler } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import Video, { ResizeMode } from 'react-native-video';
import { Ionicons } from '@expo/vector-icons';

import { useStore } from '../store/useStore';
import { colors, fontSize } from '../utils/theme';
import { RootStackParamList } from '../types';
import { MAX_RETRIES, RETRY_DELAYS, usePlayer } from '@/hooks/usePlayer';
import PlayerOSD from '@/components/PlayerOSD';
import PlayerSidebar from '@/components/PlayerSidebar';
import PlayerError from '@/components/PlayerError';
import { fixStreamUrl } from '../utils/m3uParser';

// Teclas do controle FireTV / Android TV
const KEY = {
  DPAD_UP:          19,
  DPAD_DOWN:        20,
  DPAD_LEFT:        21,
  DPAD_RIGHT:       22,
  DPAD_CENTER:      23,
  MEDIA_PLAY_PAUSE: 85,
  MEDIA_PLAY:       126,
  MEDIA_PAUSE:      127,
  MEDIA_REWIND:     89,
  MEDIA_FAST_FWD:   90,
  MENU:             82,
};

type PlayerRoute = RouteProp<RootStackParamList, 'Player'>;

export default function PlayerScreen() {
  const navigation = useNavigation();
  const route = useRoute<PlayerRoute>();
  const { channel } = route.params;

  const { channels } = useStore();
  const player = usePlayer(channel);

  const {
    videoRef, osdAnim, videoKey, paused,
    playingChannel, isPlaying, isBuffering,
    isMuted, volume, error,
    retryCount, retryingIn,
    position, duration,
    showOSD, showSidebar,
    isLive, currentIndex,
    setVolume, setIsMuted, setShowSidebar,
    handleScreenTap, showOSDTemporarily,
    togglePlay, playChannel, prevChannel, nextChannel,
    manualRetry, seekBy, seekTo,
    onLoad, onProgress, onBuffer, onError, onEnd,
  } = player;

  const groupChannels = channels.filter(c => c.group === playingChannel.group);
  const sidebarChannels = groupChannels.length > 0 ? groupChannels : channels;

  const streamUrl = fixStreamUrl(playingChannel.url);

  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (showSidebar) { setShowSidebar(false); return true; }
      navigation.goBack();
      return true;
    });
    return () => handler.remove();
  }, [navigation, showSidebar]);

  // Refs para evitar closure stale nos callbacks de key event
  const showOSDRef    = useRef(showOSD);
  const showSidebarRef = useRef(showSidebar);
  const isLiveRef     = useRef(isLive);
  useEffect(() => { showOSDRef.current    = showOSD;    }, [showOSD]);
  useEffect(() => { showSidebarRef.current = showSidebar; }, [showSidebar]);
  useEffect(() => { isLiveRef.current     = isLive;     }, [isLive]);

  // onKeyDown no Android TV: onKeyDown fires no View pai mesmo quando
  // um filho tem o foco — key events sobem na hierarquia de views.
  // useTVEventHandler NÃO existe em react-native 0.74 padrão (só em tvos).
  const handleKeyDown = useCallback((e: any) => {
    const code: number = e?.nativeEvent?.keyCode ?? 0;
    showOSDTemporarily();

    // Quando OSD está aberto, o D-pad navega nos botões do OSD — não fazemos seek
    if (showOSDRef.current) return;

    switch (code) {
      case KEY.DPAD_LEFT:
      case KEY.MEDIA_REWIND:
        if (!isLiveRef.current) seekBy(-10);
        break;
      case KEY.DPAD_RIGHT:
      case KEY.MEDIA_FAST_FWD:
        if (!isLiveRef.current) seekBy(10);
        break;
      case KEY.DPAD_CENTER:
      case KEY.MEDIA_PLAY_PAUSE:
      case KEY.MEDIA_PLAY:
      case KEY.MEDIA_PAUSE:
        togglePlay();
        break;
      case KEY.DPAD_UP:
        setVolume((v: number) => Math.min(1, parseFloat((v + 0.1).toFixed(1))));
        break;
      case KEY.DPAD_DOWN:
        setVolume((v: number) => Math.max(0, parseFloat((v - 0.1).toFixed(1))));
        break;
      case KEY.MENU:
        if (showSidebarRef.current) setShowSidebar(false);
        else navigation.goBack();
        break;
    }
  }, [seekBy, togglePlay, setVolume, setShowSidebar, showOSDTemporarily, navigation]);

  return (
    // onKeyDown no root View captura todos os eventos de tecla do controle remoto.
    // Platform.OS guard: no iOS/web View não tem onKeyDown.
    <View
      style={styles.root}
      {...(Platform.OS === 'android' ? { onKeyDown: handleKeyDown } as any : {})}
    >
      <TouchableOpacity style={styles.videoContainer} onPress={handleScreenTap} activeOpacity={1}>
        <Video
          key={videoKey}
          ref={videoRef}
          source={{
            uri: streamUrl,
            headers: {
              'User-Agent': 'okhttp/4.9.0',
              'Connection': 'keep-alive',
            },
          }}
          style={StyleSheet.absoluteFill}
          resizeMode={ResizeMode.CONTAIN}
          paused={paused}
          muted={isMuted}
          volume={volume}
          repeat={false}
          bufferConfig={{
            minBufferMs: 5000,
            maxBufferMs: 30000,
            bufferForPlaybackMs: 2500,
            bufferForPlaybackAfterRebufferMs: 5000,
          }}
          ignoreSilentSwitch="ignore"
          playInBackground={false}
          playWhenInactive={false}
          onLoad={onLoad}
          onProgress={onProgress}
          onBuffer={onBuffer}
          onError={onError}
          onEnd={onEnd}
        />

        {isBuffering && !error && (
          <View style={styles.bufferingOverlay}>
            <Ionicons name="reload-circle" size={52} color={colors.accent2} />
            <Text style={styles.bufferingText}>Carregando...</Text>
            {retryCount > 0 && (
              <Text style={styles.retryLabel}>Tentativa {retryCount + 1} de {MAX_RETRIES}</Text>
            )}
          </View>
        )}

        {!!error && (
          <PlayerError
            channelName={playingChannel.name}
            error={error}
            retryCount={retryCount}
            retryingIn={retryingIn}
            maxRetries={MAX_RETRIES}
            retryDelays={RETRY_DELAYS}
            onRetryNow={manualRetry}
            onNextChannel={nextChannel}
          />
        )}

        {showOSD && (
          <PlayerOSD
            osdAnim={osdAnim}
            channel={playingChannel}
            isPlaying={isPlaying}
            isMuted={isMuted}
            volume={volume}
            isLive={isLive}
            position={position}
            duration={duration}
            currentIndex={currentIndex}
            totalChannels={channels.length}
            retryCount={retryCount}
            onBack={() => navigation.goBack()}
            onTogglePlay={togglePlay}
            onPrevChannel={prevChannel}
            onNextChannel={nextChannel}
            onToggleMute={() => setIsMuted(m => !m)}
            onVolumeChange={setVolume}
            onToggleSidebar={() => setShowSidebar(s => !s)}
            onSeekTo={seekTo}
            onSeekBy={seekBy}
          />
        )}
      </TouchableOpacity>

      {showSidebar && (
        <View style={styles.sidebarOverlay}>
          <TouchableOpacity
            style={styles.sidebarBackdrop}
            onPress={() => setShowSidebar(false)}
            activeOpacity={1}
          />
          <View style={styles.sidebarContainer}>
            <PlayerSidebar
              channels={sidebarChannels}
              currentChannel={playingChannel}
              onSelectChannel={(ch) => { playChannel(ch); setShowSidebar(false); }}
              onClose={() => setShowSidebar(false)}
            />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  videoContainer: { flex: 1 },
  bufferingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)', gap: 12,
  },
  bufferingText: { color: colors.text2, fontSize: fontSize.md, fontWeight: '500' },
  retryLabel: { color: colors.accent2, fontSize: fontSize.xs },
  sidebarOverlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
  },
  sidebarBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sidebarContainer: {
    width: 300,
  },
});