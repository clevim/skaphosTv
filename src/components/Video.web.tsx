// Stub do react-native-video para web (resolvido via metro.config.js).
// forwardRef expõe .seek() ao usePlayer via videoRef.
//
// Playback no navegador:
//  • MP4/MKV/Direct Play → <video> nativo.
//  • HLS (.m3u8)         → hls.js.
//  • MPEG-TS (.ts/live)  → mpegts.js.
// Streams cruzam o proxy same-origin (/proxy?url=...) para contornar CORS.
import React, { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { View, StyleSheet } from 'react-native';
import Hls from 'hls.js';
import mpegts from 'mpegts.js';

export const ResizeMode = {
  CONTAIN: 'contain',
  COVER: 'cover',
  STRETCH: 'fill',
  NONE: 'none',
};

// Enums usados pelo PlayerScreen (no nativo vêm do react-native-video).
// No web são apenas stubs: a seleção de faixa de áudio/legenda não se aplica ao <video>.
export const SelectedTrackType = {
  SYSTEM: 'system',
  DISABLED: 'disabled',
  TITLE: 'title',
  LANGUAGE: 'language',
  INDEX: 'index',
};

export const TextTracksType = {
  SUBRIP: 'application/x-subrip',
  TTML: 'application/ttml+xml',
  VTT: 'text/vtt',
};

// Base do proxy CORS. Default: same-origin /proxy (nginx → serviço proxy).
// Defina EXPO_PUBLIC_PROXY_URL='' para desabilitar (ex.: dev sem proxy).
const PROXY_BASE = process.env.EXPO_PUBLIC_PROXY_URL ?? '/proxy';
const viaProxy = (u?: string) =>
  PROXY_BASE && u ? `${PROXY_BASE}?url=${encodeURIComponent(u)}` : (u ?? '');

type Kind = 'hls' | 'mpegts' | 'native';
function kindOf(uri: string): Kind {
  if (!uri) return 'native';
  const path = uri.split('?')[0].toLowerCase();
  if (path.endsWith('.m3u8')) return 'hls';
  if (path.endsWith('.ts')) return 'mpegts';
  // Extensionless costuma ser canal live (mpegts), como em detectStreamType()
  if (!/\.[a-z0-9]{2,4}$/.test(path)) return 'mpegts';
  return 'native';
}

const Video = forwardRef(function Video(props: any, ref: any) {
  const { source, style, paused, muted, volume, repeat, resizeMode,
          onLoad, onProgress, onBuffer, onError, onEnd } = props;

  const videoEl = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const mpegtsRef = useRef<any>(null);
  const uri: string = source?.uri ?? '';

  useImperativeHandle(ref, () => ({
    seek: (seconds: number) => {
      if (videoEl.current) videoEl.current.currentTime = seconds;
    },
  }));

  // Anexa o engine de playback conforme o tipo do stream.
  useEffect(() => {
    const video = videoEl.current;
    if (!video || !uri) return;

    const cleanup = () => {
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
      if (mpegtsRef.current) {
        try { mpegtsRef.current.destroy(); } catch (_) {}
        mpegtsRef.current = null;
      }
    };

    const kind = kindOf(uri);

    if (kind === 'hls') {
      if (Hls.isSupported()) {
        // loadSource recebe a URL ORIGINAL (resolução correta dos segmentos);
        // xhrSetup reescreve cada request (manifesto + segmentos) para o proxy.
        const hls = new Hls({
          enableWorker: true,
          xhrSetup: (xhr, url) => { xhr.open('GET', viaProxy(url)); },
        });
        hlsRef.current = hls;
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (data?.fatal) onError?.({ error: { errorString: `HLS: ${data.type}` } });
        });
        hls.loadSource(uri);
        hls.attachMedia(video);
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari: HLS nativo
        video.src = viaProxy(uri);
      } else {
        onError?.({ error: { errorString: 'HLS não suportado neste navegador' } });
      }
    } else if (kind === 'mpegts') {
      if (mpegts.isSupported()) {
        const player = mpegts.createPlayer(
          { type: 'mpegts', isLive: true, url: viaProxy(uri) },
          { enableStashBuffer: false, liveBufferLatencyChasing: true },
        );
        mpegtsRef.current = player;
        player.on(mpegts.Events.ERROR, (type: string) =>
          onError?.({ error: { errorString: `MPEGTS: ${type}` } }));
        player.attachMediaElement(video);
        player.load();
      } else {
        onError?.({ error: { errorString: 'MPEG-TS não suportado neste navegador' } });
      }
    } else {
      video.src = viaProxy(uri);
    }

    return cleanup;
  }, [uri]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const v = videoEl.current;
    if (!v) return;
    if (paused) v.pause();
    else v.play().catch(() => {});
  }, [paused]);

  useEffect(() => {
    if (videoEl.current) videoEl.current.muted = !!muted;
  }, [muted]);

  useEffect(() => {
    if (videoEl.current && volume != null) {
      videoEl.current.volume = Math.max(0, Math.min(1, volume));
    }
  }, [volume]);

  const objectFit = resizeMode === 'cover' ? 'cover' : resizeMode === 'fill' ? 'fill' : 'contain';

  return (
    <View style={[styles.container, style]}>
      <video
        ref={videoEl}
        autoPlay={!paused}
        muted={!!muted}
        loop={!!repeat}
        playsInline
        style={{ width: '100%', height: '100%', objectFit, backgroundColor: '#000', display: 'block' }}
        onLoadedMetadata={(e) => {
          const v = e.target as HTMLVideoElement;
          onLoad?.({ duration: isFinite(v.duration) ? v.duration : 0 });
          onBuffer?.({ isBuffering: false });
        }}
        onTimeUpdate={(e) => {
          const v = e.target as HTMLVideoElement;
          onProgress?.({ currentTime: v.currentTime, seekableDuration: isFinite(v.duration) ? v.duration : 0 });
        }}
        onWaiting={() => onBuffer?.({ isBuffering: true })}
        onCanPlay={() => onBuffer?.({ isBuffering: false })}
        onPlaying={() => onBuffer?.({ isBuffering: false })}
        onError={() => {
          // hls.js/mpegts.js já reportam seus próprios erros; só reporta erro
          // direto do elemento quando estamos em modo nativo.
          if (!hlsRef.current && !mpegtsRef.current) {
            onError?.({ error: { errorString: 'Erro ao reproduzir' } });
          }
        }}
        onEnded={() => onEnd?.()}
      />
    </View>
  );
});

export default Video;

const styles = StyleSheet.create({
  container: { backgroundColor: '#000', overflow: 'hidden' },
});
