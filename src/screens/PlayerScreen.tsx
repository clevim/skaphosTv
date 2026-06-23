import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, BackHandler } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import Video, { ResizeMode, SelectedTrackType, TextTracksType } from 'react-native-video';
import type { ISO639_1 } from 'react-native-video/src/types/language';
// ^^ ISO639_1 usado como cast de tipo no externalTextTracks — TS precisa do import explícito
import { Ionicons } from '@expo/vector-icons';

import { useStore } from '../store/useStore';
import { colors, fontSize } from '../utils/theme';
import { RootStackParamList } from '../types';
import { MAX_RETRIES, RETRY_DELAYS, usePlayer } from '@/hooks/usePlayer';
import PlayerOSD from '@/components/PlayerOSD';
import PlayerSidebar from '@/components/PlayerSidebar';
import PlayerError from '@/components/PlayerError';
import SubtitleSheet from '@/components/SubtitleSheet';
import AudioTrackSheet from '@/components/AudioTrackSheet';
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
  const {
    channel,
    initialSubtitleIndex = null,
    initialSubtitleTracks = [],
    initialAudioIndex = null,
    initialAudioTracks = [],
    playlist = [],
  } = route.params;

  const channels = useStore(s => s.channels);
  const subtitleSize = useStore(s => s.settings.subtitleSize);
  // Ao terminar (filme ou último episódio) o player se fecha sozinho
  const handleRequestClose = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
  }, [navigation]);
  const player = usePlayer(
    channel, initialSubtitleIndex, initialSubtitleTracks, initialAudioIndex, initialAudioTracks,
    playlist, handleRequestClose,
  );

  // Estilo da legenda: paddingBottom levanta da borda (evita corte na base);
  // fontSize vem do ajuste do usuário. (react-native-video 6 só expõe size/padding/opacity.)
  const subtitleStyle = useMemo(() => {
    const fontSize = subtitleSize === 'small' ? 14 : subtitleSize === 'large' ? 28 : 20;
    return { fontSize, paddingBottom: 48, opacity: 1 };
  }, [subtitleSize]);

  const {
    videoRef, osdAnim, videoKey, paused,
    playingChannel, isPlaying, isBuffering,
    isMuted, volume, error,
    retryCount, retryingIn,
    position, duration,
    showOSD, showSidebar, seekHint,
    isLive, currentIndex, totalSiblings,
    subtitleTracks, selectedSubtitleIndex,
    vttSubtitleIndex, switchSubtitleTrack,
    audioTracks, currentAudioIndex, audioReady, switchAudioTrack,
    setVolume, setIsMuted, setShowSidebar,
    handleScreenTap, showOSDTemporarily,
    togglePlay, playChannel, prevChannel, nextChannel,
    manualRetry, seekBy, seekTo,
    onLoad, onProgress, onBuffer, onError, onEnd,
  } = player;

  const [showSubtitleSheet, setShowSubtitleSheet] = useState(false);
  const [showAudioSheet, setShowAudioSheet] = useState(false);

  // ── Track selection ───────────────────────────────────────────────────────────
  //
  // ÁUDIO — LANGUAGE confirmado funcionando. audioReady guard evita aplicar antes
  // do onLoad (grupos ExoPlayer precisam existir).
  const iso639: Record<string, string> = {
    por: 'pt', eng: 'en', spa: 'es', fra: 'fr', deu: 'de',
    ita: 'it', jpn: 'ja', zho: 'zh', kor: 'ko', ara: 'ar', rus: 'ru',
    nld: 'nl', pol: 'pl', tur: 'tr', swe: 'sv', nor: 'no', dan: 'da',
    fin: 'fi', heb: 'he', hin: 'hi', tha: 'th', vie: 'vi', ind: 'id',
  };
  const toLang2 = (code: string): string => {
    if (!code) return '';
    const lc = code.toLowerCase();
    if (lc.length === 2) return lc;
    return iso639[lc] ?? lc.slice(0, 2);
  };

  const selectedAudioTrack = useMemo(() => {
    if (!audioReady || currentAudioIndex === null || audioTracks.length === 0) return undefined;
    const track = audioTracks.find(t => t.index === currentAudioIndex);
    if (!track) return undefined;
    const lang = toLang2(track.language);
    if (lang && lang !== 'und') return { type: SelectedTrackType.LANGUAGE, value: lang };
    // Fallback INDEX para idiomas desconhecidos
    const sorted = [...audioTracks].sort((a, b) => a.index - b.index);
    const exoIdx = sorted.findIndex(t => t.index === currentAudioIndex);
    return exoIdx >= 0 ? { type: SelectedTrackType.INDEX, value: exoIdx } : undefined;
  }, [audioReady, currentAudioIndex, audioTracks]); // eslint-disable-line react-hooks/exhaustive-deps

  // LEGENDA — carrega SOMENTE a legenda ativa (vttSubtitleIndex) como VTT (1 arquivo).
  //
  // Por quê apenas 1:
  //  • setTextTracks() → reloadSource() no Java: reinicia o player. Mudar mid-playback
  //    é viável pois switchSubtitleTrack salva a posição em pendingSeekRef antes.
  //  • N VTTs simultâneos causam MergingMediaSource pesado → seek trava infinitamente.
  //  • 1 VTT pequeno (SRT típico: 10–100 KB) não afeta o seek.
  //
  // Seleção: LANGUAGE com ID único jf-sub-{index} — matching exato no Java (.equals()).
  const activeVttTrack = useMemo(() => {
    if (vttSubtitleIndex === null) return [];
    const track = subtitleTracks.find(t => t.index === vttSubtitleIndex);
    if (!track?.vttUrl) return [];
    return [{
      title:    track.displayTitle,
      language: `jf-sub-${track.index}` as ISO639_1,
      uri:      track.vttUrl,
      type:     TextTracksType.VTT,
    }];
  }, [vttSubtitleIndex, subtitleTracks]);

  const selectedTextTrack = useMemo(() => {
    if (!audioReady || selectedSubtitleIndex === null) return { type: SelectedTrackType.DISABLED };
    const track = subtitleTracks.find(t => t.index === selectedSubtitleIndex);
    if (!track) return { type: SelectedTrackType.DISABLED };

    // Legenda cujo VTT está carregado → LANGUAGE com ID único (matching garantido)
    if (track.index === vttSubtitleIndex && track.vttUrl) {
      return { type: SelectedTrackType.LANGUAGE, value: `jf-sub-${track.index}` };
    }

    return { type: SelectedTrackType.DISABLED };
  }, [audioReady, selectedSubtitleIndex, subtitleTracks, vttSubtitleIndex]);

  const groupChannels = channels.filter(c => c.group === playingChannel.group);
  const sidebarChannels = groupChannels.length > 0 ? groupChannels : channels;

  // URL estável — não varia com audioIndex/subtitleIndex.
  // Para Direct Play (static=true) o servidor ignora audioStreamIndex de qualquer forma;
  // a seleção de faixa é feita pelas props selectedAudioTrack / selectedTextTrack do player.
  const streamUrl = useMemo(
    () => fixStreamUrl(playingChannel.url),
    [playingChannel.url], // só muda ao trocar de canal — nunca ao trocar faixa
  );

  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (showSubtitleSheet) { setShowSubtitleSheet(false); return true; }
      if (showAudioSheet) { setShowAudioSheet(false); return true; }
      if (showSidebar) { setShowSidebar(false); return true; }
      navigation.goBack();
      return true;
    });
    return () => handler.remove();
  }, [navigation, showSidebar, showSubtitleSheet, showAudioSheet]);

  // Refs para evitar closure stale nos callbacks de key event
  const showOSDRef       = useRef(showOSD);
  const showSidebarRef   = useRef(showSidebar);
  const isLiveRef        = useRef(isLive);
  const showSheetRef     = useRef(false);
  // true quando a barra de progresso está focada na TV → D-pad esq/dir faz scrubbing
  const scrubFocusedRef  = useRef(false);
  // Última tecla de seek do D-pad — permite que repetições rápidas façam scrub
  // mesmo com o OSD visível (segurar/spam = avanço acelerado).
  const lastSeekKeyRef   = useRef({ ts: 0, dir: 0 });
  useEffect(() => { showOSDRef.current     = showOSD;     }, [showOSD]);
  useEffect(() => { showSidebarRef.current = showSidebar; }, [showSidebar]);
  useEffect(() => { isLiveRef.current      = isLive;      }, [isLive]);
  useEffect(() => { showSheetRef.current   = showSubtitleSheet || showAudioSheet; }, [showSubtitleSheet, showAudioSheet]);

  // onKeyDown no Android TV: onKeyDown fires no View pai mesmo quando
  // um filho tem o foco — key events sobem na hierarquia de views.
  // useTVEventHandler NÃO existe em react-native 0.74 padrão (só em tvos).
  const handleKeyDown = useCallback((e: any) => {
    const code: number = e?.nativeEvent?.keyCode ?? 0;

    // Quando algum sheet (legenda/áudio) está aberto, ignora — o Modal cuida do foco
    if (showSheetRef.current) return;

    // ── Seek por D-pad ──────────────────────────────────────────────────────────
    // DPAD_LEFT/RIGHT: direita avança, esquerda volta. Teclas de mídia (FF/RW) sempre
    // fazem seek. Para o D-pad: com OSD oculto, tap normal faz seek; com OSD visível,
    // só repetições rápidas (segurar/spam) fazem scrub — tap isolado navega os botões.
    const isMediaSeek = code === KEY.MEDIA_FAST_FWD || code === KEY.MEDIA_REWIND;
    const dir =
      code === KEY.DPAD_RIGHT || code === KEY.MEDIA_FAST_FWD ?  1 :
      code === KEY.DPAD_LEFT  || code === KEY.MEDIA_REWIND   ? -1 : 0;

    if (dir !== 0) {
      showOSDTemporarily();
      if (isLiveRef.current) return;
      if (isMediaSeek) { seekBy(10 * dir); return; }

      // Barra de progresso focada (TV): esquerda/direita sempre faz scrub (segurar acelera).
      if (scrubFocusedRef.current) { seekBy(10 * dir); return; }

      const now = Date.now();
      const prev = lastSeekKeyRef.current;
      const rapid = dir === prev.dir && now - prev.ts < 500;
      lastSeekKeyRef.current = { ts: now, dir };

      // OSD oculto → seek direto. OSD visível → só se for repetição rápida.
      if (!showOSDRef.current || rapid) seekBy(10 * dir);
      return;
    }

    showOSDTemporarily();

    // Quando OSD está aberto, o D-pad navega nos botões do OSD — não fazemos seek
    if (showOSDRef.current) return;

    switch (code) {
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

  // Web: o View não tem onKeyDown, então o teclado vira o "D-pad" reaproveitando
  // a mesma lógica de seek/aceleração/indicador via um listener de window.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const webKeyMap: Record<string, number> = {
      ArrowRight: KEY.DPAD_RIGHT,
      ArrowLeft:  KEY.DPAD_LEFT,
      ArrowUp:    KEY.DPAD_UP,
      ArrowDown:  KEY.DPAD_DOWN,
      Enter:      KEY.DPAD_CENTER,
      ' ':        KEY.MEDIA_PLAY_PAUSE,
    };
    const onKey = (ev: KeyboardEvent) => {
      const code = webKeyMap[ev.key];
      if (code == null) return;
      ev.preventDefault();
      handleKeyDown({ nativeEvent: { keyCode: code } });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleKeyDown]);

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
          textTracks={activeVttTrack}
          selectedTextTrack={selectedTextTrack}
          subtitleStyle={subtitleStyle}
          selectedAudioTrack={selectedAudioTrack}
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
            totalChannels={totalSiblings}
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
            hasSubtitles={subtitleTracks.length > 0}
            subtitleActive={selectedSubtitleIndex !== null}
            onToggleSubtitles={() => setShowSubtitleSheet(true)}
            hasAudio={audioTracks.length > 1}
            onToggleAudio={() => setShowAudioSheet(true)}
            onScrubFocusChange={(f) => { scrubFocusedRef.current = f; }}
          />
        )}

        {seekHint && (
          <View pointerEvents="none" style={styles.seekHint}>
            <Text style={styles.seekHintText}>
              {seekHint.dir === 'fwd' ? '⏩' : '⏪'} {seekHint.dir === 'fwd' ? '+' : '−'}{seekHint.amount}s
            </Text>
          </View>
        )}

        <SubtitleSheet
          visible={showSubtitleSheet}
          tracks={subtitleTracks}
          selectedIndex={selectedSubtitleIndex}
          onSelect={switchSubtitleTrack}
          onClose={() => setShowSubtitleSheet(false)}
        />
        <AudioTrackSheet
          visible={showAudioSheet}
          tracks={audioTracks}
          selectedIndex={currentAudioIndex}
          onSelect={switchAudioTrack}
          onClose={() => setShowAudioSheet(false)}
        />
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
  seekHint: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
  },
  seekHintText: {
    color: colors.accent,
    fontSize: fontSize.hero,
    fontWeight: '700',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.55)',
    overflow: 'hidden',
  },
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