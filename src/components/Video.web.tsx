// Stub do react-native-video para web.
// forwardRef expõe .seek() ao usePlayer via videoRef.
import React, { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { View, StyleSheet } from 'react-native';

export const ResizeMode = {
  CONTAIN: 'contain',
  COVER: 'cover',
  STRETCH: 'fill',
  NONE: 'none',
};

const Video = forwardRef(function Video(props: any, ref: any) {
  const { source, style, paused, muted, volume, repeat, resizeMode,
          onLoad, onProgress, onBuffer, onError, onEnd } = props;

  const videoEl = useRef<HTMLVideoElement>(null);

  useImperativeHandle(ref, () => ({
    seek: (seconds: number) => {
      if (videoEl.current) videoEl.current.currentTime = seconds;
    },
  }));

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
        src={source?.uri}
        autoPlay={!paused}
        muted={!!muted}
        loop={!!repeat}
        style={{ width: '100%', height: '100%', objectFit, backgroundColor: '#000', display: 'block' }}
        onLoadedMetadata={(e) => {
          const v = e.target as HTMLVideoElement;
          onLoad?.({ duration: v.duration });
          onBuffer?.({ isBuffering: false });
        }}
        onTimeUpdate={(e) => {
          const v = e.target as HTMLVideoElement;
          onProgress?.({ currentTime: v.currentTime, seekableDuration: v.duration || 0 });
        }}
        onWaiting={() => onBuffer?.({ isBuffering: true })}
        onCanPlay={() => onBuffer?.({ isBuffering: false })}
        onPlaying={() => onBuffer?.({ isBuffering: false })}
        onError={() => onError?.({ error: { errorString: 'Erro ao reproduzir' } })}
        onEnded={() => onEnd?.()}
      />
    </View>
  );
});

export default Video;

const styles = StyleSheet.create({
  container: { backgroundColor: '#000', overflow: 'hidden' },
});