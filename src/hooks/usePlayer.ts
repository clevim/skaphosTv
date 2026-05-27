import { useRef, useState, useEffect, useCallback } from 'react';
import { Animated, Platform } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useStore } from '../store/useStore';
import { Channel } from '../types';
import { IS_TV } from '../utils/tvDetect';
import {
  parseJellyfinVideoUrl, markJellyfinWatched, reportJellyfinProgress,
  getJellyfinSubtitleTracks, JellyfinSubtitleTrack,
  getJellyfinAudioTracks, JellyfinAudioTrack,
} from '../utils/jellyfinLoader';
import { SubtitleTrack, AudioTrack } from '../types';
const IS_WEB = Platform.OS === 'web';
const OSD_TIMEOUT = IS_TV ? 6000 : 4000;

export const MAX_RETRIES = 5;
export const RETRY_DELAYS = [2000, 4000, 8000, 15000, 30000];

export function usePlayer(
  initialChannel: Channel,
  initialSubtitleIndex: number | null = null,
  initialSubtitleTracks: SubtitleTrack[] = [],
  initialAudioIndex: number | null = null,
  initialAudioTracks: AudioTrack[] = [],
) {
  const { channels, sources, setCurrentChannel, updatePlayerState } = useStore();

  const videoRef = useRef<any>(null);
  const osdTimer = useRef<NodeJS.Timeout | null>(null);
  const retryTimer = useRef<NodeJS.Timeout | null>(null);
  const retryCountdown = useRef<NodeJS.Timeout | null>(null);
  const heartbeatTimer = useRef<NodeJS.Timeout | null>(null);
  const osdAnim = useRef(new Animated.Value(1)).current;

  // Refs para evitar closures stale em callbacks assíncronos
  const playingChannelRef = useRef<Channel>(initialChannel);
  const positionRef       = useRef(0);
  const sourcesRef        = useRef(sources);
  useEffect(() => { sourcesRef.current = sources; }, [sources]);

  const [playingChannel, setPlayingChannel] = useState<Channel>(initialChannel);
  const [videoKey, setVideoKey] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isBuffering, setIsBuffering] = useState(true);
  const [paused, setPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1.0);

  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [retryingIn, setRetryingIn] = useState<number | null>(null);

  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seekableDuration, setSeekableDuration] = useState(0);

  const [showOSD, setShowOSD] = useState(true);
  const [showSidebar, setShowSidebar] = useState(false);
  // Inicializa com as faixas pré-buscadas no JellyfinTrackSheet (evita update mid-playback)
  const [subtitleTracks, setSubtitleTracks] = useState<JellyfinSubtitleTrack[]>(initialSubtitleTracks);
  const [selectedSubtitleIndex, setSelectedSubtitleIndex] = useState<number | null>(null);
  // Índice da legenda cujo VTT está carregado no textTracks do player.
  // Mudar este valor causa setTextTracks → reloadSource → player reinicia (posição salva via pendingSeekRef).
  const [vttSubtitleIndex, setVttSubtitleIndex] = useState<number | null>(initialSubtitleIndex);
  const [audioTracks, setAudioTracks] = useState<JellyfinAudioTrack[]>(initialAudioTracks);
  // Inicializa de forma síncrona: usa initialAudioIndex se fornecido, senão não há faixa selecionada
  const [currentAudioIndex, setCurrentAudioIndex] = useState<number | null>(initialAudioIndex);
  const pendingSeekRef = useRef<number | null>(null);
  // Distingue primeira carga do player de reloads
  const isFirstLoadRef = useRef(true);
  // true após onLoad — evita aplicar selectedAudioTrack antes dos grupos ExoPlayer existirem
  // (quando groups.length=0, type:'index' com value.asInt() causa crash UnexpectedNativeTypeException)
  const [audioReady, setAudioReady] = useState(false);

  const isLive = !duration || duration === 0;
  const currentIndex = channels.findIndex(c => c.id === playingChannel.id);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    }
    showOSDTemporarily();
    return () => {
      if (Platform.OS !== 'web') ScreenOrientation.unlockAsync();
      clearAllTimers();
    };
  }, []);

  // Sincroniza refs com estado atual
  useEffect(() => { playingChannelRef.current = playingChannel; }, [playingChannel]);

  const clearAllTimers = () => {
    if (osdTimer.current) clearTimeout(osdTimer.current);
    if (retryTimer.current) clearTimeout(retryTimer.current);
    if (retryCountdown.current) clearInterval(retryCountdown.current);
    if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
  };

  // Helpers Jellyfin: busca credenciais da fonte pelo host
  const getJellyfinCreds = useCallback((host: string) => {
    const src = sourcesRef.current.find(
      s => s.type === 'jellyfin' && s.host?.replace(/\/$/, '') === host
    );
    return src ? { userId: src.userId, apiKey: src.apiKey } : null;
  }, []);

  // Inicia heartbeat de progresso para canais Jellyfin
  const startJellyfinHeartbeat = useCallback((host: string, apiKey: string, userId: string, itemId: string) => {
    if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
    heartbeatTimer.current = setInterval(() => {
      const ticks = Math.round(positionRef.current * 10_000_000);
      reportJellyfinProgress(host, apiKey, userId, itemId, ticks).catch(() => {});
    }, 10_000);
  }, []);

  const showOSDTemporarily = useCallback(() => {
    setShowOSD(true);
    Animated.timing(osdAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    if (osdTimer.current) clearTimeout(osdTimer.current);
    osdTimer.current = setTimeout(() => {
      Animated.timing(osdAnim, { toValue: 0, duration: 400, useNativeDriver: true })
        .start(() => setShowOSD(false));
    }, OSD_TIMEOUT);
  }, [osdAnim]);

  const handleScreenTap = useCallback(() => {
    if (showOSD) {
      if (osdTimer.current) clearTimeout(osdTimer.current);
      Animated.timing(osdAnim, { toValue: 0, duration: 200, useNativeDriver: true })
        .start(() => setShowOSD(false));
    } else {
      showOSDTemporarily();
    }
  }, [showOSD, osdAnim, showOSDTemporarily]);

  const scheduleRetry = useCallback((attempt: number) => {
    if (attempt >= MAX_RETRIES) {
      setError(`Falha após ${MAX_RETRIES} tentativas. Verifique sua conexão.`);
      setRetryingIn(null);
      return;
    }
    const delay = RETRY_DELAYS[attempt] ?? 30000;
    let remaining = Math.ceil(delay / 1000);
    setRetryingIn(remaining);
    if (retryCountdown.current) clearInterval(retryCountdown.current);
    retryCountdown.current = setInterval(() => {
      remaining -= 1;
      setRetryingIn(remaining);
      if (remaining <= 0 && retryCountdown.current) clearInterval(retryCountdown.current);
    }, 1000);
    if (retryTimer.current) clearTimeout(retryTimer.current);
    retryTimer.current = setTimeout(() => {
      setRetryingIn(null);
      setRetryCount(attempt + 1);
      setIsBuffering(true);
      setError(null);
      setVideoKey(k => k + 1);
    }, delay);
  }, []);

  const manualRetry = useCallback(() => {
    clearAllTimers();
    setRetryCount(0);
    setRetryingIn(null);
    setIsBuffering(true);
    setError(null);
    setVideoKey(k => k + 1);
  }, []);

  const playChannel = useCallback((ch: Channel) => {
    clearAllTimers();
    setAudioReady(false);
    playingChannelRef.current = ch;
    setPlayingChannel(ch);
    setCurrentChannel(ch);
    setIsBuffering(true);
    setError(null);
    setRetryCount(0);
    setRetryingIn(null);
    setPosition(0);
    setDuration(0);
    setSeekableDuration(0);
    setPaused(false);
    setSubtitleTracks([]);
    setSelectedSubtitleIndex(null);
    setAudioTracks([]);
    setCurrentAudioIndex(null); // será populado em onLoad
    pendingSeekRef.current = null;
    isFirstLoadRef.current = true;
    setVideoKey(k => k + 1);
    showOSDTemporarily();
  }, [setCurrentChannel, showOSDTemporarily]);

  const prevChannel = useCallback(() => {
    if (currentIndex > 0) playChannel(channels[currentIndex - 1]);
  }, [currentIndex, channels, playChannel]);

  const nextChannel = useCallback(() => {
    if (currentIndex < channels.length - 1) playChannel(channels[currentIndex + 1]);
  }, [currentIndex, channels, playChannel]);

  const onLoad = useCallback((data: any) => {
    setAudioReady(true); // ← libera selectedAudioTrack só agora (grupos ExoPlayer existem)
    setDuration(data.duration ?? 0);
    setIsBuffering(false);
    setError(null);
    if (retryCount > 0) setRetryCount(0);
    updatePlayerState({ isPlaying: true, isBuffering: false });

    // Seek pendente (após troca de faixa de áudio) — registra ANTES de limpar o ref
    const hadPendingSeek = pendingSeekRef.current !== null;
    if (hadPendingSeek) {
      const seekTo = pendingSeekRef.current!;
      pendingSeekRef.current = null;
      setTimeout(() => {
        try { videoRef.current?.seek(seekTo); } catch (_) {}
        positionRef.current = seekTo;
        setPosition(seekTo);
      }, 500);
    }

    // Jellyfin: retoma posição anterior e inicia heartbeat de progresso
    const ch = playingChannelRef.current;
    if (ch?.id?.startsWith('jf-')) {
      const parsed = parseJellyfinVideoUrl(ch.url);
      if (parsed) {
        const creds = getJellyfinCreds(parsed.host);
        if (creds?.userId && creds?.apiKey) {
          // Resume só na carga inicial — não interferir com seek de troca de áudio
          if (!hadPendingSeek) {
            const resumeSecs = (ch.resumePositionTicks ?? 0) / 10_000_000;
            if (resumeSecs > 30) {
              setTimeout(() => {
                try { videoRef.current?.seek(resumeSecs); } catch (_) {}
                positionRef.current = resumeSecs;
                setPosition(resumeSecs);
              }, 500);
            }
          }
          // Heartbeat a cada 10s
          startJellyfinHeartbeat(parsed.host, creds.apiKey, creds.userId, parsed.itemId);

          // Faixas de legenda e áudio
          const firstLoad = isFirstLoadRef.current;
          isFirstLoadRef.current = false;

          // Legendas: se pré-carregadas pelo JellyfinTrackSheet, apenas ativa o índice.
          // Caso contrário (troca de canal via sidebar), busca da API.
          if (firstLoad && initialSubtitleTracks.length > 0) {
            setSelectedSubtitleIndex(initialSubtitleIndex);
          } else {
            getJellyfinSubtitleTracks(parsed.host, creds.apiKey, creds.userId, parsed.itemId)
              .then(tracks => {
                setSubtitleTracks(tracks);
                if (firstLoad) setSelectedSubtitleIndex(initialSubtitleIndex);
              })
              .catch(() => {});
          }

          // Áudio: usa pré-carregado do JellyfinTrackSheet; se não houver, busca da API
          if (firstLoad && initialAudioTracks.length > 0) {
            // já em estado — initialAudioIndex já foi aplicado no useState
          } else {
            getJellyfinAudioTracks(parsed.host, creds.apiKey, creds.userId, parsed.itemId)
              .then(tracks => {
                setAudioTracks(tracks);
                if (firstLoad && tracks.length > 0) {
                  // Seleciona a faixa padrão do arquivo se não houver preferência
                  const def = tracks.find(t => t.isDefault) ?? tracks[0];
                  setCurrentAudioIndex(def.index);
                }
              })
              .catch(() => {});
          }
        }
      }
    }
  }, [retryCount, updatePlayerState, getJellyfinCreds, startJellyfinHeartbeat, initialSubtitleIndex, initialAudioTracks, initialAudioIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  const onProgress = useCallback((data: any) => {
    positionRef.current = data.currentTime ?? 0;
    setPosition(data.currentTime ?? 0);
    if (data.seekableDuration) setSeekableDuration(data.seekableDuration);
  }, []);

  const onBuffer = useCallback((data: any) => {
    setIsBuffering(data.isBuffering);
    updatePlayerState({ isPlaying: !data.isBuffering, isBuffering: data.isBuffering });
  }, [updatePlayerState]);

  const onError = useCallback((err: any) => {
    const code = err?.error?.errorCode;
    const exception = err?.error?.errorException || '';

    let msg = 'Falha ao reproduzir o canal.';

    if (exception.includes('UnknownHostException') || exception.includes('SocketException')) {
      msg = 'Sem conexão com o servidor.';
    } else if (exception.includes('FileNotFoundException') || exception.includes('404')) {
      msg = 'Canal não encontrado no servidor.';
    } else if (exception.includes('403') || exception.includes('Forbidden')) {
      msg = 'Acesso negado. Verifique sua assinatura.';
    } else if (exception.includes('IllegalArgumentException')) {
      msg = 'Erro de configuração do player.';
    } else if (code === '1001') {
      msg = 'Erro interno do player.';
    }

    setError(msg);
    setIsBuffering(false);
    scheduleRetry(retryCount);
  }, [retryCount, scheduleRetry]);

  const onEnd = useCallback(() => {
    setIsPlaying(false);
    setPaused(true);
    if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);

    // Jellyfin: marca como assistido
    const ch = playingChannelRef.current;
    if (ch?.id?.startsWith('jf-')) {
      const parsed = parseJellyfinVideoUrl(ch.url);
      if (parsed) {
        const creds = getJellyfinCreds(parsed.host);
        if (creds?.userId && creds?.apiKey) {
          markJellyfinWatched(parsed.host, creds.apiKey, creds.userId, parsed.itemId).catch(() => {});
        }
      }
    }
  }, [getJellyfinCreds]);

  const seekToSeconds = useCallback((seconds: number) => {
    const v = videoRef.current;
    if (!v) return;
    try {
      if (IS_WEB) {
        if (typeof v.seek === 'function') {
          v.seek(seconds);
        } else {
          const el = document.querySelector('video') as HTMLVideoElement | null;
          if (el) el.currentTime = seconds;
        }
      } else {
        v.seek(seconds);
      }
    } catch (_) { }
    setPosition(seconds);
  }, []);

  const seekBy = useCallback((seconds: number) => {
    if (isLive) return;
    const max = seekableDuration || duration;
    if (!max) return;
    const next = Math.max(0, Math.min(max, position + seconds));
    seekToSeconds(next);
    showOSDTemporarily();
  }, [position, duration, seekableDuration, isLive, seekToSeconds, showOSDTemporarily]);

  const seekTo = useCallback((pct: number) => {
    if (isLive) return;
    const max = seekableDuration || duration;
    if (!max) return;
    const next = Math.max(0, Math.min(max, pct * max));
    seekToSeconds(next);
  }, [duration, seekableDuration, isLive, seekToSeconds]);

  const togglePlay = useCallback(() => {
    setPaused(p => { setIsPlaying(!!p); return !p; });
    showOSDTemporarily();
  }, [showOSDTemporarily]);

  /**
   * Troca a faixa de áudio Jellyfin durante a reprodução.
   * Usa a prop selectedAudioTrack do react-native-video para instruir o ExoPlayer
   * diretamente — não recarrega o player (Direct Play envia o arquivo completo).
   */
  const switchAudioTrack = useCallback((streamIndex: number) => {
    setCurrentAudioIndex(streamIndex);
  }, []);

  /**
   * Troca a legenda durante a reprodução.
   * Se a legenda selecionada é diferente da carregada no VTT atual, salva a posição
   * e muda vttSubtitleIndex — isso causa setTextTracks → reloadSource no Java,
   * reiniciando o player que retoma via pendingSeekRef.
   * Se for a mesma legenda (ou desativar), só atualiza selectedSubtitleIndex — sem reload.
   */
  const switchSubtitleTrack = useCallback((index: number | null) => {
    setSelectedSubtitleIndex(index);
    if (index !== null && index !== vttSubtitleIndex) {
      // Nova legenda diferente: precisa carregar novo VTT → salva posição e recarrega
      pendingSeekRef.current = positionRef.current;
      setVttSubtitleIndex(index);
    }
    // index === null (desativar) ou mesma legenda: sem reload, selectedTextTrack lida via DISABLED/LANGUAGE
  }, [vttSubtitleIndex]);

  return {
    videoRef, osdAnim, videoKey, paused,
    playingChannel, isPlaying, isBuffering,
    isMuted, volume, error,
    retryCount, retryingIn,
    position, duration, seekableDuration,
    showOSD, showSidebar,
    isLive, currentIndex,
    subtitleTracks, selectedSubtitleIndex, setSelectedSubtitleIndex,
    vttSubtitleIndex,
    audioTracks, currentAudioIndex, audioReady, switchAudioTrack,
    switchSubtitleTrack,
    setVolume, setIsMuted, setShowOSD, setShowSidebar,
    showOSDTemporarily, handleScreenTap,
    togglePlay, playChannel, prevChannel, nextChannel,
    manualRetry, seekBy, seekTo,
    onLoad, onProgress, onBuffer, onError, onEnd,
  };
}