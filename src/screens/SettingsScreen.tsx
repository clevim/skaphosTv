import React from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useStore } from '../store/useStore';
import TVFocusable from '../components/TVFocusable';
import { colors, spacing, fontSize, radius } from '../utils/theme';

export default function SettingsScreen() {
  const navigation = useNavigation();
  const { settings, updateSettings, sources } = useStore();

  const clearAll = () => {
    Alert.alert('Limpar dados', 'Isso remove todas as fontes, favoritos e histórico. Continuar?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Limpar tudo', style: 'destructive',
        onPress: async () => {
          await AsyncStorage.clear();
          Alert.alert('Pronto', 'Todos os dados foram removidos. Reinicie o app.');
        },
      },
    ]);
  };

  const Row = ({ label, sub, children }: { label: string; sub?: string; children?: React.ReactNode }) => (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {sub && <Text style={styles.rowSub}>{sub}</Text>}
      </View>
      {children}
    </View>
  );

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBox}>{children}</View>
    </View>
  );

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TVFocusable onPress={() => navigation.goBack()} style={styles.back}>
          <Ionicons name="chevron-back" size={22} color={colors.text2} />
        </TVFocusable>
        <Ionicons name="settings" size={22} color={colors.accent2} />
        <Text style={styles.title}>Configurações</Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.inner}>
        <Section title="REPRODUÇÃO">
          <Row label="Reprodução automática" sub="Iniciar próximo canal automaticamente">
            <Switch
              value={settings.autoPlay}
              onValueChange={v => updateSettings({ autoPlay: v })}
              trackColor={{ true: colors.accent }}
              thumbColor={colors.white}
            />
          </Row>
          <Row label="Mostrar relógio" sub="Exibir horário na tela do player">
            <Switch
              value={settings.showClock}
              onValueChange={v => updateSettings({ showClock: v })}
              trackColor={{ true: colors.accent }}
              thumbColor={colors.white}
            />
          </Row>
          <Row label="Buffer de carregamento" sub={`${settings.bufferSize}ms`} />
        </Section>

        <Section title="FONTE IPTV">
          <Row label="Fontes configuradas" sub={`${sources.length} fonte${sources.length !== 1 ? 's' : ''} ativa${sources.length !== 1 ? 's' : ''}`}>
            <TVFocusable onPress={() => navigation.navigate('Setup' as never)} style={styles.linkBtn}>
              <Text style={styles.linkBtnText}>Gerenciar</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.accent2} />
            </TVFocusable>
          </Row>
        </Section>

        <Section title="SOBRE">
          <Row label="Versão" sub="FluxTV 1.0.0" />
          <Row label="Plataformas" sub="Android • Android TV • FireStick" />
          <Row label="Formatos suportados" sub="M3U, M3U8, Xtream Codes API" />
          <Row label="Protocolos" sub="HLS, DASH, HTTP TS, RTMP" />
        </Section>

        <Section title="DADOS">
          <TVFocusable onPress={clearAll} style={styles.dangerBtn}>
            <Ionicons name="trash-outline" size={18} color={colors.red} />
            <Text style={styles.dangerText}>Limpar todos os dados</Text>
          </TVFocusable>
        </Section>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg0 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border,
    backgroundColor: colors.bg1,
  },
  back: { padding: 6, borderRadius: radius.sm },
  title: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text1 },
  content: { flex: 1 },
  inner: { padding: spacing.xl, gap: spacing.xl, maxWidth: 600, alignSelf: 'center', width: '100%' },

  section: { gap: spacing.sm },
  sectionTitle: { fontSize: 11, fontWeight: '600', color: colors.text3, letterSpacing: 0.8 },
  sectionBox: { backgroundColor: colors.bg1, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border + '80',
  },
  rowLabel: { fontSize: fontSize.sm, fontWeight: '500', color: colors.text1 },
  rowSub: { fontSize: fontSize.xs, color: colors.text3, marginTop: 2 },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  linkBtnText: { fontSize: fontSize.sm, color: colors.accent2, fontWeight: '600' },
  dangerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: spacing.md, margin: spacing.sm,
    backgroundColor: colors.red + '18', borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.red + '44',
  },
  dangerText: { color: colors.red, fontSize: fontSize.sm, fontWeight: '600' },
});
