import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable, Platform, BackHandler, DeviceEventEmitter } from 'react-native';
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
import { IS_TV } from '../utils/tvDetect';
import { setPipEnabled, setPipPlaying } from '../utils/pip';
import { useMiniPlayer } from '../store/miniPlayer';

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
    rate, setRate,
    retryCount, retryingIn,
    position, duration,
    showOSD, showSidebar,
    isLive, hasPlaylist, currentIndex, totalSiblings,
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
  // Modo scrubbing (TV): estado EXPLÍCITO, não derivado de foco. Entra com ↓, sai com ▲.
  // As teclas chegam pelo canal nativo (SkaphosKeyDown), então não dependemos do foco
  // ficar na barra — o foco pode até escapar que o seek e o visual seguem este estado.
  const [scrubMode, setScrubMode] = useState(false);
  // Velocidade 2x ao segurar o canto (toque) — volta ao normal ao soltar.
  const [speedActive, setSpeedActive] = useState(false);
  const handleHoldStart = useCallback(() => {
    if (isLive) return;            // sem sentido em ao vivo
    setRate(2.0);
    setSpeedActive(true);
  }, [isLive, setRate]);
  const handleHoldEnd = useCallback(() => {
    setSpeedActive(prev => {
      if (prev) setRate(1.0);
      return false;
    });
  }, [setRate]);

  // Botão "próximo episódio" — só com playlist de série e havendo um próximo.
  const hasNextEpisode = hasPlaylist && currentIndex < totalSiblings - 1;

  // Mini-player (PiP dentro do app): ao entrar na tela cheia, fecha qualquer mini ativo.
  useEffect(() => {
    useMiniPlayer.getState().close();
  }, []);

  // Minimiza para o mini-player flutuante e volta à tela anterior (o mini segue tocando).
  const handleMinimize = useCallback(() => {
    useMiniPlayer.getState().open(playingChannel, position);
    if (navigation.canGoBack()) navigation.goBack();
  }, [playingChannel, position, navigation]);

  // Picture-in-Picture (Android, mobile): habilita a entrada automática em PiP enquanto
  // o player está aberto (filme, série OU ao vivo); desliga ao sair. Em PiP, esconde o OSD.
  const [inPip, setInPip] = useState(false);
  useEffect(() => {
    if (IS_TV) return;
    setPipEnabled(true);
    return () => setPipEnabled(false);
  }, []);
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('SkaphosPipChanged', (v: boolean) => setInPip(!!v));
    // Botão de play/pause da janela do PiP do sistema → alterna a reprodução
    const actionSub = DeviceEventEmitter.addListener('SkaphosPipAction', (action: string) => {
      if (action === 'playpause') togglePlay();
    });
    return () => { sub.remove(); actionSub.remove(); };
  }, [togglePlay]);

  // Mantém o ícone play/pause da janela do PiP em sincronia com o estado real
  useEffect(() => {
    setPipPlaying(isPlaying);
  }, [isPlaying]);

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

  // Lista lateral do player:
  //  • Série: episódios da temporada atual (a própria playlist passada pela SeriesScreen).
  //  • Filme/Ao vivo: outras mídias da MESMA subcategoria (mesmo grupo).
  const groupChannels = channels.filter(c => c.group === playingChannel.group);
  const sidebarChannels = playlist.length > 0
    ? playlist
    : (groupChannels.length > 0 ? groupChannels : channels);

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
      if (scrubMode) { setScrubMode(false); return true; }
      navigation.goBack();
      return true;
    });
    return () => handler.remove();
  }, [navigation, showSidebar, showSubtitleSheet, showAudioSheet, scrubMode]);

  // Refs para evitar closure stale nos callbacks de key event
  const showOSDRef       = useRef(showOSD);
  const showSidebarRef   = useRef(showSidebar);
  const isLiveRef        = useRef(isLive);
  const showSheetRef     = useRef(false);
  const scrubModeRef     = useRef(false);
  // Última tecla de seek do D-pad — permite que repetições rápidas façam scrub
  // mesmo com o OSD visível (segurar/spam = avanço acelerado).
  const lastSeekKeyRef   = useRef({ ts: 0, dir: 0 });
  useEffect(() => { showOSDRef.current     = showOSD;     }, [showOSD]);
  useEffect(() => { showSidebarRef.current = showSidebar; }, [showSidebar]);
  useEffect(() => { isLiveRef.current      = isLive;      }, [isLive]);
  useEffect(() => { showSheetRef.current   = showSubtitleSheet || showAudioSheet; }, [showSubtitleSheet, showAudioSheet]);
  useEffect(() => { scrubModeRef.current   = scrubMode; }, [scrubMode]);
  // Ao ocultar o OSD, sai do modo scrubbing (a barra some junto).
  useEffect(() => { if (!showOSD && scrubMode) setScrubMode(false); }, [showOSD, scrubMode]);

  // As teclas do controle chegam pelo canal nativo (SkaphosKeyDown) — ver useEffect.
  const handleKeyDown = useCallback((e: any) => {
    const code: number = e?.nativeEvent?.keyCode ?? 0;

    // Quando algum sheet (legenda/áudio) está aberto, ignora — o Modal cuida do foco
    if (showSheetRef.current) return;

    const isMediaSeek = code === KEY.MEDIA_FAST_FWD || code === KEY.MEDIA_REWIND;
    const dir =
      code === KEY.DPAD_RIGHT || code === KEY.MEDIA_FAST_FWD ?  1 :
      code === KEY.DPAD_LEFT  || code === KEY.MEDIA_REWIND   ? -1 : 0;

    if (dir !== 0) {
      showOSDTemporarily();
      if (isLiveRef.current) return;
      // Teclas de mídia (avançar/retroceder do controle) sempre fazem seek.
      if (isMediaSeek) { seekBy(10 * dir); return; }
      // ◀/▶ só mexem no tempo DENTRO do modo scrubbing (entra com ↓). Fora dele,
      // apenas mostram o OSD e o foco navega os botões — não avançam o vídeo.
      if (scrubModeRef.current) seekBy(10 * dir);
      return;
    }

    // ── DPAD_DOWN: entra no modo scrubbing (OSD visível, conteúdo com duração) ──
    if (code === KEY.DPAD_DOWN) {
      if (showOSDRef.current && !scrubModeRef.current && !isLiveRef.current) {
        setScrubMode(true);
        showOSDTemporarily();
        return;
      }
      showOSDTemporarily();
      if (!showOSDRef.current) setVolume((v: number) => Math.max(0, parseFloat((v - 0.1).toFixed(1))));
      return;
    }

    // ── DPAD_UP: sai do modo scrubbing ──
    if (code === KEY.DPAD_UP) {
      if (scrubModeRef.current) { setScrubMode(false); showOSDTemporarily(); return; }
      showOSDTemporarily();
      if (!showOSDRef.current) setVolume((v: number) => Math.min(1, parseFloat((v + 0.1).toFixed(1))));
      return;
    }

    showOSDTemporarily();

    // OK (DPAD_CENTER) é tratado pelo botão focado (Pressable.onPress) — inclusive no
    // scrubbing, onde o foco fica preso no play (botões de seek ficam disabled). Só as
    // teclas de mídia (que não têm foco) caem no togglePlay aqui.
    if (showOSDRef.current) return;

    switch (code) {
      case KEY.MEDIA_PLAY_PAUSE:
      case KEY.MEDIA_PLAY:
      case KEY.MEDIA_PAUSE:
        togglePlay();
        break;
      case KEY.MENU:
        if (showSidebarRef.current) setShowSidebar(false);
        else navigation.goBack();
        break;
    }
  }, [seekBy, togglePlay, setVolume, setShowSidebar, showOSDTemporarily, navigation]);

  // Android (TV): a prop onKeyDown da <View> NÃO é suportada em RN puro. As teclas do
  // controle chegam via evento nativo 'SkaphosKeyDown' (MainActivity.dispatchKeyEvent →
  // RCTDeviceEventEmitter). Reaproveita a mesma lógica de seek/scrubbing.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = DeviceEventEmitter.addListener('SkaphosKeyDown', (keyCode: number) => {
      handleKeyDown({ nativeEvent: { keyCode } });
    });
    return () => sub.remove();
  }, [handleKeyDown]);

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
    // Teclas do controle remoto (Android TV) chegam via DeviceEventEmitter
    // 'SkaphosKeyDown' (ver useEffect acima) — a prop onKeyDown da View não existe em RN.
    <View style={styles.root}>
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
          rate={rate}
          repeat={false}
          bufferConfig={{
            minBufferMs: 5000,
            maxBufferMs: 30000,
            bufferForPlaybackMs: 2500,
            bufferForPlaybackAfterRebufferMs: 5000,
          }}
          ignoreSilentSwitch="ignore"
          // Android mobile: mantém a reprodução ao entrar em PiP (senão o frame congela).
          // TV/web seguem sem playback em segundo plano.
          playInBackground={!IS_TV && Platform.OS === 'android'}
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

        {/* Zona de "segurar para 2x" — canto direito (toque). Tap normal ainda
            mostra/esconde o OSD; segurar acelera para 2x e soltar volta ao normal.
            Fica abaixo do OSD (renderizado depois), então os botões do OSD têm prioridade. */}
        {!IS_TV && Platform.OS !== 'web' && !isLive && !inPip && (
          <Pressable
            style={styles.speedZone}
            onPress={handleScreenTap}
            onLongPress={handleHoldStart}
            onPressOut={handleHoldEnd}
            delayLongPress={280}
          />
        )}

        {speedActive && (
          <View style={styles.speedIndicator} pointerEvents="none">
            <Ionicons name="play-forward" size={16} color="#0a0a0b" />
            <Text style={styles.speedIndicatorText}>2x</Text>
          </View>
        )}

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

        {showOSD && !inPip && (
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
            showNextEpisode={hasNextEpisode}
            onNextEpisode={nextChannel}
            showMinimize={!IS_TV}
            onMinimize={handleMinimize}
            scrubMode={scrubMode}
          />
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

      {showSidebar && !inPip && (
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
              title={playlist.length > 0 ? 'Episódios' : undefined}
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
  // Zona de toque do canto direito para o gesto de segurar = 2x
  speedZone: {
    position: 'absolute',
    top: 0, bottom: 0, right: 0,
    width: '40%',
  },
  speedIndicator: {
    position: 'absolute',
    top: 24,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  speedIndicatorText: { fontSize: 14, fontWeight: '800', color: '#0a0a0b', letterSpacing: 0.5 },
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