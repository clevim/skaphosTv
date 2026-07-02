import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import TVFocusable, { TVFocusableHandle } from './TVFocusable';
import { colors, radius, fontFamily } from '../utils/theme';
import {
  getJellyfinAudioTracks, JellyfinAudioTrack,
  getJellyfinSubtitleTracks, JellyfinSubtitleTrack,
  parseJellyfinVideoUrl,
} from '../utils/jellyfinLoader';
import { useStore } from '../store/useStore';
import { IS_TV } from '../utils/tvDetect';

const LANG_CODES: Record<string, string[]> = {
  'pt-BR': ['por', 'pt', 'pb', 'pt-br', 'pt-BR', 'portuguese'],
  'en':    ['eng', 'en', 'english'],
  'es':    ['spa', 'es', 'spanish'],
  'fr':    ['fra', 'fre', 'fr', 'french'],
};

function matchesLang(language: string, displayTitle: string, pref: string): boolean {
  if (!pref) return false;
  const codes = LANG_CODES[pref] ?? [pref.toLowerCase()];
  const lang  = language.toLowerCase();
  const title = displayTitle.toLowerCase();
  return codes.some(c => lang === c || lang.startsWith(c) || title.includes(c));
}

interface Props {
  visible: boolean;
  channelUrl: string;
  onConfirm: (
    url: string,
    subtitleIndex: number | null,
    subtitleTracks: JellyfinSubtitleTrack[],
    audioIndex: number | null,
    audioTracks: JellyfinAudioTrack[],
  ) => void;
  onCancel: () => void;
}

type Tab = 'audio' | 'subtitle';

export default function JellyfinTrackSheet({ visible, channelUrl, onConfirm, onCancel }: Props) {
  const sources  = useStore(s => s.sources);
  const settings = useStore(s => s.settings);
  const [audioTracks, setAudioTracks]       = useState<JellyfinAudioTrack[]>([]);
  const [subtitleTracks, setSubtitleTracks] = useState<JellyfinSubtitleTrack[]>([]);
  const [selectedAudio, setSelectedAudio]   = useState<number | null>(null);
  const [selectedSubtitle, setSelectedSubtitle] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('audio');

  // Refs para focus trapping via nextFocus* (IDs nativos Android)
  const cancelRef    = useRef<TVFocusableHandle | null>(null);
  const playRef      = useRef<TVFocusableHandle | null>(null);
  const tabAudioRef  = useRef<TVFocusableHandle | null>(null);
  const tabSubRef    = useRef<TVFocusableHandle | null>(null);
  const firstItemRef = useRef<TVFocusableHandle | null>(null);
  const [cancelTag,   setCancelTag]   = useState<number | null>(null);
  const [playTag,     setPlayTag]     = useState<number | null>(null);
  const [tabAudioTag, setTabAudioTag] = useState<number | null>(null);
  const [tabSubTag,   setTabSubTag]   = useState<number | null>(null);
  const [topTag,      setTopTag]      = useState<number | null>(null); // 1ª aba ou 1º item

  // Captura IDs após carregar e renderizar
  useEffect(() => {
    if (loading || !visible || !IS_TV) return;
    const t = setTimeout(() => {
      const ct  = cancelRef.current?.getTag()   ?? null;
      const pt  = playRef.current?.getTag()     ?? null;
      const tat = tabAudioRef.current?.getTag() ?? null;
      const tst = tabSubRef.current?.getTag()   ?? null;
      const tt  = tat ?? firstItemRef.current?.getTag() ?? null;
      setCancelTag(ct);
      setPlayTag(pt);
      setTabAudioTag(tat);
      setTabSubTag(tst);
      setTopTag(tt);
    }, 150);
    return () => clearTimeout(t);
  }, [loading, visible, activeTab]);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setAudioTracks([]);
    setSubtitleTracks([]);
    setSelectedAudio(null);
    setSelectedSubtitle(null);
    setActiveTab('audio');

    const parsed = parseJellyfinVideoUrl(channelUrl);
    if (!parsed) { setLoading(false); onConfirm(channelUrl, null, [], null, []); return; }

    const src = sources.find(s => s.type === 'jellyfin' && s.host?.replace(/\/$/, '') === parsed.host);
    if (!src?.userId || !src?.apiKey) { setLoading(false); onConfirm(channelUrl, null, [], null, []); return; }

    const prefAudio = settings.jellyfinPreferredAudio;
    const prefSub   = settings.jellyfinPreferredSubtitle;

    Promise.all([
      getJellyfinAudioTracks(parsed.host, src.apiKey, src.userId, parsed.itemId),
      getJellyfinSubtitleTracks(parsed.host, src.apiKey, src.userId, parsed.itemId),
    ])
      .then(([audio, subs]) => {
        setAudioTracks(audio);
        setSubtitleTracks(subs);
        const prefAudioTrack = audio.find(x => matchesLang(x.language, x.displayTitle, prefAudio));
        setSelectedAudio(prefAudioTrack?.index ?? null);
        // Legenda automática só quando habilitada em Ajustes → Reprodução
        if (settings.subtitleEnabled) {
          const prefSubTrack = subs.find(x => matchesLang(x.language, x.displayTitle, prefSub));
          setSelectedSubtitle(prefSubTrack?.index ?? null);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [visible, channelUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePlay = () => {
    onConfirm(channelUrl, selectedSubtitle, subtitleTracks, selectedAudio, audioTracks);
  };

  useEffect(() => {
    if (!loading && audioTracks.length <= 1 && subtitleTracks.length === 0) {
      const singleAudio = audioTracks.length === 1 ? audioTracks[0].index : null;
      onConfirm(channelUrl, null, [], singleAudio, audioTracks);
    }
  }, [loading, audioTracks.length, subtitleTracks.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!loading && audioTracks.length <= 1 && subtitleTracks.length === 0) return null;
  if (!visible) return null;

  const hasSubtitles = subtitleTracks.length > 0;

  return (
    <View style={styles.root} pointerEvents="box-none">
      {/* Backdrop clicável, não focável pelo D-pad */}
      <Pressable
        style={StyleSheet.absoluteFillObject}
        onPress={onCancel}
        {...({ focusable: false } as any)}
      />

      <View style={styles.sheet}>
        <View style={styles.header}>
          <Ionicons name="musical-notes-outline" size={18} color={colors.accent} />
          <Text style={styles.title}>Faixas</Text>
        </View>

        {hasSubtitles && !loading && (
          <View style={styles.tabBar}>
            {/* Tab Áudio — L/R/UP: vai para Legendas (ciclo fechado entre as abas) */}
            <TVFocusable
              ref={tabAudioRef}
              onPress={() => setActiveTab('audio')}
              style={[styles.tab, activeTab === 'audio' && styles.tabActive]}
              borderRadius={0}
              focusScale={1}
              nextFocusLeft={tabSubTag ?? undefined}
              nextFocusRight={tabSubTag ?? undefined}
              nextFocusUp={tabSubTag ?? undefined}
            >
              <Ionicons
                name="musical-note-outline"
                size={13}
                color={activeTab === 'audio' ? colors.text1 : colors.text3}
              />
              <Text style={[styles.tabText, activeTab === 'audio' && styles.tabTextActive]}>
                Áudio
              </Text>
            </TVFocusable>

            {/* Tab Legendas — L/R/UP: vai para Áudio (ciclo fechado entre as abas) */}
            <TVFocusable
              ref={tabSubRef}
              onPress={() => setActiveTab('subtitle')}
              style={[styles.tab, activeTab === 'subtitle' && styles.tabActive]}
              borderRadius={0}
              focusScale={1}
              nextFocusLeft={tabAudioTag ?? undefined}
              nextFocusRight={tabAudioTag ?? undefined}
              nextFocusUp={tabAudioTag ?? undefined}
            >
              <Ionicons
                name="chatbox-ellipses-outline"
                size={13}
                color={activeTab === 'subtitle' ? colors.text1 : colors.text3}
              />
              <Text style={[styles.tabText, activeTab === 'subtitle' && styles.tabTextActive]}>
                Legendas
                {selectedSubtitle !== null && (
                  <Text style={styles.tabBadge}> ●</Text>
                )}
              </Text>
            </TVFocusable>
          </View>
        )}

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.loadingText}>Carregando faixas...</Text>
          </View>
        ) : activeTab === 'audio' ? (
          <FlatList
            data={audioTracks}
            keyExtractor={t => String(t.index)}
            style={styles.list}
            renderItem={({ item, index: listIndex }) => {
              const active  = item.index === selectedAudio;
              const isFirst = listIndex === 0;
              const isLast  = listIndex === audioTracks.length - 1;
              return (
                <TVFocusable
                  ref={isFirst ? firstItemRef : undefined}
                  onPress={() => setSelectedAudio(item.index)}
                  style={[styles.trackRow, active && styles.trackRowActive]}
                  focusScale={1}
                  borderRadius={6}
                  hasTVPreferredFocus={selectedAudio !== null ? item.index === selectedAudio : isFirst}
                  // UP do 1º item (sem abas) → Cancel; DOWN do último → Play (fecha o ciclo); L/R → Cancel e Play
                  nextFocusUp={isFirst && !hasSubtitles && cancelTag ? cancelTag : undefined}
                  nextFocusDown={isLast && playTag ? playTag : undefined}
                  nextFocusLeft={cancelTag ?? undefined}
                  nextFocusRight={playTag ?? undefined}
                >
                  <View style={[styles.radio, active && styles.radioActive]}>
                    {active && <View style={styles.radioDot} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.trackTitle, active && styles.trackTitleActive]}>
                      {item.displayTitle}
                    </Text>
                    {item.isDefault && (
                      <Text style={styles.trackSub}>Padrão</Text>
                    )}
                  </View>
                </TVFocusable>
              );
            }}
          />
        ) : (
          <FlatList
            data={[
              { index: -1, displayTitle: 'Desativado', language: '', isExternal: false, vttUrl: '' },
              ...subtitleTracks,
            ]}
            keyExtractor={t => String(t.index)}
            style={styles.list}
            renderItem={({ item, index: listIndex }) => {
              const isOff   = item.index === -1;
              const active  = isOff ? selectedSubtitle === null : item.index === selectedSubtitle;
              const isFirst = listIndex === 0;
              const isLast  = listIndex === subtitleTracks.length; // +1 da opção "Desativado"
              return (
                <TVFocusable
                  ref={isFirst ? firstItemRef : undefined}
                  onPress={() => setSelectedSubtitle(isOff ? null : item.index)}
                  style={[styles.trackRow, active && styles.trackRowActive]}
                  focusScale={1}
                  borderRadius={6}
                  hasTVPreferredFocus={isFirst}
                  nextFocusDown={isLast && playTag ? playTag : undefined}
                  nextFocusLeft={cancelTag ?? undefined}
                  nextFocusRight={playTag ?? undefined}
                >
                  <View style={[styles.radio, active && styles.radioActive]}>
                    {active && <View style={styles.radioDot} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.trackTitle, active && styles.trackTitleActive]}>
                      {item.displayTitle}
                    </Text>
                    {!isOff && item.isExternal && (
                      <Text style={styles.trackSub}>Externo</Text>
                    )}
                  </View>
                </TVFocusable>
              );
            }}
          />
        )}

        <View style={styles.actions}>
          {/* Cancel — DOWN: volta ao topo (loop fundo→topo) */}
          <TVFocusable
            ref={cancelRef}
            onPress={onCancel}
            style={styles.cancelBtn}
            nextFocusDown={topTag ?? undefined}
            nextFocusLeft={playTag ?? undefined}
          >
            <Text style={styles.cancelText}>Cancelar</Text>
          </TVFocusable>

          {/* Play — DOWN: volta ao topo; RIGHT: vai para Cancel */}
          <TVFocusable
            ref={playRef}
            onPress={handlePlay}
            style={styles.playBtn}
            nextFocusDown={topTag ?? undefined}
            nextFocusRight={cancelTag ?? undefined}
          >
            <Ionicons name="play" size={14} color={colors.textInverse} />
            <Text style={styles.playText}>Assistir</Text>
          </TVFocusable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  sheet: {
    width: 360,
    maxHeight: 520,
    backgroundColor: colors.bg1,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  title: { fontSize: 15, fontFamily: fontFamily.semiBold, color: colors.text1 },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: colors.accent },
  tabText: { fontSize: 13, fontWeight: '500', color: colors.text3 },
  tabTextActive: { color: colors.text1, fontWeight: '600' },
  tabBadge: { color: colors.accent, fontSize: 10 },
  center: { alignItems: 'center', gap: 10, padding: 32 },
  loadingText: { fontSize: 13, color: colors.text3 },
  list: { maxHeight: 300 },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  trackRowActive: { backgroundColor: colors.accentSoft },
  radio: {
    width: 18, height: 18, borderRadius: 9,
    borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  radioActive: { borderColor: colors.accent },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  trackTitle: { fontSize: 13, fontWeight: '500', color: colors.text2 },
  trackTitleActive: { color: colors.text1, fontWeight: '600' },
  trackSub: { fontSize: 10, color: colors.text3, marginTop: 2 },
  actions: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  cancelBtn: {
    flex: 1, height: 42, borderRadius: radius.md,
    backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  cancelText: { fontSize: 13, fontWeight: '500', color: colors.text2 },
  playBtn: {
    flex: 2, height: 42, borderRadius: radius.md,
    backgroundColor: colors.text1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  playText: { fontSize: 13, fontWeight: '600', color: colors.textInverse },
});
