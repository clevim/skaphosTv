// MiniPlayer.tsx — Player flutuante (PiP dentro do app).
// Montado no root (App.tsx), acima do navegador, para continuar tocando enquanto
// o usuário navega. Recebe o canal/posição do PlayerScreen via store useMiniPlayer.
import React, { useRef, useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, Pressable, Text } from 'react-native';
import Video, { ResizeMode } from 'react-native-video';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMiniPlayer } from '../store/miniPlayer';
import { useWatchProgress } from '../store/watchProgress';
import { resolveChannelType } from '../store/useStore';
import { fixStreamUrl, streamHeaders } from '../utils/m3uParser';
import { setPlaybackActive } from '../utils/playbackGate';
import { Channel } from '../types';
import { colors, shadow } from '../utils/theme';
import { IS_TV, IS_WEB } from '../utils/tvDetect';

const WIN_W = IS_TV ? 340 : IS_WEB ? 300 : 176;
const WIN_H = Math.round(WIN_W * 9 / 16);

interface Props {
  /** Expandir = voltar à tela cheia (Player). Fornecido pelo App (usa navigationRef). */
  onExpand: (channel: Channel, playlist: Channel[]) => void;
}

export default function MiniPlayer({ onExpand }: Props) {
  const { channel, startPosition, playlist, visible, close } = useMiniPlayer();
  const record = useWatchProgress(s => s.record);

  const videoRef = useRef<any>(null);
  const durationRef = useRef(0);
  const positionRef = useRef(0);
  const lastSaveRef = useRef(0);
  const [paused, setPaused] = useState(false);

  const onLoad = useCallback((data: any) => {
    durationRef.current = data?.duration ?? 0;
    if (startPosition > 1) {
      // pequeno atraso garante que o player já aceite o seek
      setTimeout(() => { try { videoRef.current?.seek(startPosition); } catch (_) {} }, 400);
    }
  }, [startPosition]);

  const onProgress = useCallback((data: any) => {
    const t = data?.currentTime ?? 0;
    positionRef.current = t;
    const dur = durationRef.current;
    const now = Date.now();
    // Rede de segurança a cada 60s (só para o caso de o app morrer): expandir,
    // fechar e terminar já gravam por saveNow(). Não pode ser frequente — cada
    // record() troca a identidade de `entries` e re-renderiza a Home INTEIRA,
    // que é justamente a tela por onde o usuário está navegando com o mini
    // tocando. Na Fire Stick isso aparecia como engasgo no vídeo.
    // Ao vivo nunca grava (streams HLS reportam a janela de buffer como duração).
    if (dur > 0 && now - lastSaveRef.current > 60_000) {
      lastSaveRef.current = now;
      if (channel?.id && resolveChannelType(channel) !== 'live') {
        record(channel.id, t, dur);
        // Espelha na série-pai — a Home mostra progresso pelo id da SÉRIE
        if (channel.seriesRef?.id) record(channel.seriesRef.id, t, dur);
      }
    }
  }, [channel, record]);

  const saveNow = useCallback(() => {
    if (channel?.id && durationRef.current > 0 && resolveChannelType(channel) !== 'live') {
      record(channel.id, positionRef.current, durationRef.current);
      if (channel.seriesRef?.id) record(channel.seriesRef.id, positionRef.current, durationRef.current);
    }
  }, [channel, record]);

  const handleExpand = useCallback(() => {
    if (!channel) return;
    saveNow();                    // garante retomada precisa na tela cheia
    onExpand(channel, playlist);  // PlayerScreen fecha o mini ao montar
  }, [channel, playlist, onExpand, saveNow]);

  const handleClose = useCallback(() => {
    saveNow();
    close();
  }, [saveNow, close]);

  const onEnd = useCallback(() => { close(); }, [close]);

  // Mini-player tocando também é reprodução: segura recarga de catálogo (ver playbackGate)
  useEffect(() => {
    if (!visible || !channel) return;
    setPlaybackActive(true);
    return () => setPlaybackActive(false);
  }, [visible, channel]);

  if (!visible || !channel) return null;

  const url = fixStreamUrl(channel.url);

  return (
    <View style={[styles.wrap, IS_TV && styles.wrapTV]} pointerEvents="box-none">
      <View style={[styles.window, IS_TV && styles.windowTV]}>
        {/* Toque/OK no vídeo expande para tela cheia */}
        <Pressable
          style={styles.videoTouch}
          onPress={handleExpand}
          hasTVPreferredFocus={IS_TV}
        >
          <Video
            ref={videoRef}
            source={{ uri: url, headers: streamHeaders(channel) }}
            style={StyleSheet.absoluteFill}
            resizeMode={ResizeMode.CONTAIN}
            paused={paused}
            // Sem isto o ExoPlayer usa o default dele (50s). Aqui o vídeo é um
            // quadradinho tocando ENQUANTO o usuário navega o catálogo — a
            // memória vale mais para as listas e as capas do que para meio
            // minuto de vídeo adiantado.
            bufferConfig={{
              minBufferMs: 15000,
              maxBufferMs: 20000,
              bufferForPlaybackMs: 2500,
              bufferForPlaybackAfterRebufferMs: 5000,
            }}
            // Default da lib é 250ms: 4 travessias de bridge por segundo durante
            // a navegação. Aqui nem existe barra de progresso para alimentar.
            progressUpdateInterval={1000}
            onLoad={onLoad}
            onProgress={onProgress}
            onEnd={onEnd}
          />
        </Pressable>

        {/* Controles: na TV ficam sempre visíveis; no touch só aparecem sobrepostos */}
        <View style={[styles.controls, IS_TV && styles.controlsTV]} pointerEvents="box-none">
          <View style={styles.topRow}>
            <Pressable onPress={handleExpand} style={[styles.iconBtn, IS_TV && styles.iconBtnTV]} hitSlop={6}>
              <Ionicons name="expand" size={IS_TV ? 20 : 14} color={colors.white} />
            </Pressable>
            <View style={{ flex: 1 }} />
            {!IS_TV && (
              <Pressable onPress={handleClose} style={styles.iconBtn} hitSlop={6}>
                <Ionicons name="close" size={16} color={colors.white} />
              </Pressable>
            )}
          </View>
          <View style={styles.bottomRow}>
            <Pressable onPress={() => setPaused(p => !p)} style={[styles.iconBtn, IS_TV && styles.iconBtnTV]} hitSlop={6}>
              <Ionicons name={paused ? 'play' : 'pause'} size={IS_TV ? 20 : 16} color={colors.white} />
            </Pressable>
            <Text style={[styles.title, IS_TV && styles.titleTV]} numberOfLines={1}>{channel.name}</Text>
            {IS_TV && (
              <Pressable onPress={handleClose} style={[styles.iconBtn, styles.iconBtnTV]} hitSlop={6}>
                <Ionicons name="close" size={20} color={colors.white} />
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
  },
  wrapTV: {
    // TV: canto superior direito (longe da navegação central)
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
  },
  window: {
    width: WIN_W,
    height: WIN_H,
    marginBottom: 76,  // acima da barra de abas (mobile/web)
    marginRight: 12,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.black,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.floating,
  },
  windowTV: {
    marginTop: 52,
    marginBottom: 0,
    marginRight: 40,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.accent,
  },
  videoTouch: { ...StyleSheet.absoluteFillObject },
  controls: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    padding: 6,
  },
  // TV: fundo escuro sempre visível para garantir legibilidade sem hover
  controlsTV: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    padding: 10,
  },
  topRow: { flexDirection: 'row', alignItems: 'center' },
  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  iconBtn: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  iconBtnTV: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  title: { flex: 1, color: colors.white, fontSize: 10, fontWeight: '600' },
  titleTV: { fontSize: 14, fontWeight: '700' },
});
