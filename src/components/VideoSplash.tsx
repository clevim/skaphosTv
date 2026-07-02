/**
 * VideoSplash — vídeo de abertura por cima do app durante o boot.
 * Toca uma vez; quando o vídeo termina E o app está pronto (`ready`), some suave.
 * Se o vídeo falhar, não trava o boot (trata como terminado).
 *
 * Web: o react-native-video é stubado; prefira o AnimatedSplash como fallback
 * (use `IS_WEB ? <AnimatedSplash/> : <VideoSplash/>` no App).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';
import Video, { ResizeMode } from 'react-native-video';
import { colors } from '../utils/theme';

interface Props {
  source: any;            // require('../../assets/intro.mp4')
  ready: boolean;         // app pronto (fontes carregadas)
  muted?: boolean;
  onFinish: () => void;
}

export default function VideoSplash({ source, ready, muted = false, onFinish }: Props) {
  const rootOpacity = useRef(new Animated.Value(1)).current;
  const [ended, setEnded] = useState(false);
  const finishedRef = useRef(false);

  useEffect(() => {
    if (finishedRef.current) return;
    if (ended && ready) {
      finishedRef.current = true;
      Animated.timing(rootOpacity, { toValue: 0, duration: 420, useNativeDriver: true }).start(() => onFinish());
    }
  }, [ended, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // Segurança: se o vídeo travar/não terminar, libera após um tempo máximo
  useEffect(() => {
    const t = setTimeout(() => setEnded(true), 8000);
    return () => clearTimeout(t);
  }, []);

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, { opacity: rootOpacity }]} pointerEvents="none">
      <Video
        source={source}
        style={StyleSheet.absoluteFill}
        resizeMode={ResizeMode.COVER}
        muted={muted}
        repeat={false}
        paused={false}
        onEnd={() => setEnded(true)}
        onError={() => setEnded(true)}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.splashBg, zIndex: 1000, elevation: 1000 },
});
