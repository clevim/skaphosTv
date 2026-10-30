import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable, Platform, BackHandler, DeviceEventEmitter } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import Video, { ResizeMode, SelectedTrackType, TextTrackType, ViewType } from 'react-native-video';
import type { ISO639_1 } from 'react-native-video/src/types/language';
// ^^ ISO639_1 usado como cast de tipo no externalTextTracks — TS precisa do import explícito
import Ionicons from '@expo/vector-icons/Ionicons';

import { useStore, resolveChannelType } from '../store/useStore';
import { colors, fontSize } from '../utils/theme';
import { RootStackParamList } from '../types';
import { MAX_RETRIES, RETRY_DELAYS, usePlayer } from '@/hooks/usePlayer';
import PlayerOSD from '@/components/PlayerOSD';
import PlayerSidebar from '@/components/PlayerSidebar';
import PlayerError from '@/components/PlayerError';
import SubtitleSheet from '@/components/SubtitleSheet';
import AudioTrackSheet from '@/components/AudioTrackSheet';
import SleepTimerSheet from '@/components/SleepTimerSheet';
import { fixStreamUrl, streamHeaders } from '../utils/m3uParser';
import { resolveSubtitleUri } from '../utils/subtitleSync';
import { IS_TV, IS_WEB, IS_NATIVE_TV } from '../utils/tvDetect';
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
  PAGE_UP:          92,
  PAGE_DOWN:        93,
  CHANNEL_UP:       166,
  CHANNEL_DOWN:     167,
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

  const channelIndex = useStore(s => s.channelIndex);
  const subtitleSize = useStore(s => s.settings.subtitleSize);
  const bufferSizeMs = useStore(s => s.settings.bufferSize);
  // Ajustável em Ajustes → Reprodução: trocar reinicia o player (setBufferConfig
  // faz release+init na lib), então só vale a partir do próximo canal aberto.
  const rebufferMs = useStore(s => s.settings.rebufferMs ?? 5000);
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
    videoRef, osdAnim, videoKey, paused, sourceType,
    playingChannel, isPlaying, isBuffering,
    isMuted, volume, error,
    rate, setRate,
    sleepTimerMinutes, sleepTimerEndAt, setSleepTimer,
    retryCount, retryingIn,
    position, duration,
    showOSD, showSidebar,
    isLive, hasPlaylist, currentIndex, totalSiblings, siblings,
    subtitleTracks, selectedSubtitleIndex,
    vttSubtitleIndex, switchSubtitleTrack, subtitleOffsetMs, setSubtitleOffset,
    audioTracks, currentAudioIndex, audioReady, switchAudioTrack,
    setVolume, setIsMuted, setShowSidebar,
    handleScreenTap, showOSDTemporarily, setOsdHover,
    togglePlay, playChannel, prevChannel, nextChannel, recallChannel, hasRecall,
    manualRetry, seekBy, seekTo,
    onLoad, onProgress, onBuffer, onError, onEnd,
  } = player;

  const [showSubtitleSheet, setShowSubtitleSheet] = useState(false);
  const [showAudioSheet, setShowAudioSheet] = useState(false);
  const [showSleepSheet, setShowSleepSheet] = useState(false);
  // Modo scrubbing (TV): estado EXPLÍCITO, não derivado de foco. Entra com ↓, sai com ▲.
  // As teclas chegam pelo canal nativo (SkaphosKeyDown), então não dependemos do foco
  // ficar na barra — o foco pode até escapar que o seek e o visual seguem este estado.
  const [scrubMode, setScrubMode] = useState(false);
  // Proporção do vídeo (botão no OSD) e velocidade (VOD)
  const RESIZE_MODES = [
    { mode: ResizeMode.CONTAIN, label: 'Ajustar' },
    { mode: ResizeMode.COVER, label: 'Preencher' },
    { mode: ResizeMode.STRETCH, label: 'Esticar' },
  ];
  const [resizeIdx, setResizeIdx] = useState(0);
  const RATES = [1, 1.25, 1.5, 2, 0.75];
  const cycleRate = useCallback(() => {
    setRate(RATES[(RATES.indexOf(rate) + 1) % RATES.length]);
  }, [rate, setRate]); // eslint-disable-line react-hooks/exhaustive-deps
  // Toast curto (confirmação do sleep timer etc.)
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);
  const handleSleepSelect = useCallback((m: number | null) => {
    setSleepTimer(m);
    showToast(m ? `Desliga em ${m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, '0') : ''}` : `${m} min`}` : 'Timer desligado');
  }, [setSleepTimer, showToast]);
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

  // ── Zapping CH+/CH− (↑/↓, PageUp/Down, CH+/CH− do controle) ─────────────────
  // Só em lista de canais ao vivo. O HUD atualiza a cada tecla; a troca real é
  // debounced (450 ms) para zapping rápido não abrir N streams. Sem OSD: assim ↑↓
  // seguintes continuam zapeando (com OSD aberto, ↑↓ movem o foco dos botões).
  const [zapHud, setZapHud] = useState<{ name: string; num: number; total: number } | null>(null);
  const zapIdxRef = useRef<number | null>(null);
  const zapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const zapHudTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const zapListRef = useRef(siblings);
  const zapCurRef = useRef(currentIndex);
  const playChannelRef = useRef(playChannel);
  zapListRef.current = siblings; zapCurRef.current = currentIndex; playChannelRef.current = playChannel;
  const canZap = isLive && !hasPlaylist && siblings.length > 1;
  const canZapRef = useRef(canZap);
  canZapRef.current = canZap;
  useEffect(() => () => {
    if (zapTimerRef.current) clearTimeout(zapTimerRef.current);
    if (zapHudTimerRef.current) clearTimeout(zapHudTimerRef.current);
  }, []);
  const zap = useCallback((delta: 1 | -1) => {
    const list = zapListRef.current;
    if (list.length < 2) return;
    const base = zapIdxRef.current ?? Math.max(0, zapCurRef.current);
    const idx = (base + delta + list.length) % list.length; // dá a volta nas pontas
    zapIdxRef.current = idx;
    setZapHud({ name: list[idx].name, num: idx + 1, total: list.length });
    if (zapHudTimerRef.current) clearTimeout(zapHudTimerRef.current);
    zapHudTimerRef.current = setTimeout(() => setZapHud(null), 2500);
    if (zapTimerRef.current) clearTimeout(zapTimerRef.current);
    zapTimerRef.current = setTimeout(() => {
      zapIdxRef.current = null;
      playChannelRef.current(list[idx], true);
    }, 450);
  }, []);

  // Botão "próximo episódio" — só com playlist de série e havendo um próximo.
  const hasNextEpisode = hasPlaylist && currentIndex < totalSiblings - 1;

  // Mini-player (PiP dentro do app): ao entrar na tela cheia, fecha qualquer mini ativo.
  useEffect(() => {
    useMiniPlayer.getState().close();
  }, []);

  // Minimiza para o mini-player flutuante e volta à tela anterior (o mini segue tocando).
  const handleMinimize = useCallback(() => {
    useMiniPlayer.getState().open(playingChannel, position, playlist);
    if (navigation.canGoBack()) navigation.goBack();
  }, [playingChannel, position, playlist, navigation]);

  // Picture-in-Picture (Android mobile): habilita a entrada automática em PiP
  // enquanto o player está aberto; desliga ao sair. Em PiP, esconde o OSD.
  // Na TV o PiP do sistema é bloqueado (buga o launcher) — setPipEnabled é no-op lá.
  const [inPip, setInPip] = useState(false);
  useEffect(() => {
    setPipEnabled(true);
    return () => setPipEnabled(false);
  }, []);
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('SkaphosPipChanged', (v: boolean) => setInPip(!!v));
    // Botão de play/pause da janela do PiP do sistema → alterna a reprodução
    const actionSub = DeviceEventEmitter.addListener('SkaphosPipAction', (action: string) => {
      if (action === 'playpause') togglePlay();
    });
    // Usuário fechou a janela do PiP pelo "X" do sistema — para o áudio/vídeo na
    // hora, sem esperar o resto do teardown da Activity (que pode demorar/nunca
    // rodar a tempo e deixar tocando sozinho em segundo plano).
    const closeSub = DeviceEventEmitter.addListener('SkaphosPipClosed', () => {
      if (isPlaying) togglePlay();
    });
    return () => { sub.remove(); actionSub.remove(); closeSub.remove(); };
  }, [togglePlay, isPlaying]);

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
  // Sincronia (subtitleOffsetMs): resolve a URI (original ou VTT deslocado, servido
  // de um arquivo local) de forma assíncrona — buildando o textTracks só quando
  // pronto, pra nunca aplicar a legenda errada por trás.
  const [resolvedVttUri, setResolvedVttUri] = useState<string | null>(null);
  useEffect(() => {
    if (vttSubtitleIndex === null) { setResolvedVttUri(null); return; }
    const track = subtitleTracks.find(t => t.index === vttSubtitleIndex);
    if (!track?.vttUrl) { setResolvedVttUri(null); return; }
    let alive = true;
    resolveSubtitleUri(track.vttUrl, subtitleOffsetMs).then(uri => { if (alive) setResolvedVttUri(uri); });
    return () => { alive = false; };
  }, [vttSubtitleIndex, subtitleTracks, subtitleOffsetMs]);

  const activeVttTrack = useMemo(() => {
    if (vttSubtitleIndex === null || !resolvedVttUri) return [];
    const track = subtitleTracks.find(t => t.index === vttSubtitleIndex);
    if (!track) return [];
    return [{
      title:    track.displayTitle,
      language: `jf-sub-${track.index}` as ISO639_1,
      uri:      resolvedVttUri,
      type:     TextTrackType.VTT,
    }];
  }, [vttSubtitleIndex, subtitleTracks, resolvedVttUri]);

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
  // O índice já mantém `byGroup` pronto: é lookup O(1), não varredura. O useMemo
  // continua porque `playlist` e o fallback criam identidade nova, mas o custo
  // real saiu daqui — antes este filtro varria o catálogo INTEIRO (dezenas de
  // milhares de itens) e bastava o índice mudar (refresh de catálogo em
  // background) para refazer tudo com o vídeo rodando. Era a JS thread parada em
  // loop justamente durante a reprodução.
  const sidebarChannels = useMemo(() => {
    if (playlist.length > 0) return playlist;
    const group = channelIndex?.byGroup.get(playingChannel.group ?? '');
    if (group && group.length > 0) return group;
    // Sem grupo casando: cai para as mídias do mesmo TIPO em vez do catálogo
    // inteiro — a lista lateral do player nunca foi para misturar canal ao vivo
    // com filme, e "tudo" num catálogo grande é lista impossível de percorrer.
    return channelIndex?.[resolveChannelType(playingChannel)] ?? [];
  }, [playlist, channelIndex, playingChannel]);

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
      if (showSleepSheet) { setShowSleepSheet(false); return true; }
      if (showSidebar) { setShowSidebar(false); return true; }
      if (scrubMode) { setScrubMode(false); return true; }
      navigation.goBack();
      return true;
    });
    return () => handler.remove();
  }, [navigation, showSidebar, showSubtitleSheet, showAudioSheet, showSleepSheet, scrubMode]);

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
  useEffect(() => { showSheetRef.current   = showSubtitleSheet || showAudioSheet || showSleepSheet; }, [showSubtitleSheet, showAudioSheet, showSleepSheet]);
  useEffect(() => { scrubModeRef.current   = scrubMode; }, [scrubMode]);
  // Ao ocultar o OSD, sai do modo scrubbing (a barra some junto).
  useEffect(() => { if (!showOSD && scrubMode) setScrubMode(false); }, [showOSD, scrubMode]);

  // As teclas do controle chegam pelo canal nativo (SkaphosKeyDown) — ver useEffect.
  const handleKeyDown = useCallback((e: any) => {
    const code: number = e?.nativeEvent?.keyCode ?? 0;

    // Quando algum sheet (legenda/áudio) está aberto, ignora — o Modal cuida do foco
    if (showSheetRef.current) return;

    // CH+/CH− dedicados (e PageUp/Down) zapeiam mesmo com OSD aberto
    if (canZapRef.current && !showSidebarRef.current) {
      if (code === KEY.CHANNEL_UP || code === KEY.PAGE_UP)     { zap(1);  return; }
      if (code === KEY.CHANNEL_DOWN || code === KEY.PAGE_DOWN) { zap(-1); return; }
    }

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
      // OSD fechado + canal ao vivo: ↓ = CH− (zapping). Senão, volume.
      if (!showOSDRef.current && canZapRef.current && !showSidebarRef.current) { zap(-1); return; }
      showOSDTemporarily();
      if (!showOSDRef.current) setVolume((v: number) => Math.max(0, parseFloat((v - 0.1).toFixed(1))));
      return;
    }

    // ── DPAD_UP: sai do modo scrubbing ──
    if (code === KEY.DPAD_UP) {
      if (scrubModeRef.current) { setScrubMode(false); showOSDTemporarily(); return; }
      if (!showOSDRef.current && canZapRef.current && !showSidebarRef.current) { zap(1); return; }
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
  }, [seekBy, togglePlay, setVolume, setShowSidebar, showOSDTemporarily, navigation, zap]);

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

  // Web: atalhos nativos de player (padrão YouTube) em vez de emular o D-pad de TV —
  // setas fazem seek/volume direto, espaço pausa, M muta e Esc volta (a cascata do
  // hardwareBackPress, que não dispara no navegador).
  useEffect(() => {
    if (!IS_WEB) return;
    // Espaço/Enter num botão focado já "clica" o botão — não duplica a ação aqui
    const buttonFocused = () => {
      const el = document.activeElement as HTMLElement | null;
      return !!el && (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button');
    };
    const onKey = (ev: KeyboardEvent) => {
      // Slider de volume (input range) focado: setas ajustam o volume nativamente
      if (ev.key.startsWith('Arrow') &&
          (document.activeElement as HTMLElement | null)?.tagName === 'INPUT') {
        showOSDTemporarily();
        return;
      }
      switch (ev.key) {
        case 'ArrowRight': ev.preventDefault(); showOSDTemporarily(); seekBy(10); break;
        case 'ArrowLeft':  ev.preventDefault(); showOSDTemporarily(); seekBy(-10); break;
        case 'ArrowUp':
          ev.preventDefault(); showOSDTemporarily();
          setIsMuted(false);
          setVolume((v: number) => Math.min(1, parseFloat((v + 0.1).toFixed(1))));
          break;
        case 'ArrowDown':
          ev.preventDefault(); showOSDTemporarily();
          setVolume((v: number) => Math.max(0, parseFloat((v - 0.1).toFixed(1))));
          break;
        case 'PageUp':   if (canZapRef.current) { ev.preventDefault(); zap(1); }  break;
        case 'PageDown': if (canZapRef.current) { ev.preventDefault(); zap(-1); } break;
        case ' ':
          if (buttonFocused()) return;
          ev.preventDefault(); togglePlay();
          break;
        case 'm': case 'M':
          setIsMuted(m => !m); showOSDTemporarily();
          break;
        case 'Escape':
          if (showSubtitleSheet) setShowSubtitleSheet(false);
          else if (showAudioSheet) setShowAudioSheet(false);
          else if (showSleepSheet) setShowSleepSheet(false);
          else if (showSidebar) setShowSidebar(false);
          else navigation.goBack();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [seekBy, togglePlay, setVolume, setIsMuted, showOSDTemporarily, setShowSidebar,
      showSubtitleSheet, showAudioSheet, showSleepSheet, showSidebar, navigation, zap]);

  // Web: mover o mouse reexibe o OSD (como nos players de navegador). Throttle leve —
  // cada chamada re-arma timer + animação, não precisa rodar a cada pixel.
  const lastMouseMoveRef = useRef(0);
  useEffect(() => {
    if (!IS_WEB) return;
    const onMove = () => {
      const now = Date.now();
      if (now - lastMouseMoveRef.current < 250) return;
      lastMouseMoveRef.current = now;
      showOSDTemporarily();
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [showOSDTemporarily]);

  return (
    // Teclas do controle remoto (Android TV) chegam via DeviceEventEmitter
    // 'SkaphosKeyDown' (ver useEffect acima) — a prop onKeyDown da View não existe em RN.
    // Web: esconde o cursor junto com o OSD (mover o mouse traz os dois de volta)
    <View style={[styles.root, IS_WEB && !showOSD && ({ cursor: 'none' } as any)]}>
      {/* Player é a única superfície imersiva no mobile — some ao desmontar */}
      <StatusBar hidden />
      <TouchableOpacity style={styles.videoContainer} onPress={handleScreenTap} activeOpacity={1}>
        <Video
          key={videoKey}
          ref={videoRef}
          // sourceType só é definido quando a extensão da URL enganou o player
          // e a gente forçou o outro container (ver onError em usePlayer).
          source={{ uri: streamUrl, type: sourceType, headers: streamHeaders(playingChannel) }}
          style={StyleSheet.absoluteFill}
          resizeMode={RESIZE_MODES[resizeIdx].mode}
          paused={paused}
          muted={isMuted}
          volume={volume}
          rate={rate}
          repeat={false}
          bufferConfig={{
            // 5s de mínimo esvaziava em qualquer oscilação de IPTV → travadas em
            // sequência. 15s dá folga real (o ExoPlayer usa 50s por padrão).
            minBufferMs: 15000,
            // Configurável em Ajustes → Reprodução (15s conexão fraca / 30s / 60s estável)
            maxBufferMs: bufferSizeMs >= 15000 ? bufferSizeMs : 30000,
            bufferForPlaybackMs: 2500,
            bufferForPlaybackAfterRebufferMs: rebufferMs,
            // Mantém 15s JÁ REPRODUZIDOS em memória. O padrão do ExoPlayer é zero:
            // voltar 10 segundos jogava fora o buffer inteiro e rebaixava tudo de
            // novo — a travada clássica de quem perdeu uma fala e volta um pouco.
            // A própria lib zera isto sozinha se a memória livre estiver curta.
            backBufferDurationMs: 15000,
          }}
          // SurfaceView em vez de TextureView (o padrão da lib). O TextureView
          // desenha cada frame como textura NÃO-OPACA dentro da janela do app:
          // todo frame passa pela UI thread e ainda é alfa-composto. Em aparelho
          // fraco (Fire Stick) qualquer trabalho de JS/UI atrasa a entrega do
          // frame → engasgo. O SurfaceView ganha um plano de hardware próprio e
          // fica imune a isso; as overlays (OSD, buffering) continuam por cima.
          // O MiniPlayer segue com TextureView de propósito: lá o vídeo é
          // recortado por borderRadius, coisa que o SurfaceView não respeita.
          viewType={ViewType.SURFACE}
          // Padrão da lib é 250 ms — 4 travessias de bridge por segundo só pra
          // mexer no relógio do OSD. 1 s basta (a barra é em segundos).
          progressUpdateInterval={1000}
          ignoreSilentSwitch="ignore"
          // Android mobile: mantém a reprodução ao entrar em PiP do sistema.
          // TV: PiP do sistema é bloqueado (buga o launcher) — sem ele, manter
          // playInBackground deixaria o ÁUDIO tocando sozinho após o Home.
          playInBackground={Platform.OS === 'android' && !IS_NATIVE_TV}
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
        {!IS_TV && !IS_WEB && !isLive && !inPip && (
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
            <Ionicons name="play-forward" size={16} color={colors.textInverse} />
            <Text style={styles.speedIndicatorText}>2x</Text>
          </View>
        )}

        {isBuffering && !error && (
          <View style={styles.bufferingOverlay} pointerEvents="none">
            {/* Metade de baixo: o botão play/pause fica no centro exato */}
            <View style={styles.bufferingBox}>
              <Ionicons name="reload-circle" size={36} color={colors.accent2} />
              <Text style={styles.bufferingText}>Carregando...</Text>
              {retryCount > 0 && (
                <Text style={styles.retryLabel}>Tentativa {retryCount + 1} de {MAX_RETRIES}</Text>
              )}
            </View>
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

        {paused && !showOSD && !inPip && !error && (
          <View style={styles.pauseBadge} pointerEvents="none">
            <Ionicons name="pause" size={32} color={colors.white} />
          </View>
        )}

        {toast && (
          <View style={styles.toast} pointerEvents="none">
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        )}

        {zapHud && !showOSD && !inPip && (
          <View style={styles.zapHud} pointerEvents="none">
            <Text style={styles.zapNum}>{zapHud.num}</Text>
            <Text style={styles.zapName} numberOfLines={1}>{zapHud.name}</Text>
            <Text style={styles.zapTotal}>de {zapHud.total}</Text>
          </View>
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
            // Ajustar o volume desmuta — arrastar o slider mudo e não ouvir nada confunde
            onVolumeChange={(v) => { setVolume(v); setIsMuted(false); }}
            showSidebarButton={playlist.length > 0 || canZap}
            sidebarLabel={playlist.length > 0 ? 'Episódios' : 'Canais'}
            onToggleSidebar={() => setShowSidebar(s => !s)}
            onSeekTo={seekTo}
            onSeekBy={seekBy}
            hasSubtitles={subtitleTracks.length > 0}
            subtitleActive={selectedSubtitleIndex !== null}
            onToggleSubtitles={() => setShowSubtitleSheet(true)}
            hasAudio={audioTracks.length > 1}
            onToggleAudio={() => setShowAudioSheet(true)}
            sleepTimerActive={sleepTimerMinutes !== null}
            sleepTimerEndAt={sleepTimerEndAt}
            sleepTimerTotalMinutes={sleepTimerMinutes}
            onToggleSleepTimer={() => setShowSleepSheet(true)}
            showNextEpisode={hasNextEpisode}
            onNextEpisode={nextChannel}
            showMinimize={!inPip}
            onMinimize={handleMinimize}
            scrubMode={scrubMode}
            sidebarOpen={showSidebar}
            onControlsHover={IS_WEB ? setOsdHover : undefined}
            resizeLabel={RESIZE_MODES[resizeIdx].label}
            onCycleResize={() => setResizeIdx(i => (i + 1) % RESIZE_MODES.length)}
            rate={rate}
            onCycleRate={cycleRate}
            hasRecall={isLive && hasRecall}
            onRecall={recallChannel}
          />
        )}


        <SubtitleSheet
          visible={showSubtitleSheet}
          tracks={subtitleTracks}
          selectedIndex={selectedSubtitleIndex}
          onSelect={switchSubtitleTrack}
          onClose={() => setShowSubtitleSheet(false)}
          offsetMs={subtitleOffsetMs}
          onOffsetChange={setSubtitleOffset}
        />
        <AudioTrackSheet
          visible={showAudioSheet}
          tracks={audioTracks}
          selectedIndex={currentAudioIndex}
          onSelect={switchAudioTrack}
          onClose={() => setShowAudioSheet(false)}
        />
        <SleepTimerSheet
          visible={showSleepSheet}
          selectedMinutes={sleepTimerMinutes}
          onSelect={handleSleepSelect}
          onClose={() => setShowSleepSheet(false)}
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
  root: { flex: 1, backgroundColor: colors.black },
  videoContainer: { flex: 1 },
  // Zona de toque do canto direito para o gesto de segurar = 2x
  speedZone: {
    position: 'absolute',
    top: 0, bottom: 0, right: 0,
    width: '40%',
  },
  zapHud: {
    position: 'absolute', top: 40, left: 48, maxWidth: '60%',
    flexDirection: 'row', alignItems: 'center', gap: 16,
    paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14,
    backgroundColor: 'rgba(10,8,16,0.88)',
  },
  zapNum: { color: colors.accent2, fontSize: fontSize.lg, fontWeight: '800' },
  zapName: { color: colors.text1, fontSize: fontSize.lg, fontWeight: '600', flexShrink: 1 },
  zapTotal: { color: colors.text2, fontSize: fontSize.sm },
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
  speedIndicatorText: { fontSize: 14, fontWeight: '800', color: colors.textInverse, letterSpacing: 0.5 },
  bufferingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  bufferingBox: { position: 'absolute', top: '50%', marginTop: 56, alignItems: 'center', gap: 6 },
  pauseBadge: {
    position: 'absolute', alignSelf: 'center', top: '50%', marginTop: -36,
    width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(10,8,16,0.6)',
    alignItems: 'center', justifyContent: 'center',
  },
  toast: {
    position: 'absolute', alignSelf: 'center', top: 90, paddingHorizontal: 18, paddingVertical: 9,
    borderRadius: 999, backgroundColor: 'rgba(10,8,16,0.9)',
  },
  toastText: { color: colors.text1, fontSize: fontSize.sm, fontWeight: '600' },
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