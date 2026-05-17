import { useRef, useState, useEffect, useCallback } from 'react';
import { Animated, Platform } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useStore } from '../store/useStore';
import { Channel } from '../types';
import { IS_TV } from '../utils/tvDetect';
const IS_WEB = Platform.OS === 'web';
const OSD_TIMEOUT = IS_TV ? 6000 : 4000;

export const MAX_RETRIES = 5;
export const RETRY_DELAYS = [2000, 4000, 8000, 15000, 30000];

export function usePlayer(initialChannel: Channel) {
  const { channels, setCurrentChannel, updatePlayerState } = useStore();

  const videoRef = useRef<any>(null);
  const osdTimer = useRef<NodeJS.Timeout | null>(null);
  const retryTimer = useRef<NodeJS.Timeout | null>(null);
  const retryCountdown = useRef<NodeJS.Timeout | null>(null);
  const osdAnim = useRef(new Animated.Value(1)).current;

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

  const clearAllTimers = () => {
    if (osdTimer.current) clearTimeout(osdTimer.current);
    if (retryTimer.current) clearTimeout(retryTimer.current);
    if (retryCountdown.current) clearInterval(retryCountdown.current);
  };

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
    setDuration(data.duration ?? 0);
    setIsBuffering(false);
    setError(null);
    if (retryCount > 0) setRetryCount(0);
    updatePlayerState({ isPlaying: true, isBuffering: false });
  }, [retryCount, updatePlayerState]);

  const onProgress = useCallback((data: any) => {
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
  }, []);

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

  return {
    videoRef, osdAnim, videoKey, paused,
    playingChannel, isPlaying, isBuffering,
    isMuted, volume, error,
    retryCount, retryingIn,
    position, duration, seekableDuration,
    showOSD, showSidebar,
    isLive, currentIndex,
    setVolume, setIsMuted, setShowOSD, setShowSidebar,
    showOSDTemporarily, handleScreenTap,
    togglePlay, playChannel, prevChannel, nextChannel,
    manualRetry, seekBy, seekTo,
    onLoad, onProgress, onBuffer, onError, onEnd,
  };
}