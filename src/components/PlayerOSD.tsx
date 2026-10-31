// PlayerOSD.tsx — matches MobilePlayer / TVLive design exactly
import React, { useRef, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Animated,
  Platform, PanResponder, Pressable,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Svg, { Circle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { Channel } from '../types';
import TVFocusable, { TVFocusableHandle } from './TVFocusable';
import { colors, fontSize, fontFamily, radius, spacing } from '@/utils/theme';
import { IS_TV, IS_NATIVE_TV, IS_WEB } from '../utils/tvDetect';
import { useStore } from '../store/useStore';
import { useNowNext } from '../store/epgStore';
import { SkChip, SkMeter } from './sk';
import { useAccentColors } from '../hooks/useAccentColors';

/** Anel que regride ao redor do botão de sleep timer, acompanhando o tempo restante. */
function SleepRing({ endAt, totalMinutes }: { endAt: number; totalMinutes: number }) {
  const acc = useAccentColors();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const totalMs = totalMinutes * 60_000;
  const remaining = Math.max(0, endAt - now);
  const pct = totalMs > 0 ? remaining / totalMs : 0;
  const size = 38, stroke = 2.5, r = (size - stroke) / 2, circ = 2 * Math.PI * r;
  return (
    <Svg width={size} height={size} style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <Circle
        cx={size / 2} cy={size / 2} r={r}
        stroke={acc.accent} strokeWidth={stroke} fill="none"
        strokeDasharray={`${circ} ${circ}`}
        strokeDashoffset={circ * (1 - pct)}
        strokeLinecap="round"
        rotation={-90}
        origin={`${size / 2}, ${size / 2}`}
      />
    </Svg>
  );
}

/** "Agora / A seguir" do EPG — só para canal ao vivo com o guia habilitado. */
function NowNextLine({ channel, isLive }: { channel: Channel; isLive: boolean }) {
  const showEpg = useStore(s => s.settings.showEpg);
  const enabled = isLive && showEpg && !channel.id.startsWith('jf-');
  // passive: no player o guia é só LEITURA — baixar/parsear XMLTV aqui rouba
  // CPU do decodificador de vídeo (ver useNowNext).
  const { now, next } = useNowNext(enabled ? channel.id : undefined, true);
  if (!isLive && !now && !next) return null;
  const fmt = (ms: number) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const q = channel.quality && channel.quality !== 'HD' ? channel.quality : null;
  // ponytail: lê Date.now() só ao renderizar (sem timer); atualiza quando o OSD reabre
  const frac = now ? (Date.now() - now.start) / Math.max(1, now.end - now.start) : 0;
  return (
    <>
    {(isLive || now) && (
      <View style={nnStyles.row}>
        {isLive && <SkChip label="AO VIVO" variant="live" />}
        {q && <SkChip label={q} />}
        {now && (
          <Text style={nnStyles.now} numberOfLines={1}>
            {now.title}<Text style={nnStyles.time}>{`   ${fmt(now.start)}–${fmt(now.end)}`}</Text>
          </Text>
        )}
      </View>
    )}
    {now && <SkMeter label="agora" value={frac} valueText="" style={nnStyles.meter} />}
    {next && <Text style={nnStyles.next} numberOfLines={1}>{`A seguir: ${next.title}`}</Text>}
    </>
  );
}

const nnStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  meter: { marginTop: 10, maxWidth: 420 },
  now: { flexShrink: 1, fontSize: IS_TV ? 15 : 13, fontFamily: fontFamily.semiBold, color: colors.text1 },
  time: { fontFamily: fontFamily.regular, color: colors.text2, fontVariant: ['tabular-nums'] },
  next: { marginTop: 6, fontSize: IS_TV ? 14 : 12, fontFamily: fontFamily.regular, color: colors.text2 },
});

interface Props {
  osdAnim: Animated.Value;
  channel: Channel;
  isPlaying: boolean;
  isMuted: boolean;
  volume: number;
  isLive: boolean;
  position: number;
  duration: number;
  currentIndex: number;
  totalChannels: number;
  retryCount: number;
  onBack: () => void;
  onTogglePlay: () => void;
  onPrevChannel: () => void;
  onNextChannel: () => void;
  onToggleMute: () => void;
  onVolumeChange: (v: number) => void;
  /** Sidebar só existe pra lista de episódios de série (o PiP interno já cobre
   *  "outras mídias da mesma categoria" — sem motivo pra duplicar o botão). */
  showSidebarButton?: boolean;
  onToggleSidebar: () => void;
  onSeekTo: (pct: number) => void;
  onSeekBy: (seconds: number) => void;
  hasSubtitles?: boolean;
  subtitleActive?: boolean;
  onToggleSubtitles?: () => void;
  hasAudio?: boolean;
  onToggleAudio?: () => void;
  sleepTimerActive?: boolean;
  onToggleSleepTimer?: () => void;
  /** Timestamp de disparo e duração total selecionada — alimentam o anel de contagem regressiva. */
  sleepTimerEndAt?: number | null;
  sleepTimerTotalMinutes?: number | null;
  /** Séries: mostra o botão de "próximo episódio" (canto sup. direito) quando há próximo. */
  showNextEpisode?: boolean;
  onNextEpisode?: () => void;
  /** Mini-player: botão de minimizar (PiP dentro do app). */
  showMinimize?: boolean;
  onMinimize?: () => void;
  /** TV: modo scrubbing ativo (controlado pelo PlayerScreen). Esconde os controles,
   *  realça a barra e mostra a dica. O seek é feito pelo D-pad no PlayerScreen. */
  scrubMode?: boolean;
  /** Lista lateral aberta: ao fechar, o foco volta pro play (ver efeito abaixo). */
  sidebarOpen?: boolean;
  /** Web: avisa quando o mouse entra/sai dos controles — o OSD não se esconde
   *  enquanto o ponteiro estiver sobre algum botão/barra. */
  onControlsHover?: (hovering: boolean) => void;
  /** Proporção de vídeo atual (rótulo) e ciclo. */
  resizeLabel?: string;
  onCycleResize?: () => void;
  /** Velocidade de reprodução (VOD). */
  rate?: number;
  onCycleRate?: () => void;
  /** Ao vivo: voltar ao canal anterior. */
  hasRecall?: boolean;
  onRecall?: () => void;
  /** Rótulo do botão de lista lateral ("Canais"/"Episódios"). */
  sidebarLabel?: string;
}

// CSS do slider de volume (web) — à la YouTube: <input type="range"> nativo com
// preenchimento via --pct e expansão por transição. Pseudo-elementos de range não
// são estilizáveis inline, então injeta uma vez no <head>.
if (IS_WEB && typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
.skv-vol-wrap{width:0;min-width:0;opacity:0;overflow:hidden;display:flex;align-items:center;height:38px;transition:width .18s ease,opacity .18s ease}
.skv-vol-open{width:84px;opacity:1}
.skv-vol{-webkit-appearance:none;appearance:none;flex:none;width:78px;height:14px;margin:0 6px 0 0;background:transparent;cursor:pointer;outline:none}
.skv-vol::-webkit-slider-runnable-track{height:3px;border-radius:2px;background:linear-gradient(to right,#fff var(--pct,100%),rgba(255,255,255,.28) var(--pct,100%))}
.skv-vol::-webkit-slider-thumb{-webkit-appearance:none;width:12px;height:12px;border-radius:50%;background:#fff;margin-top:-4.5px}
.skv-vol::-moz-range-track{height:3px;border-radius:2px;background:rgba(255,255,255,.28)}
.skv-vol::-moz-range-progress{height:3px;border-radius:2px;background:#fff}
.skv-vol::-moz-range-thumb{width:12px;height:12px;border-radius:50%;background:#fff;border:none}`;
  document.head.appendChild(style);
}

/** "Série S01E01" + epTitle -> "Série · T1 · E01 · Título". */
function displayTitle(ch: Channel): string {
  if (!ch.epTitle) return ch.name;
  const m = ch.name.match(/^(.*?)\s*S(\d+)\s*E(\d+)\s*$/i);
  if (!m) return `${ch.name} · ${ch.epTitle}`;
  return `${m[1]} · T${Number(m[2])} · E${m[3].padStart(2, '0')} · ${ch.epTitle}`;
}

function formatTime(seconds: number): string {
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export default function PlayerOSD({
  osdAnim, channel, isPlaying,
  isLive, position, duration,
  currentIndex, totalChannels,
  isMuted, volume,
  onBack, onTogglePlay, onPrevChannel, onNextChannel,
  onToggleMute, onVolumeChange,
  showSidebarButton, onToggleSidebar, onSeekTo, onSeekBy,
  hasSubtitles, subtitleActive, onToggleSubtitles,
  hasAudio, onToggleAudio,
  sleepTimerActive, onToggleSleepTimer, sleepTimerEndAt, sleepTimerTotalMinutes,
  showNextEpisode, onNextEpisode,
  showMinimize, onMinimize,
  scrubMode = false,
  sidebarOpen = false,
  onControlsHover,
  resizeLabel, onCycleResize, rate = 1, onCycleRate,
  hasRecall, onRecall, sidebarLabel = 'Lista de canais',
}: Props) {
  const acc = useAccentColors();
  const progressPct = duration > 0 ? Math.min(1, position / duration) : 0;
  const seekBarWidth = useRef(0);

  // Quando um focável some, o Android joga o foco no PRIMEIRO focável do player
  // — o "voltar" do canto superior. Aí o OK, que o usuário espera que pause,
  // fecha o player. Acontece em dois pontos: ao entrar no scrubbing (os botões de
  // seek viram disabled) e ao fechar a lista lateral (o item focado desmonta).
  // Nos dois, o foco volta pro play, que é o centro de comando do OSD.
  const playRef = useRef<TVFocusableHandle>(null);
  useEffect(() => {
    if (IS_NATIVE_TV && scrubMode) playRef.current?.focus();
  }, [scrubMode]);
  const sidebarWasOpen = useRef(sidebarOpen);
  useEffect(() => {
    if (IS_NATIVE_TV && sidebarWasOpen.current && !sidebarOpen) playRef.current?.focus();
    sidebarWasOpen.current = sidebarOpen;
  }, [sidebarOpen]);

  // PanResponder é criado uma única vez (useRef): lê o callback via ref para não
  // congelar a primeira versão de onSeekTo — na primeira montagem duration ainda
  // é 0 e o seekTo capturado não faria nada.
  const onSeekToRef = useRef(onSeekTo);
  onSeekToRef.current = onSeekTo;

  // Web: mouse sobre os controles → segura o OSD visível
  const hoverProps = IS_WEB && onControlsHover ? ({
    onMouseEnter: () => onControlsHover(true),
    onMouseLeave: () => onControlsHover(false),
  } as any) : undefined;

  // ── Volume (só web: nativo usa o volume físico do aparelho) ────────────────
  // O slider é um <input type="range"> nativo SEMPRE montado (expande via CSS no
  // hover) — sem montar/desmontar, sem PanResponder: arraste, clique e teclado
  // vêm do navegador. volDragging mantém aberto se o ponteiro sair do grupo
  // com o botão pressionado (o range segue o drag por pointer capture).
  const [volHover, setVolHover] = useState(false);
  const [volDragging, setVolDragging] = useState(false);
  const volOpen = volHover || volDragging;
  const volPct = isMuted ? 0 : Math.round(volume * 100);
  const volIcon = isMuted || volume <= 0 ? 'volume-mute'
    : volume < 0.5 ? 'volume-low' : 'volume-high';

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !isLive && duration > 0,
      onMoveShouldSetPanResponder: () => !isLive && duration > 0,
      onPanResponderGrant: (e) => {
        const pct = Math.max(0, Math.min(1, e.nativeEvent.locationX / seekBarWidth.current));
        onSeekToRef.current(pct);
      },
      onPanResponderMove: (e) => {
        const pct = Math.max(0, Math.min(1, e.nativeEvent.locationX / seekBarWidth.current));
        onSeekToRef.current(pct);
      },
    })
  ).current;

  return (
    <Animated.View style={[styles.osd, { opacity: osdAnim }]}>
      {/* Scrims (WCAG AA): gradiente abissal atrás do topo e da base para o texto
          não depender do frame do vídeo. Não captam toque. */}
      <LinearGradient pointerEvents="none" colors={['rgba(10,8,16,0.85)', 'rgba(10,8,16,0)']} style={styles.scrimTop} />
      <LinearGradient pointerEvents="none" colors={['rgba(10,8,16,0)', 'rgba(10,8,16,0.9)']} style={styles.scrimBottom} />

      {/* Top bar — back + title + actions. Some no modo scrubbing (foco na barra),
          mas continua montado/focável para o foco poder voltar ao sair da barra. */}
      <View style={[styles.osdTop, scrubMode && styles.scrubHidden]} {...hoverProps}>
        {/* TV física: sem "voltar" na tela — o controle tem a tecla, e um botão a
            mais no topo era onde o foco caía quando um focável sumia (OK fechava o player). */}
        {IS_NATIVE_TV ? <View /> : (
          <TVFocusable accessibilityLabel={IS_TV ? 'Voltar' : 'Fechar player'} onPress={onBack} style={styles.backBtn} borderRadius={19} hitSlop={5}>
            <Ionicons name={IS_TV ? 'chevron-back' : 'chevron-down'} size={20} color={colors.white} />
          </TVFocusable>
        )}

        <View style={styles.topActions}>
          {IS_WEB && (
            <Pressable
              style={styles.volumeGroup}
              // onMouseEnter/Leave DOM direto (como os hoverProps do OSD): o
              // onHoverIn do Pressable não disparava sobre o ícone. mouseenter
              // no grupo cobre qualquer filho (ícone incluso) e mouseleave só
              // dispara ao sair do grupo inteiro.
              {...({
                onMouseEnter: () => setVolHover(true),
                onMouseLeave: () => setVolHover(false),
              } as any)}
              // onPress no-op DE PROPÓSITO: reivindica o responder do RN-web
              // (o mais profundo vence). Sem isso, cliques no <input> nativo —
              // que não participa do sistema de responder — eram reivindicados
              // pelo TouchableOpacity de tela inteira e viravam play/pause.
              onPress={() => {}}
            >
              {/* Slider à ESQUERDA do ícone: expande para dentro da tela sem
                  deslocar os outros botões do canto direito. stopPropagation:
                  clique no slider não pode virar tap de play/pause na tela. */}
              <div
                className={`skv-vol-wrap${volOpen ? ' skv-vol-open' : ''}`}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <input
                  type="range"
                  className="skv-vol"
                  aria-label="Volume"
                  title="Volume"
                  min={0}
                  max={100}
                  step={1}
                  value={volPct}
                  style={{ ['--pct' as any]: `${volPct}%` }}
                  onChange={(e) => onVolumeChange(Number(e.target.value) / 100)}
                  onPointerDown={() => setVolDragging(true)}
                  onPointerUp={() => setVolDragging(false)}
                />
              </div>
              <TVFocusable accessibilityLabel={isMuted || volume <= 0 ? 'Ativar som' : 'Silenciar'} onPress={onToggleMute} style={styles.iconBtn} borderRadius={19} hitSlop={5}>
                <Ionicons name={volIcon} size={18} color={colors.white} />
              </TVFocusable>
            </Pressable>
          )}
          {hasRecall && onRecall && (
            <TVFocusable accessibilityLabel="Canal anterior" onPress={onRecall} style={styles.iconBtn} borderRadius={19} hitSlop={5}>
              <Ionicons name="return-down-back" size={18} color={colors.white} />
            </TVFocusable>
          )}
          {!isLive && onCycleRate && (
            <TVFocusable accessibilityLabel={`Velocidade ${rate}x`} onPress={onCycleRate} style={styles.pillBtn} borderRadius={19} hitSlop={5}>
              <Text style={styles.pillText}>{rate}x</Text>
            </TVFocusable>
          )}
          {onCycleResize && resizeLabel && (
            <TVFocusable accessibilityLabel={`Proporção: ${resizeLabel}`} onPress={onCycleResize} style={styles.pillBtn} borderRadius={19} hitSlop={5}>
              <Ionicons name="expand-outline" size={16} color={colors.white} />
              <Text style={styles.pillText}>{resizeLabel}</Text>
            </TVFocusable>
          )}
          {showMinimize && onMinimize && (
            <TVFocusable accessibilityLabel="Minimizar player" onPress={onMinimize} style={styles.iconBtn} borderRadius={19} hitSlop={5}>
              <Ionicons name="contract-outline" size={18} color={colors.white} />
            </TVFocusable>
          )}
          {hasAudio && onToggleAudio && (
            <TVFocusable accessibilityLabel="Faixas de áudio" onPress={onToggleAudio} style={styles.iconBtn} borderRadius={19} hitSlop={5}>
              <Ionicons name="musical-notes-outline" size={18} color={colors.white} />
            </TVFocusable>
          )}
          {hasSubtitles && onToggleSubtitles && (
            <TVFocusable accessibilityLabel="Legendas" onPress={onToggleSubtitles} style={[styles.iconBtn, subtitleActive && [styles.iconBtnActive, { backgroundColor: acc.accentSoft, borderColor: acc.accent }]]} borderRadius={19} hitSlop={5}>
              <Ionicons name="chatbox-ellipses-outline" size={18} color={subtitleActive ? acc.accent : colors.white} />
            </TVFocusable>
          )}
          {onToggleSleepTimer && (
            <TVFocusable accessibilityLabel="Timer de desligamento" onPress={onToggleSleepTimer} style={styles.iconBtn} borderRadius={19} hitSlop={5}>
              <Ionicons name="moon-outline" size={18} color={sleepTimerActive ? acc.accent : colors.white} />
              {/* Enquanto roda, o estado "ativo" é só o anel regredindo — sem também
                  pintar o botão, que duplicava a indicação (círculo cheio + anel). */}
              {sleepTimerActive && sleepTimerEndAt != null && sleepTimerTotalMinutes != null && (
                <SleepRing endAt={sleepTimerEndAt} totalMinutes={sleepTimerTotalMinutes} />
              )}
            </TVFocusable>
          )}
          {showSidebarButton && (
            <TVFocusable accessibilityLabel={sidebarLabel} onPress={onToggleSidebar} style={styles.pillBtn} borderRadius={19} hitSlop={5}>
              <Ionicons name="list" size={18} color={colors.white} />
              <Text style={styles.pillText}>{sidebarLabel === 'Episódios' ? 'Episódios' : 'Canais'}</Text>
            </TVFocusable>
          )}
          {showNextEpisode && onNextEpisode && (
            <TVFocusable accessibilityLabel="Próximo episódio" onPress={onNextEpisode} style={styles.iconBtn} borderRadius={19} hitSlop={5}>
              <Ionicons name="play-skip-forward" size={18} color={colors.white} />
            </TVFocusable>
          )}
        </View>
      </View>

      {/* Center: play controls. Somem no modo scrubbing (deixa a tela limpa pra arrastar),
          mas seguem montados/focáveis — apertar ↑ na barra devolve o foco ao play. */}
      <View style={[styles.centerControls, scrubMode && styles.scrubHidden]} pointerEvents="box-none" {...hoverProps}>
        {/* disabled durante scrubbing → sem vizinho focável, o D-pad esq/dir borbulha
            para o onKeyDown (seek) em vez de mover o foco para cá.
            Ao vivo não tem como avançar/voltar — some com os botões de seek,
            deixando só o play/pause pra limpar a tela. */}
        {!isLive && (
          <TVFocusable accessibilityLabel="Voltar 10 segundos" onPress={() => onSeekBy(-10)} style={styles.seekBtn} borderRadius={IS_TV ? 26 : 22} disabled={scrubMode}>
            <Ionicons name="play-back" size={IS_TV ? 32 : 28} color="rgba(255,255,255,0.85)" />
          </TVFocusable>
        )}

        <TVFocusable ref={playRef} accessibilityLabel={isPlaying ? 'Pausar' : 'Reproduzir'} onPress={onTogglePlay} style={styles.playBtn} borderRadius={IS_TV ? 38 : 32} hasTVPreferredFocus>
          <Ionicons name={isPlaying ? 'pause' : 'play'} size={IS_TV ? 28 : 24} color={colors.textInverse} />
        </TVFocusable>

        {!isLive && (
          <TVFocusable accessibilityLabel="Avançar 10 segundos" onPress={() => onSeekBy(10)} style={styles.seekBtn} borderRadius={IS_TV ? 26 : 22} disabled={scrubMode}>
            <Ionicons name="play-forward" size={IS_TV ? 32 : 28} color="rgba(255,255,255,0.85)" />
          </TVFocusable>
        )}
      </View>

      {/* Base: título + agora/a seguir alinhados à esquerda, logo acima da barra
          (padrão de player de streaming — o olho já está embaixo, onde está o tempo). */}
      <View style={styles.osdBottom} {...hoverProps}>
        <View style={styles.titleBlock} pointerEvents="none">
          <Text style={styles.titleName} numberOfLines={1}>{displayTitle(channel)}</Text>
          <NowNextLine channel={channel} isLive={isLive} />
        </View>
        {!isLive && duration > 0 ? (
          <View style={styles.progressSection}>
            {IS_TV && scrubMode && (
              <View style={styles.scrubHint}>
                <Text style={styles.scrubHintText}>Segure esquerda ou direita para mover. OK pausa, cima volta.</Text>
              </View>
            )}
            {IS_NATIVE_TV && !scrubMode && (
              <Text style={styles.scrubHintIdle}>Desça para ajustar o tempo</Text>
            )}
            {IS_NATIVE_TV ? (
              // TV física: barra apenas VISUAL (não-focável). O modo scrubbing é estado
              // do PlayerScreen (liga na ↓); o seek vem do D-pad pelo canal nativo.
              // Web NÃO cai aqui: usa a barra interativa (clique/arraste) abaixo.
              <View style={styles.progressFocusable}>
                <View
                  style={styles.progressBg}
                  onLayout={(e) => { seekBarWidth.current = e.nativeEvent.layout.width; }}
                >
                  <View style={[styles.progressTrack, scrubMode && styles.progressTrackActive]} />
                  <View style={[styles.progressFill, { width: `${progressPct * 100}%`, backgroundColor: acc.accent }, scrubMode && styles.progressFillActive]} />
                  <View style={[styles.progressThumb, { left: `${progressPct * 100}%` }, scrubMode && [styles.progressThumbActive, { borderColor: acc.accent }]]} />
                </View>
              </View>
            ) : (
              <View
                style={styles.progressBg}
                onLayout={(e) => { seekBarWidth.current = e.nativeEvent.layout.width; }}
                {...panResponder.panHandlers}
              >
                <View style={styles.progressTrack} />
                <View style={[styles.progressFill, { width: `${progressPct * 100}%`, backgroundColor: acc.accent }]} />
                <View style={[styles.progressThumb, { left: `${progressPct * 100}%` }]} />
              </View>
            )}
            <View style={styles.timeRow}>
              <Text style={styles.timeText}>{formatTime(position)}</Text>
              <Text style={styles.timeText}>{formatTime(duration)}</Text>
            </View>
          </View>
        ) : isLive ? (
          // O selo AO VIVO já mora no bloco do título — aqui só a posição na lista
          <View style={styles.liveInfo}>
            <Text style={styles.channelCounter}>
              {`Canal ${currentIndex + 1} de ${totalChannels}`}
            </Text>
          </View>
        ) : null}

        {/* Channel nav — only show for non-live with no progress */}
        {!isLive && duration === 0 && (
          <View style={styles.bottomRow}>
            <TVFocusable accessibilityLabel="Canal anterior" onPress={onPrevChannel} style={styles.navBtn} borderRadius={20} hitSlop={4} disabled={currentIndex === 0}>
              <Ionicons name="play-skip-back" size={18} color={currentIndex === 0 ? 'rgba(255,255,255,0.3)' : colors.white} />
            </TVFocusable>
            <Text style={styles.channelCounter}>
              {currentIndex + 1}/{totalChannels}
            </Text>
            <TVFocusable accessibilityLabel="Próximo canal" onPress={onNextChannel} style={styles.navBtn} borderRadius={20} hitSlop={4} disabled={currentIndex === totalChannels - 1}>
              <Ionicons name="play-skip-forward" size={18} color={currentIndex === totalChannels - 1 ? 'rgba(255,255,255,0.3)' : colors.white} />
            </TVFocusable>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  osd: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },

  scrimTop:    { position: 'absolute', top: 0, left: 0, right: 0, height: 200 },
  scrimBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 340 },

  // Top
  osdTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',  // vazio à esquerda na TV física: ícones ficam à direita
    gap: 14,
    paddingHorizontal: IS_TV ? spacing.xxxl : 18,
    paddingTop: IS_TV ? 32 : 54,
    paddingBottom: spacing.lg,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.full,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Absoluto sobre a barra inteira (não um flex:1 entre back/ícones — larguras
  // desiguais dos dois lados descentralizavam o título). Insets iguais dos dois
  // lados garantem centro de verdade; numberOfLines=1 trunca com "…" se o nome
  // for maior que o espaço livre.
  titleBlock: { marginBottom: spacing.md, maxWidth: IS_TV ? '70%' : '100%' },
  titleName: {
    fontSize: IS_TV ? 24 : 16,
    fontFamily: fontFamily.bold,
    color: colors.white,
    letterSpacing: IS_TV ? -0.5 : -0.2,
  },
  topActions: { flexDirection: 'row', gap: 8 },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.full,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnActive: {
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accent,
  },

  // Volume (web) — a barra em si é o <input type="range"> (CSS injetado no topo);
  // sem gap: o wrap fechado tem largura 0 e o espaçamento vem do margin do slider
  volumeGroup: { flexDirection: 'row', alignItems: 'center' },

  // Center
  centerControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: IS_TV ? 36 : 28,
  },
  seekBtn: {
    width: IS_TV ? 52 : 44,
    height: IS_TV ? 52 : 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtn: {
    width: IS_TV ? 76 : 64,
    height: IS_TV ? 76 : 64,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Bottom
  osdBottom: {
    paddingHorizontal: IS_TV ? spacing.xxxl : 22,
    paddingBottom: IS_TV ? 60 : 56,
    gap: spacing.sm,
  },
  progressSection: { gap: spacing.sm },
  // Esconde elementos da OSD durante o scrubbing, mantendo-os montados/focáveis
  scrubHidden: { opacity: 0 },
  scrubHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 4,
  },
  scrubHintText: {
    color: colors.text1,
    fontSize: fontSize.xs,
    fontFamily: fontFamily.medium,
  },
  progressFocusable: {
    paddingVertical: 6,
  },
  progressBg: {
    height: 20,
    justifyContent: 'center',
    position: 'relative',
  },
  // Trilho completo (parte não reproduzida) — antes só a bolinha aparecia
  progressTrack: {
    position: 'absolute', left: 0, right: 0, top: 8.5, height: 3,
    borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)',
  },
  progressTrackActive: { height: 5, top: 7.5 },
  scrubHintIdle: { color: 'rgba(255,255,255,0.7)', fontSize: fontSize.xs, fontFamily: fontFamily.regular, textAlign: 'right' },
  pillBtn: {
    height: 38, minWidth: 38, paddingHorizontal: 11, borderRadius: radius.full,
    backgroundColor: 'rgba(0,0,0,0.4)', flexDirection: 'row', gap: 5,
    alignItems: 'center', justifyContent: 'center',
  },
  pillText: { color: colors.white, fontSize: 12, fontFamily: fontFamily.semiBold },
  progressFill: {
    position: 'absolute',
    left: 0,
    height: 3,
    backgroundColor: colors.accent,
    borderRadius: 2,
    top: 8.5,
  },
  // Realce quando a barra está focada na TV (scrubbing ativo)
  progressFillActive: {
    height: 5,
    top: 7.5,
  },
  progressThumb: {
    position: 'absolute',
    top: 4.5,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: colors.white,
    marginLeft: -5.5,
  },
  progressThumbActive: {
    top: 1.5,
    width: 17,
    height: 17,
    borderRadius: 9,
    marginLeft: -8.5,
    borderWidth: 2,
    borderColor: colors.accent,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: fontSize.xs,
    fontVariant: ['tabular-nums'],
  },

  liveInfo: { flexDirection: 'row', justifyContent: 'flex-end' },

  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
  },
  navBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  channelCounter: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: fontSize.xs,
    fontFamily: fontFamily.regular,
    fontVariant: ['tabular-nums'],
  },
});
