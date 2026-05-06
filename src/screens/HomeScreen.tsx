import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, ActivityIndicator, Platform, Dimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../store/useStore';
import ChannelCard from '../components/ChannelCard';
import TVFocusable from '../components/TVFocusable';
import { colors, spacing, fontSize, radius } from '../utils/theme';
import { RootStackParamList, Channel } from '../../App';
import axios from 'axios';
import { parseM3U } from '../utils/m3uParser';

type Nav = StackNavigationProp<RootStackParamList, 'Home'>;

const { width, height } = Dimensions.get('window');
const SIDEBAR_W = 220;
const IS_TV = Platform.isTV;

const NAV_ITEMS = [
  { key: 'all', label: 'Todos', icon: 'grid' },
  { key: 'favorites', label: 'Favoritos', icon: 'star' },
  { key: 'recent', label: 'Recentes', icon: 'time' },
];

export default function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const {
    channels, groups, selectedGroup, isLoading, loadError,
    sources, favorites, recentChannels, currentChannel,
    setChannels, setSelectedGroup, setLoading, setLoadError,
    setCurrentChannel, loadFromStorage,
  } = useStore();

  const [navKey, setNavKey] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [clock, setClock] = useState('');

  // Clock
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setClock(now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    };
    tick();
    const interval = setInterval(tick, 30000);
    return () => clearInterval(interval);
  }, []);

  // Load persisted data on mount
  useEffect(() => {
    loadFromStorage().then(() => {
      const { sources } = useStore.getState();
      if (sources.length > 0) {
        loadSourceChannels(sources[0]);
      }
    });
  }, []);

  const loadSourceChannels = async (source: any) => {
    try {
      setLoading(true);
      setLoadError(null);
      let url = source.url;
      if (source.type === 'xtream') {
        url = `${source.host}/get.php?username=${source.username}&password=${source.password}&type=m3u_plus&output=ts`;
      }
      const response = await axios.get(url, { timeout: 30000 });
      const result = parseM3U(response.data);
      setChannels(result.channels, result.groups);
    } catch (e: any) {
      setLoadError(e.message || 'Erro ao carregar lista');
    } finally {
      setLoading(false);
    }
  };

  const filteredChannels = useMemo(() => {
    let list: Channel[] = [];

    if (navKey === 'favorites') {
      list = channels.filter(c => favorites.includes(c.id));
    } else if (navKey === 'recent') {
      list = recentChannels;
    } else if (selectedGroup) {
      list = channels.filter(c => c.group === selectedGroup);
    } else {
      list = channels;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.group || '').toLowerCase().includes(q)
      );
    }

    return list;
  }, [channels, navKey, selectedGroup, favorites, recentChannels, searchQuery]);

  const handleChannelPress = useCallback((channel: Channel) => {
    setCurrentChannel(channel);
    navigation.navigate('Player', { channel });
  }, [navigation, setCurrentChannel]);

  const renderChannel = useCallback(({ item, index }: { item: Channel; index: number }) => (
    <ChannelCard
      channel={item}
      isPlaying={currentChannel?.id === item.id}
      isFavorite={favorites.includes(item.id)}
      onPress={() => handleChannelPress(item)}
      hasTVPreferredFocus={index === 0 && IS_TV}
    />
  ), [currentChannel, favorites, handleChannelPress]);

  const numColumns = Math.floor((width - SIDEBAR_W - spacing.lg * 2) / 175);

  return (
    <View style={styles.root}>
      {/* Sidebar */}
      <View style={styles.sidebar}>
        {/* Logo */}
        <View style={styles.logo}>
          <View style={styles.logoDot} />
          <Text style={styles.logoText}>FluxTV</Text>
        </View>

        {/* Search (mobile) */}
        {!IS_TV && (
          <View style={styles.searchBox}>
            <Ionicons name="search" size={16} color={colors.text3} />
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar..."
              placeholderTextColor={colors.text3}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
        )}

        {/* Nav */}
        <Text style={styles.sidebarLabel}>MENU</Text>
        {NAV_ITEMS.map(item => (
          <TVFocusable
            key={item.key}
            onPress={() => { setNavKey(item.key); setSelectedGroup(null); }}
            style={[styles.navItem, navKey === item.key && !selectedGroup && styles.navItemActive]}
          >
            <Ionicons
              name={item.icon as any}
              size={18}
              color={navKey === item.key && !selectedGroup ? colors.accent2 : colors.text2}
            />
            <Text style={[styles.navLabel, navKey === item.key && !selectedGroup && styles.navLabelActive]}>
              {item.label}
            </Text>
            {item.key === 'favorites' && (
              <Text style={styles.navCount}>{favorites.length}</Text>
            )}
          </TVFocusable>
        ))}

        {/* Groups */}
        {groups.length > 0 && (
          <>
            <Text style={[styles.sidebarLabel, { marginTop: spacing.lg }]}>CATEGORIAS</Text>
            <FlatList
              data={groups}
              keyExtractor={g => g}
              style={styles.groupList}
              showsVerticalScrollIndicator={false}
              renderItem={({ item: group }) => {
                const isActive = selectedGroup === group;
                return (
                  <TVFocusable
                    onPress={() => { setSelectedGroup(group); setNavKey('all'); }}
                    style={[styles.navItem, isActive && styles.navItemActive]}
                  >
                    <Ionicons name="folder" size={16} color={isActive ? colors.accent2 : colors.text3} />
                    <Text
                      style={[styles.navLabel, { fontSize: fontSize.xs }, isActive && styles.navLabelActive]}
                      numberOfLines={1}
                    >
                      {group}
                    </Text>
                  </TVFocusable>
                );
              }}
            />
          </>
        )}

        {/* Add source button */}
        <TVFocusable
          onPress={() => navigation.navigate('Setup')}
          style={styles.addBtn}
        >
          <Ionicons name="add-circle" size={18} color={colors.accent2} />
          <Text style={styles.addBtnText}>Adicionar Fonte</Text>
        </TVFocusable>

        {/* Settings */}
        <TVFocusable
          onPress={() => navigation.navigate('Settings')}
          style={styles.settingsBtn}
        >
          <Ionicons name="settings-outline" size={18} color={colors.text3} />
          <Text style={styles.settingsBtnText}>Configurações</Text>
        </TVFocusable>
      </View>

      {/* Main content */}
      <View style={styles.main}>
        {/* Topbar */}
        <View style={styles.topbar}>
          <View>
            <Text style={styles.pageTitle}>
              {selectedGroup || (navKey === 'all' ? 'Todos os Canais' : navKey === 'favorites' ? 'Favoritos' : 'Recentes')}
            </Text>
            <Text style={styles.pageCount}>{filteredChannels.length} canal{filteredChannels.length !== 1 ? 'is' : ''}</Text>
          </View>

          {IS_TV && (
            <View style={styles.tvSearch}>
              <Ionicons name="search" size={16} color={colors.text3} />
              <TextInput
                style={styles.tvSearchInput}
                placeholder="Buscar canais..."
                placeholderTextColor={colors.text3}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>
          )}

          <View style={styles.topbarRight}>
            <Text style={styles.clock}>{clock}</Text>
            {sources.length === 0 && (
              <TVFocusable onPress={() => navigation.navigate('Setup')} style={styles.setupBadge}>
                <Text style={styles.setupBadgeText}>+ Adicionar Lista</Text>
              </TVFocusable>
            )}
          </View>
        </View>

        {/* Channel grid */}
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.accent2} />
            <Text style={styles.loadingText}>Carregando canais...</Text>
          </View>
        ) : loadError ? (
          <View style={styles.center}>
            <Ionicons name="warning" size={48} color={colors.red} />
            <Text style={styles.errorText}>{loadError}</Text>
            <TVFocusable onPress={() => navigation.navigate('Setup')} style={styles.retryBtn}>
              <Text style={styles.retryBtnText}>Configurar Fonte</Text>
            </TVFocusable>
          </View>
        ) : filteredChannels.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="tv-outline" size={64} color={colors.text3} />
            <Text style={styles.emptyTitle}>Nenhum canal encontrado</Text>
            <Text style={styles.emptySubtitle}>
              {sources.length === 0 ? 'Adicione uma lista M3U ou Xtream API para começar' : 'Tente outro filtro ou busca'}
            </Text>
            {sources.length === 0 && (
              <TVFocusable
                onPress={() => navigation.navigate('Setup')}
                style={styles.addFirstBtn}
                hasTVPreferredFocus
              >
                <Text style={styles.addFirstBtnText}>Adicionar Lista IPTV</Text>
              </TVFocusable>
            )}
          </View>
        ) : (
          <FlatList
            data={filteredChannels}
            keyExtractor={item => item.id}
            numColumns={numColumns}
            renderItem={renderChannel}
            contentContainerStyle={styles.grid}
            showsVerticalScrollIndicator={false}
            initialNumToRender={numColumns * 4}
            maxToRenderPerBatch={numColumns * 2}
            windowSize={5}
            removeClippedSubviews
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', backgroundColor: colors.bg0 },

  // Sidebar
  sidebar: {
    width: SIDEBAR_W,
    backgroundColor: colors.bg1,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    paddingTop: spacing.lg,
    paddingHorizontal: 0,
  },
  logo: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, marginBottom: spacing.xl },
  logoDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.red },
  logoText: { fontSize: fontSize.xl, fontWeight: '800', color: colors.accent2, letterSpacing: -0.5 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.bg2, borderRadius: radius.sm,
    marginHorizontal: 12, marginBottom: spacing.md,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  searchInput: { flex: 1, color: colors.text1, fontSize: fontSize.sm },
  sidebarLabel: {
    fontSize: 10, fontWeight: '600', color: colors.text3,
    letterSpacing: 0.8, paddingHorizontal: 16, marginBottom: 4,
  },
  navItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 16,
    borderLeftWidth: 3, borderLeftColor: 'transparent',
  },
  navItemActive: { backgroundColor: colors.accent + '18', borderLeftColor: colors.accent2 },
  navLabel: { flex: 1, fontSize: fontSize.sm, color: colors.text2 },
  navLabelActive: { color: colors.accent2, fontWeight: '600' },
  navCount: {
    fontSize: 11, color: colors.text3, backgroundColor: colors.bg3,
    borderRadius: 10, paddingHorizontal: 7, paddingVertical: 1,
  },
  groupList: { flex: 1 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    margin: 12, backgroundColor: colors.accent + '22',
    borderRadius: radius.sm, borderWidth: 1, borderColor: colors.accent + '44',
    padding: 10,
  },
  addBtnText: { color: colors.accent2, fontSize: fontSize.sm, fontWeight: '600' },
  settingsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 12, marginBottom: spacing.md,
  },
  settingsBtnText: { color: colors.text3, fontSize: fontSize.sm },

  // Main
  main: { flex: 1 },
  topbar: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border,
    backgroundColor: colors.bg1,
  },
  pageTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text1 },
  pageCount: { fontSize: fontSize.xs, color: colors.text3, marginTop: 2 },
  tvSearch: {
    flex: 1, maxWidth: 320, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.bg2, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  tvSearchInput: { flex: 1, color: colors.text1, fontSize: fontSize.sm },
  topbarRight: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 12 },
  clock: { fontSize: fontSize.md, fontWeight: '600', color: colors.text2 },
  setupBadge: {
    backgroundColor: colors.accent, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 6,
  },
  setupBadgeText: { color: colors.white, fontSize: fontSize.sm, fontWeight: '600' },

  grid: { padding: spacing.md },

  // States
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  loadingText: { color: colors.text2, fontSize: fontSize.md, marginTop: 12 },
  errorText: { color: colors.text2, fontSize: fontSize.sm, textAlign: 'center', maxWidth: 300 },
  retryBtn: { backgroundColor: colors.accent, borderRadius: radius.sm, paddingHorizontal: 20, paddingVertical: 10 },
  retryBtnText: { color: colors.white, fontWeight: '600' },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text1 },
  emptySubtitle: { fontSize: fontSize.sm, color: colors.text3, textAlign: 'center', maxWidth: 320 },
  addFirstBtn: { backgroundColor: colors.accent, borderRadius: radius.md, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8 },
  addFirstBtnText: { color: colors.white, fontSize: fontSize.md, fontWeight: '700' },
});
