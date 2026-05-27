/**
 * JellyfinTrackSheet — Modal de seleção de faixa de áudio e legenda para conteúdo Jellyfin.
 * Aparece antes de iniciar a reprodução quando há múltiplas faixas de áudio ou legendas.
 */
import React, { useEffect, useState } from 'react';
import {
  Modal, View, Text, StyleSheet, FlatList, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import TVFocusable from './TVFocusable';
import { colors, radius, fontFamily } from '../utils/theme';
import {
  getJellyfinAudioTracks, JellyfinAudioTrack,
  getJellyfinSubtitleTracks, JellyfinSubtitleTrack,
  parseJellyfinVideoUrl,
} from '../utils/jellyfinLoader';
import { useStore } from '../store/useStore';

// Mapeia preferências de idioma para códigos ISO 639-1/2 usados pelo Jellyfin
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
  const { sources, settings } = useStore();
  const [audioTracks, setAudioTracks] = useState<JellyfinAudioTrack[]>([]);
  const [subtitleTracks, setSubtitleTracks] = useState<JellyfinSubtitleTrack[]>([]);
  const [selectedAudio, setSelectedAudio] = useState<number | null>(null);
  const [selectedSubtitle, setSelectedSubtitle] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('audio');

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

        // Tenta selecionar faixa de áudio pelo idioma preferido; se não achar, não pré-seleciona
        const prefAudioTrack = audio.find(x => matchesLang(x.language, x.displayTitle, prefAudio));
        setSelectedAudio(prefAudioTrack?.index ?? null);

        // Tenta selecionar legenda pelo idioma preferido; se não achar, nenhuma legenda selecionada
        const prefSubTrack = subs.find(x => matchesLang(x.language, x.displayTitle, prefSub));
        setSelectedSubtitle(prefSubTrack?.index ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [visible, channelUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePlay = () => {
    onConfirm(channelUrl, selectedSubtitle, subtitleTracks, selectedAudio, audioTracks);
  };

  // Se só tem uma faixa de áudio e nenhuma legenda, vai direto sem mostrar o modal
  useEffect(() => {
    if (!loading && audioTracks.length <= 1 && subtitleTracks.length === 0) {
      // Sem escolha possível: vai direto sem mostrar o modal
      const singleAudio = audioTracks.length === 1 ? audioTracks[0].index : null;
      onConfirm(channelUrl, null, [], singleAudio, audioTracks);
    }
  }, [loading, audioTracks.length, subtitleTracks.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!loading && audioTracks.length <= 1 && subtitleTracks.length === 0) return null;

  const hasSubtitles = subtitleTracks.length > 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Ionicons name="musical-notes-outline" size={18} color={colors.accent} />
            <Text style={styles.title}>Faixas</Text>
          </View>

          {/* Abas (só mostra se tiver legendas disponíveis) */}
          {hasSubtitles && !loading && (
            <View style={styles.tabBar}>
              <TVFocusable
                onPress={() => setActiveTab('audio')}
                style={[styles.tab, activeTab === 'audio' && styles.tabActive]}
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
              <TVFocusable
                onPress={() => setActiveTab('subtitle')}
                style={[styles.tab, activeTab === 'subtitle' && styles.tabActive]}
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
                const active = item.index === selectedAudio;
                return (
                  <TVFocusable
                    onPress={() => setSelectedAudio(item.index)}
                    style={[styles.trackRow, active && styles.trackRowActive]}
                    hasTVPreferredFocus={selectedAudio !== null ? item.index === selectedAudio : listIndex === 0}
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
                const isOff = item.index === -1;
                const active = isOff ? selectedSubtitle === null : item.index === selectedSubtitle;
                return (
                  <TVFocusable
                    onPress={() => setSelectedSubtitle(isOff ? null : item.index)}
                    style={[styles.trackRow, active && styles.trackRowActive]}
                    hasTVPreferredFocus={listIndex === 0}
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
            <TVFocusable onPress={onCancel} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </TVFocusable>
            <TVFocusable onPress={handlePlay} style={styles.playBtn}>
              <Ionicons name="play" size={14} color="#0a0a0b" />
              <Text style={styles.playText}>Assistir</Text>
            </TVFocusable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
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
  title: {
    fontSize: 15,
    fontFamily: fontFamily.semiBold,
    color: colors.text1,
  },
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
  tabActive: {
    borderBottomColor: colors.accent,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text3,
  },
  tabTextActive: {
    color: colors.text1,
    fontWeight: '600',
  },
  tabBadge: {
    color: colors.accent,
    fontSize: 10,
  },
  center: {
    alignItems: 'center',
    gap: 10,
    padding: 32,
  },
  loadingText: { fontSize: 13, color: colors.text3 },
  list: { maxHeight: 300 },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderRadius: 0,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  trackRowActive: {
    backgroundColor: colors.accentSoft,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: { borderColor: colors.accent },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
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
    flex: 1,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.bg2,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { fontSize: 13, fontWeight: '500', color: colors.text2 },
  playBtn: {
    flex: 2,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.text1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  playText: { fontSize: 13, fontWeight: '600', color: '#0a0a0b' },
});
