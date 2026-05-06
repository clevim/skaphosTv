import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useStore, IPTVSource } from '../store/useStore';
import TVFocusable from '../components/TVFocusable';
import { parseM3U, buildXtreamM3U } from '../utils/m3uParser';
import { colors, spacing, fontSize, radius } from '../utils/theme';

type TabType = 'm3u' | 'xtream';

export default function SetupScreen() {
  const navigation = useNavigation();
  const { addSource, sources, removeSource, setChannels, setLoading, setLoadError } = useStore();

  const [activeTab, setActiveTab] = useState<TabType>('m3u');
  const [isLoading, setIsLoadingLocal] = useState(false);

  // M3U form
  const [m3uUrl, setM3uUrl] = useState('');
  const [m3uName, setM3uName] = useState('');

  // Xtream form
  const [xHost, setXHost] = useState('');
  const [xUser, setXUser] = useState('');
  const [xPass, setXPass] = useState('');
  const [xName, setXName] = useState('');

  const loadAndSaveM3U = async () => {
    if (!m3uUrl.trim()) { Alert.alert('Erro', 'Digite a URL da lista M3U'); return; }
    setIsLoadingLocal(true);
    try {
      const response = await axios.get(m3uUrl.trim(), { timeout: 30000 });
      const result = parseM3U(response.data);
      if (result.channels.length === 0) throw new Error('Nenhum canal encontrado na lista');

      const source: IPTVSource = {
        id: Date.now().toString(),
        name: m3uName.trim() || 'Minha Lista M3U',
        type: 'm3u',
        url: m3uUrl.trim(),
        addedAt: Date.now(),
        channelCount: result.channels.length,
      };
      addSource(source);
      setChannels(result.channels, result.groups);
      Alert.alert('Sucesso!', `${result.channels.length} canais carregados`, [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch (e: any) {
      Alert.alert('Erro ao carregar lista', e.message || 'Verifique a URL e tente novamente');
    } finally {
      setIsLoadingLocal(false);
    }
  };

  const loadXtream = async () => {
    if (!xHost.trim() || !xUser.trim() || !xPass.trim()) {
      Alert.alert('Erro', 'Preencha todos os campos'); return;
    }
    setIsLoadingLocal(true);
    try {
      const m3uUrl = buildXtreamM3U(xHost.trim(), xUser.trim(), xPass.trim());
      const response = await axios.get(m3uUrl, { timeout: 30000 });
      const result = parseM3U(response.data);
      if (result.channels.length === 0) throw new Error('Nenhum canal encontrado');

      const source: IPTVSource = {
        id: Date.now().toString(),
        name: xName.trim() || `Xtream: ${xHost}`,
        type: 'xtream',
        host: xHost.trim(),
        username: xUser.trim(),
        password: xPass.trim(),
        addedAt: Date.now(),
        channelCount: result.channels.length,
      };
      addSource(source);
      setChannels(result.channels, result.groups);
      Alert.alert('Conectado!', `${result.channels.length} canais carregados via Xtream API`, [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch (e: any) {
      Alert.alert('Falha na conexão', e.message || 'Verifique as credenciais e servidor');
    } finally {
      setIsLoadingLocal(false);
    }
  };

  const deleteSource = (id: string, name: string) => {
    Alert.alert('Remover fonte', `Remover "${name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: () => removeSource(id) },
    ]);
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <TVFocusable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.text2} />
        </TVFocusable>
        <Text style={styles.title}>Fontes IPTV</Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
        {/* Existing sources */}
        {sources.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>FONTES ATIVAS</Text>
            {sources.map(source => (
              <View key={source.id} style={styles.sourceCard}>
                <View style={[styles.sourceIcon, source.type === 'xtream' ? styles.sourceIconXtream : styles.sourceIconM3U]}>
                  <Ionicons name={source.type === 'xtream' ? 'server' : 'document-text'} size={20} color={colors.white} />
                </View>
                <View style={styles.sourceMeta}>
                  <Text style={styles.sourceName}>{source.name}</Text>
                  <Text style={styles.sourceType}>
                    {source.type === 'xtream' ? 'Xtream API' : 'Lista M3U'} • {source.channelCount || 0} canais
                  </Text>
                  <Text style={styles.sourceUrl} numberOfLines={1}>
                    {source.url || source.host}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => deleteSource(source.id, source.name)} style={styles.deleteBtn}>
                  <Ionicons name="trash-outline" size={20} color={colors.red} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Add new source */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>ADICIONAR NOVA FONTE</Text>

          {/* Tabs */}
          <View style={styles.tabs}>
            <TVFocusable
              onPress={() => setActiveTab('m3u')}
              style={[styles.tab, activeTab === 'm3u' && styles.tabActive]}
            >
              <Ionicons name="document-text" size={18} color={activeTab === 'm3u' ? colors.accent2 : colors.text3} />
              <Text style={[styles.tabText, activeTab === 'm3u' && styles.tabTextActive]}>Lista M3U</Text>
            </TVFocusable>
            <TVFocusable
              onPress={() => setActiveTab('xtream')}
              style={[styles.tab, activeTab === 'xtream' && styles.tabActive]}
            >
              <Ionicons name="server" size={18} color={activeTab === 'xtream' ? colors.accent2 : colors.text3} />
              <Text style={[styles.tabText, activeTab === 'xtream' && styles.tabTextActive]}>Xtream API</Text>
            </TVFocusable>
          </View>

          {activeTab === 'm3u' ? (
            <View style={styles.form}>
              <Text style={styles.formDesc}>
                Adicione uma lista M3U via URL. Suporta listas públicas e privadas com autenticação na URL.
              </Text>
              <View style={styles.field}>
                <Text style={styles.label}>URL da Lista M3U *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="http://servidor.com/lista.m3u"
                  placeholderTextColor={colors.text3}
                  value={m3uUrl}
                  onChangeText={setM3uUrl}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Nome (opcional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Minha Lista"
                  placeholderTextColor={colors.text3}
                  value={m3uName}
                  onChangeText={setM3uName}
                />
              </View>
              <TVFocusable
                onPress={isLoading ? undefined : loadAndSaveM3U}
                style={[styles.submitBtn, isLoading && styles.submitBtnDisabled]}
                hasTVPreferredFocus
              >
                {isLoading ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <>
                    <Ionicons name="cloud-download" size={20} color={colors.white} />
                    <Text style={styles.submitText}>Carregar Lista M3U</Text>
                  </>
                )}
              </TVFocusable>
            </View>
          ) : (
            <View style={styles.form}>
              <Text style={styles.formDesc}>
                Conecte via Xtream Codes API para acesso completo a canais ao vivo, VOD e séries.
              </Text>
              <View style={styles.field}>
                <Text style={styles.label}>Servidor / Host *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="http://servidor.com:8080"
                  placeholderTextColor={colors.text3}
                  value={xHost}
                  onChangeText={setXHost}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Usuário *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="seu_usuario"
                  placeholderTextColor={colors.text3}
                  value={xUser}
                  onChangeText={setXUser}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Senha *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="sua_senha"
                  placeholderTextColor={colors.text3}
                  value={xPass}
                  onChangeText={setXPass}
                  secureTextEntry
                  autoCapitalize="none"
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Nome da fonte (opcional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Meu Servidor"
                  placeholderTextColor={colors.text3}
                  value={xName}
                  onChangeText={setXName}
                />
              </View>
              <TVFocusable
                onPress={isLoading ? undefined : loadXtream}
                style={[styles.submitBtn, isLoading && styles.submitBtnDisabled]}
                hasTVPreferredFocus
              >
                {isLoading ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <>
                    <Ionicons name="link" size={20} color={colors.white} />
                    <Text style={styles.submitText}>Conectar Xtream API</Text>
                  </>
                )}
              </TVFocusable>
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg0 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border,
    backgroundColor: colors.bg1,
  },
  backBtn: { padding: 6, borderRadius: radius.sm },
  title: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text1 },

  content: { flex: 1 },
  contentInner: { padding: spacing.xl, gap: spacing.xl, maxWidth: 640, alignSelf: 'center', width: '100%' },

  section: { gap: spacing.md },
  sectionLabel: { fontSize: 11, fontWeight: '600', color: colors.text3, letterSpacing: 0.8 },

  sourceCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: colors.bg1, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md,
  },
  sourceIcon: { width: 44, height: 44, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  sourceIconM3U: { backgroundColor: colors.accent },
  sourceIconXtream: { backgroundColor: '#059669' },
  sourceMeta: { flex: 1 },
  sourceName: { fontSize: fontSize.md, fontWeight: '600', color: colors.text1 },
  sourceType: { fontSize: fontSize.xs, color: colors.accent2, marginTop: 2 },
  sourceUrl: { fontSize: fontSize.xs, color: colors.text3, marginTop: 2 },
  deleteBtn: { padding: 8 },

  tabs: {
    flexDirection: 'row', gap: spacing.sm,
    backgroundColor: colors.bg2, borderRadius: radius.md, padding: 4,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, padding: spacing.md, borderRadius: radius.sm,
  },
  tabActive: { backgroundColor: colors.accent },
  tabText: { fontSize: fontSize.sm, color: colors.text3, fontWeight: '600' },
  tabTextActive: { color: colors.white },

  form: { gap: spacing.md },
  formDesc: { fontSize: fontSize.sm, color: colors.text2, lineHeight: 20 },
  field: { gap: spacing.xs },
  label: { fontSize: fontSize.xs, fontWeight: '600', color: colors.text2, letterSpacing: 0.3 },
  input: {
    backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.sm, padding: spacing.md, color: colors.text1, fontSize: fontSize.sm,
  },
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, backgroundColor: colors.accent, borderRadius: radius.md,
    padding: spacing.lg, marginTop: spacing.sm,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { color: colors.white, fontSize: fontSize.md, fontWeight: '700' },
});
