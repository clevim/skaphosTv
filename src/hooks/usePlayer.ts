import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Animated } from 'react-native';
import { useStore, resolveChannelType } from '../store/useStore';
import { Channel } from '../types';
import { IS_TV, IS_WEB } from '../utils/tvDetect';
import { lockLandscape, unlockOrientation } from '../utils/orientation';
import {
  parseJellyfinVideoUrl, markJellyfinWatched, reportJellyfinProgress,
  getJellyfinSubtitleTracks, JellyfinSubtitleTrack,
  getJellyfinAudioTracks, JellyfinAudioTrack,
} from '../utils/jellyfinLoader';
import { SubtitleTrack, AudioTrack } from '../types';
import { useWatchProgress, resumePositionFor } from '../store/watchProgress';
import { useUsageStats } from '../store/usageStats';
import { notify } from '../utils/notifications';

/** Live pelo TIPO do canal — nunca pela duração: streams HLS/TS ao vivo reportam a
 *  janela de buffer como duração, o que fazia o app tratá-los como VOD (resume
 *  indevido, progresso gravado e auto-close no fim do buffer). */
const channelIsLive = (ch: Channel | null | undefined) =>
  !!ch && resolveChannelType(ch) === 'live';
const OSD_TIMEOUT = IS_TV ? 6000 : 4000;

export const MAX_RETRIES = 5;
export const RETRY_DELAYS = [2000, 4000, 8000, 15000, 30000];

export function usePlayer(
  initialChannel: Channel,
  initialSubtitleIndex: number | null = null,
  initialSubtitleTracks: SubtitleTrack[] = [],
  initialAudioIndex: number | null = null,
  initialAudioTracks: AudioTrack[] = [],
  // Playlist explícita (episódios de uma série) → habilita auto-play do próximo ep.
  playlist: Channel[] = [],
  // Chamado quando a reprodução termina e NÃO há próximo item (filme/último ep) →
  // o PlayerScreen fecha o player.
  onRequestClose?: () => void,
) {
  // Seletores individuais — evita re-render do player a cada mudança não-relacionada
  // no store (ações têm identidade estável no Zustand).
  const channels = useStore(s => s.channels);
  const sources = useStore(s => s.sources);
  const setCurrentChannel = useStore(s => s.setCurrentChannel);

  const videoRef = useRef<any>(null);
  const osdTimer = useRef<NodeJS.Timeout | null>(null);
  const retryTimer = useRef<NodeJS.Timeout | null>(null);
  const retryCountdown = useRef<NodeJS.Timeout | null>(null);
  const heartbeatTimer = useRef<NodeJS.Timeout | null>(null);
  const seekHintTimer = useRef<NodeJS.Timeout | null>(null);
  const osdAnim = useRef(new Animated.Value(1)).current;

  // Refs para evitar closures stale em callbacks assíncronos
  const playingChannelRef = useRef<Channel>(initialChannel);
  const positionRef       = useRef(0);
  const seekDurRef        = useRef(0);   // última seekableDuration (mantida mesmo com OSD oculto)
  const showOSDRef        = useRef(true); // espelha showOSD p/ gatear setState de progresso
  // Estado de acúmulo do seek por D-pad (item indicador visual + salto acelerado)
  const lastSeekTsRef     = useRef(0);   // timestamp do último seekBy
  const lastSeekDirRef    = useRef(0);   // direção do último seekBy (1 = avança, -1 = volta)
  const seekTargetRef     = useRef(0);   // posição-alvo projetada (evita lag do onProgress entre saltos rápidos)
  const seekAccumRef      = useRef(0);   // total acumulado exibido no indicador durante saltos rápidos
  const sourcesRef        = useRef(sources);
  const durationRef       = useRef(0);   // duração atual (p/ salvar progresso fora de render)
  // Throttle do save de progresso local. Começa em Date.now() (não em 0!) —
  // senão o primeiro tick calcula elapsed = Date.now() - 0 (o epoch inteiro em
  // ms) e isso vira segundos de "tempo assistido" na hora, um valor absurdo.
  const lastProgressSaveRef = useRef(Date.now());
  useEffect(() => { sourcesRef.current = sources; }, [sources]);

  // Ações do store de progresso local (identidade estável no Zustand)
  const recordProgress = useWatchProgress(s => s.record);
  const markWatchedLocal = useWatchProgress(s => s.markWatched);
  // Métricas de uso por fonte (tempo assistido + canal mais usado) — conta ao
  // vivo também, ao contrário do progresso local acima.
  const recordPlay = useUsageStats(s => s.recordPlay);
  const addWatchSeconds = useUsageStats(s => s.addWatchSeconds);

  // Persiste a posição atual no store local (filme/episódio; nunca ao vivo).
  const saveLocalProgress = useCallback(() => {
    const ch = playingChannelRef.current;
    const dur = durationRef.current;
    if (!ch?.id || !dur || dur <= 0) return; // sem duração → ignora
    // Ao vivo NUNCA grava progresso — mesmo quando o stream reporta duração (janela HLS)
    if (channelIsLive(ch)) return;
    recordProgress(ch.id, positionRef.current, dur);
    // Espelha na série-pai: os recentes da Home guardam a SÉRIE (não o episódio),
    // então o "Continue assistindo" busca progresso pelo id da série.
    if (ch.seriesRef?.id) recordProgress(ch.seriesRef.id, positionRef.current, dur);
  }, [recordProgress]);

  const [playingChannel, setPlayingChannel] = useState<Channel>(initialChannel);
  // Conta o play inicial (trocas de canal contam em playChannel, mais abaixo)
  useEffect(() => {
    recordPlay(initialChannel.sourceId, initialChannel.id, initialChannel.name);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [videoKey, setVideoKey] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isBuffering, setIsBuffering] = useState(true);
  const [paused, setPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1.0);
  // Velocidade de reprodução. 1.0 normal; vira 2.0 enquanto o usuário segura o canto
  // da tela (volta a 1.0 ao soltar). Não usado em ao vivo.
  const [rate, setRate] = useState(1.0);

  // Sleep timer — pausa sozinho depois de N minutos. setTimeout pro disparo real;
  // sleepTimerEndAt (timestamp) é só pro anel de contagem regressiva na OSD calcular
  // a fração restante sem precisar de um segundo timer.
  const [sleepTimerMinutes, setSleepTimerMinutes] = useState<number | null>(null);
  const [sleepTimerEndAt, setSleepTimerEndAt] = useState<number | null>(null);
  const sleepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setSleepTimer = useCallback((minutes: number | null) => {
    if (sleepTimerRef.current) { clearTimeout(sleepTimerRef.current); sleepTimerRef.current = null; }
    setSleepTimerMinutes(minutes);
    setSleepTimerEndAt(minutes ? Date.now() + minutes * 60_000 : null);
    if (minutes) {
      sleepTimerRef.current = setTimeout(() => {
        setPaused(true);
        setIsPlaying(false);
        setSleepTimerMinutes(null);
        setSleepTimerEndAt(null);
        sleepTimerRef.current = null;
      }, minutes * 60_000);
    }
  }, []);
  useEffect(() => () => { if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current); }, []);

  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [retryingIn, setRetryingIn] = useState<number | null>(null);

  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seekableDuration, setSeekableDuration] = useState(0);

  const [showOSD, setShowOSD] = useState(true);
  const [showSidebar, setShowSidebar] = useState(false);
  // Indicador visual de seek (overlay central): direção + total acumulado dos saltos rápidos
  const [seekHint, setSeekHint] = useState<{ dir: 'fwd' | 'back'; amount: number } | null>(null);
  // Inicializa com as faixas pré-buscadas no JellyfinTrackSheet (evita update mid-playback)
  const [subtitleTracks, setSubtitleTracks] = useState<JellyfinSubtitleTrack[]>(initialSubtitleTracks);
  const [selectedSubtitleIndex, setSelectedSubtitleIndex] = useState<number | null>(null);
  // Índice da legenda cujo VTT está carregado no textTracks do player.
  // Mudar este valor causa setTextTracks → reloadSource → player reinicia (posição salva via pendingSeekRef).
  const [vttSubtitleIndex, setVttSubtitleIndex] = useState<number | null>(initialSubtitleIndex);
  // Sincronia da legenda (ms) — positivo adianta, negativo atrasa. Reaproveita o
  // mesmo reload de troca de legenda (o VTT deslocado é servido como um arquivo novo).
  const [subtitleOffsetMs, setSubtitleOffsetMs] = useState(0);
  const [audioTracks, setAudioTracks] = useState<JellyfinAudioTrack[]>(initialAudioTracks);
  // Inicializa de forma síncrona: usa initialAudioIndex se fornecido, senão não há faixa selecionada
  const [currentAudioIndex, setCurrentAudioIndex] = useState<number | null>(initialAudioIndex);
  const pendingSeekRef = useRef<number | null>(null);
  // Distingue primeira carga do player de reloads
  const isFirstLoadRef = useRef(true);
  // true após onLoad — evita aplicar selectedAudioTrack antes dos grupos ExoPlayer existirem
  // (quando groups.length=0, type:'index' com value.asInt() causa crash UnexpectedNativeTypeException)
  const [audioReady, setAudioReady] = useState(false);

  const isLive = channelIsLive(playingChannel) || !duration || duration === 0;
  // Navegação prev/next: se há uma playlist explícita (episódios da série), usa ela —
  // garante prev/next e auto-play na ordem correta dos episódios. Senão, restringe aos
  // canais do MESMO tipo (zapping de Ao Vivo não cai em filme/série). M3U sem streamType
  // mantém o comportamento antigo (lista toda).
  const hasPlaylist = playlist.length > 0;
  const siblings = useMemo(() => {
    if (hasPlaylist) return playlist;
    const t = playingChannel.streamType;
    return t ? channels.filter(c => c.streamType === t) : channels;
  }, [hasPlaylist, playlist, channels, playingChannel.streamType]);
  const currentIndex = siblings.findIndex(c => c.id === playingChannel.id);

  // Refs p/ uso em callbacks assíncronos (onEnd) sem closures stale
  const siblingsRef = useRef(siblings);
  const currentIndexRef = useRef(currentIndex);
  const hasPlaylistRef = useRef(hasPlaylist);
  const onRequestCloseRef = useRef(onRequestClose);
  useEffect(() => { siblingsRef.current = siblings; }, [siblings]);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);
  useEffect(() => { hasPlaylistRef.current = hasPlaylist; }, [hasPlaylist]);
  useEffect(() => { onRequestCloseRef.current = onRequestClose; }, [onRequestClose]);

  useEffect(() => {
    lockLandscape();
    showOSDTemporarily();
    return () => {
      unlockOrientation();
      // Salva a posição ao sair do player (voltar, trocar de tela) — garante resume
      saveLocalProgress();
      clearAllTimers();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sincroniza refs com estado atual
  useEffect(() => { playingChannelRef.current = playingChannel; }, [playingChannel]);

  // Ao abrir o OSD, atualiza a barra de progresso a partir dos refs (que continuam
  // acumulando mesmo com o OSD oculto). Ao fechar, volta a gatear os updates.
  useEffect(() => {
    showOSDRef.current = showOSD;
    if (showOSD) {
      setPosition(positionRef.current);
      setSeekableDuration(seekDurRef.current);
    }
  }, [showOSD]);

  const clearAllTimers = () => {
    if (osdTimer.current) clearTimeout(osdTimer.current);
    if (retryTimer.current) clearTimeout(retryTimer.current);
    if (retryCountdown.current) clearInterval(retryCountdown.current);
    if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
    if (seekHintTimer.current) clearTimeout(seekHintTimer.current);
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

  const togglePlay = useCallback(() => {
    setPaused(p => { setIsPlaying(!!p); return !p; });
    showOSDTemporarily();
  }, [showOSDTemporarily]);

  const handleScreenTap = useCallback(() => {
    // Web: clicar em qualquer lugar da tela dá play/pause (como nos players do navegador).
    // togglePlay já reexibe o OSD, então os controles continuam acessíveis.
    if (IS_WEB) { togglePlay(); return; }
    if (showOSD) {
      if (osdTimer.current) clearTimeout(osdTimer.current);
      Animated.timing(osdAnim, { toValue: 0, duration: 200, useNativeDriver: true })
        .start(() => setShowOSD(false));
    } else {
      showOSDTemporarily();
    }
  }, [showOSD, osdAnim, showOSDTemporarily, togglePlay]);

  const scheduleRetry = useCallback((attempt: number) => {
    if (attempt >= MAX_RETRIES) {
      setError(`Falha após ${MAX_RETRIES} tentativas. Verifique sua conexão.`);
      setRetryingIn(null);
      if (channelIsLive(playingChannel) && useStore.getState().settings.notifyChannelOffline) {
        notify('Canal indisponível', `${playingChannel.name} não respondeu após ${MAX_RETRIES} tentativas.`);
      }
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
  }, [playingChannel]);

  const manualRetry = useCallback(() => {
    clearAllTimers();
    setRetryCount(0);
    setRetryingIn(null);
    setIsBuffering(true);
    setError(null);
    setVideoKey(k => k + 1);
  }, []);

  const playChannel = useCallback((ch: Channel) => {
    // Salva o progresso do canal que está saindo antes de trocar
    saveLocalProgress();
    recordPlay(ch.sourceId, ch.id, ch.name);
    clearAllTimers();
    setAudioReady(false);
    durationRef.current = 0;
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
    setRate(1.0); // volta à velocidade normal ao trocar de episódio/canal
    setSubtitleTracks([]);
    setSelectedSubtitleIndex(null);
    setSubtitleOffsetMs(0); // sincronia é por vídeo — não carrega pro próximo episódio/canal
    setAudioTracks([]);
    setCurrentAudioIndex(null); // será populado em onLoad
    pendingSeekRef.current = null;
    isFirstLoadRef.current = true;
    setVideoKey(k => k + 1);
    showOSDTemporarily();
  }, [setCurrentChannel, showOSDTemporarily, saveLocalProgress, recordPlay]);

  const prevChannel = useCallback(() => {
    if (currentIndex > 0) playChannel(siblings[currentIndex - 1]);
  }, [currentIndex, siblings, playChannel]);

  const nextChannel = useCallback(() => {
    if (currentIndex < siblings.length - 1) playChannel(siblings[currentIndex + 1]);
  }, [currentIndex, siblings, playChannel]);

  const onLoad = useCallback((data: any) => {
    setAudioReady(true); // ← libera selectedAudioTrack só agora (grupos ExoPlayer existem)
    setDuration(data.duration ?? 0);
    durationRef.current = data.duration ?? 0;
    setIsBuffering(false);
    setError(null);
    if (retryCount > 0) setRetryCount(0);

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

    const ch = playingChannelRef.current;
    const firstLoad = isFirstLoadRef.current;
    isFirstLoadRef.current = false;

    // ── Continuar assistindo ───────────────────────────────────────────────────
    // Retoma a maior posição entre o progresso LOCAL (este dispositivo) e o do
    // servidor Jellyfin (resumePositionTicks). Só na carga inicial e quando não há
    // seek pendente (troca de faixa não deve perder a posição).
    if (firstLoad && !hadPendingSeek && (data.duration ?? 0) > 0 && !channelIsLive(ch)) {
      const localEntry = useWatchProgress.getState().get(ch?.id ?? '');
      const localResume = resumePositionFor(localEntry);
      const serverResume = (ch?.resumePositionTicks ?? 0) / 10_000_000;
      const resumeSecs = Math.max(localResume, serverResume > 30 ? serverResume : 0);
      if (resumeSecs > 15) {
        setTimeout(() => {
          try { videoRef.current?.seek(resumeSecs); } catch (_) {}
          positionRef.current = resumeSecs;
          setPosition(resumeSecs);
        }, 500);
      }
    }

    // Jellyfin: inicia heartbeat de progresso no servidor + faixas de legenda/áudio
    if (ch?.id?.startsWith('jf-')) {
      const parsed = parseJellyfinVideoUrl(ch.url);
      if (parsed) {
        const creds = getJellyfinCreds(parsed.host);
        if (creds?.userId && creds?.apiKey) {
          // Heartbeat a cada 10s
          startJellyfinHeartbeat(parsed.host, creds.apiKey, creds.userId, parsed.itemId);

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
  }, [retryCount, getJellyfinCreds, startJellyfinHeartbeat, initialSubtitleIndex, initialAudioTracks, initialAudioIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  const onProgress = useCallback((data: any) => {
    const t = data.currentTime ?? 0;
    positionRef.current = t;
    if (data.seekableDuration) seekDurRef.current = data.seekableDuration;
    // Salva o progresso local a cada ~10s (independente do OSD) — alimenta o
    // "continuar assistindo" e os badges. Ignorado para ao vivo (sem duração).
    const now = Date.now();
    const elapsed = now - lastProgressSaveRef.current;
    if (elapsed > 10_000) {
      lastProgressSaveRef.current = now;
      saveLocalProgress();
      // Métricas de uso contam AO VIVO também (diferente do progresso acima) —
      // usa o elapsed real (não fixo em 10s) pra não superestimar após um buffer/seek.
      addWatchSeconds(playingChannelRef.current?.sourceId, Math.round(elapsed / 1000));
    }
    // Só atualiza o estado (→ re-render) quando o OSD está visível; senão, nada
    // consome `position`. Em playback com OSD oculto isto zera os re-renders por tick.
    if (showOSDRef.current) {
      setPosition(t);
      if (data.seekableDuration) setSeekableDuration(data.seekableDuration);
    }
  }, [saveLocalProgress, addWatchSeconds]);

  const onBuffer = useCallback((data: any) => {
    setIsBuffering(data.isBuffering);
  }, []);

  const onError = useCallback((err: any) => {
    const code = err?.error?.errorCode;
    const exception = err?.error?.errorException || '';

    let msg = 'Falha ao reproduzir o canal.';

    if (exception.includes('UnknownHostException') || exception.includes('SocketException')) {
      msg = 'Sem conexão com o servidor.';
    } else if (exception.includes('406')) {
      // Painéis Xtream respondem 406 para stream inexistente — típico de rotação
      // de ids de VOD com lista em cache desatualizada.
      msg = 'O servidor recusou este conteúdo — sua lista pode estar desatualizada. Recarregue a fonte na tela de Fontes.';
    } else if (exception.includes('FileNotFoundException') || exception.includes('404')) {
      msg = 'Conteúdo não encontrado no servidor — sua lista pode estar desatualizada. Recarregue a fonte na tela de Fontes.';
    } else if (exception.includes('403') || exception.includes('Forbidden')) {
      msg = 'Acesso negado. Verifique sua assinatura.';
    } else if (exception.includes('429')) {
      msg = 'Limite de conexões do servidor atingido. Feche outros players e tente de novo.';
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
    const ch = playingChannelRef.current;

    // AO VIVO: "fim" de stream = queda do feed (fim da janela de buffer), não fim de
    // conteúdo. Reconecta silenciosamente em vez de marcar assistido e fechar o player.
    if (channelIsLive(ch)) {
      setPaused(false);
      setIsPlaying(true);
      setIsBuffering(true);
      setVideoKey(k => k + 1);
      return;
    }

    setIsPlaying(false);
    setPaused(true);
    if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);

    // Marca como assistido — local (todas as fontes) e, se Jellyfin, também no servidor
    if (ch?.id) markWatchedLocal(ch.id);
    if (ch?.id?.startsWith('jf-')) {
      const parsed = parseJellyfinVideoUrl(ch.url);
      if (parsed) {
        const creds = getJellyfinCreds(parsed.host);
        if (creds?.userId && creds?.apiKey) {
          markJellyfinWatched(parsed.host, creds.apiKey, creds.userId, parsed.itemId).catch(() => {});
        }
      }
    }

    // Auto-play do próximo: só com playlist explícita (episódios da série). Sem playlist
    // (filme) ou no último episódio → fecha o player. Evita "pular" para outro filme.
    const idx = currentIndexRef.current;
    const list = siblingsRef.current;
    if (hasPlaylistRef.current && idx >= 0 && idx < list.length - 1) {
      playChannel(list[idx + 1]);
    } else {
      onRequestCloseRef.current?.();
    }
  }, [getJellyfinCreds, markWatchedLocal, playChannel]);

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
    positionRef.current = seconds;
    setPosition(seconds);
  }, []);

  const seekBy = useCallback((seconds: number) => {
    if (isLive) return;
    const max = seekableDuration || duration;
    if (!max) return;

    // Passo FIXO a partir da posição real atual — sem aceleração (30s) e sem projeção
    // (seekTargetRef). Isso dá avanço previsível e evita o "overshoot": ao soltar o D-pad,
    // como cada salto parte da posição efetiva, não há alvo acumulado correndo na frente.
    const next = Math.max(0, Math.min(max, positionRef.current + seconds));
    seekToSeconds(next);
    showOSDTemporarily();
  }, [duration, seekableDuration, isLive, seekToSeconds, showOSDTemporarily]);

  const seekTo = useCallback((pct: number) => {
    if (isLive) return;
    const max = seekableDuration || duration;
    if (!max) return;
    const next = Math.max(0, Math.min(max, pct * max));
    seekToSeconds(next);
  }, [duration, seekableDuration, isLive, seekToSeconds]);

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

  /**
   * Ajusta a sincronia da legenda ativa (ms absolutos). O PlayerScreen resolve o
   * VTT deslocado e muda a uri do textTrack sozinho (efeito reagindo a
   * subtitleOffsetMs) — aqui só guarda a posição antes do reload que isso causa.
   * Sem legenda VTT carregada ainda, só guarda o valor pra quando uma for ativada.
   */
  const setSubtitleOffset = useCallback((ms: number) => {
    setSubtitleOffsetMs(ms);
    if (vttSubtitleIndex !== null) {
      pendingSeekRef.current = positionRef.current;
    }
  }, [vttSubtitleIndex]);

  return {
    videoRef, osdAnim, videoKey, paused,
    playingChannel, isPlaying, isBuffering,
    isMuted, volume, error,
    rate, setRate,
    sleepTimerMinutes, sleepTimerEndAt, setSleepTimer,
    retryCount, retryingIn,
    position, duration, seekableDuration,
    showOSD, showSidebar, seekHint,
    isLive, hasPlaylist, currentIndex, totalSiblings: siblings.length,
    subtitleTracks, selectedSubtitleIndex, setSelectedSubtitleIndex,
    vttSubtitleIndex,
    audioTracks, currentAudioIndex, audioReady, switchAudioTrack,
    switchSubtitleTrack, subtitleOffsetMs, setSubtitleOffset,
    setVolume, setIsMuted, setShowOSD, setShowSidebar,
    showOSDTemporarily, handleScreenTap,
    togglePlay, playChannel, prevChannel, nextChannel,
    manualRetry, seekBy, seekTo,
    onLoad, onProgress, onBuffer, onError, onEnd,
  };
}