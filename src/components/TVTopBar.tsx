// TVTopBar.tsx — TV horizontal top nav with proper D-pad focus
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import TVFocusable, { TVFocusableHandle } from './TVFocusable';
import { colors, spacing, radius, fontFamily } from '../utils/theme';
import { LAUNCH_YEAR } from '../utils/channelUtils';
import { useStore } from '../store/useStore';
import { useIsFocused } from '@react-navigation/native';
import { useAccentColors } from '../hooks/useAccentColors';
import { LinearGradient } from 'expo-linear-gradient';

const TV_NAV_STATIC_BEFORE = [
  { key: 'home',      label: 'Início'    },
  { key: 'favorites', label: 'Favoritos' },
  { key: 'live',      label: 'Ao vivo'   },
  { key: 'epg',       label: 'Guia'      },
  { key: 'movies',    label: 'Filmes'    },
  { key: 'series',    label: 'Séries'    },
];

const TV_NAV_STATIC_AFTER = [
  { key: 'year',   label: String(LAUNCH_YEAR) },
  { key: 'search', label: 'Buscar'            },
];

interface Props {
  active: string;
  onNavPress: (key: string) => void;
  onSettingsPress?: () => void;
  jellyfinSources?: Array<{ id: string; serverName?: string; name: string }>;
}

function NavItem({
  item,
  active,
  onPress,
  itemRef,
  onBarFocus,
  onBarBlur,
}: {
  item: { key: string; label: string };
  active: boolean;
  onPress: () => void;
  itemRef?: React.Ref<TVFocusableHandle>;
  onBarFocus: (isActive: boolean) => void;
  onBarBlur: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const { accent } = useAccentColors();
  return (
    <TVFocusable
      ref={itemRef}
      onPress={onPress}
      onFocus={() => { setFocused(true); onBarFocus(active); }}
      onBlur={() => { setFocused(false); onBarBlur(); }}
      style={styles.navItem}
      // Foco neutro (anel + clareado padrão do TVFocusable): o acento fica só no traço da aba ativa.
      focusScale={1}            // sem zoom no menu inline (evita invadir vizinhos)
      borderRadius={radius.full}
    >
      <Text numberOfLines={1} style={[
        styles.navLabel,
        active && styles.navLabelActive,
        focused && styles.navLabelFocused,
      ]}>
        {item.label}
      </Text>
      {active && (
        <View style={styles.activeDotWrap}>
          <View style={[styles.activeDot, { backgroundColor: accent }]} />
        </View>
      )}
    </TVFocusable>
  );
}

export default function TVTopBar({ active, onNavPress, onSettingsPress, jellyfinSources }: Props) {
  const { accent: logoAccent } = useAccentColors();
  // Relógio local: antes vivia no HomeScreen e cada mudança de minuto
  // re-renderizava a tela inteira (hero + ~120 focusables) só pra este <Text>.
  const [clock, setClock] = useState('');
  // Para de bater enquanto a tela está atrás de outra (player, ajustes, série):
  // ninguém vê este relógio ali, e cada batida re-renderizava a barra inteira —
  // ~10 focáveis — a cada 30s por cima de quem está decodificando vídeo.
  const isFocused = useIsFocused();
  useEffect(() => {
    if (!isFocused) return;
    const tick = () =>
      setClock(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    tick();
    const interval = setInterval(tick, 30000);
    return () => clearInterval(interval);
  }, [isFocused]);

  // Memória de foco da barra: ↑ vindo do conteúdo cai no item mais próximo (geralmente
  // "Início"). Se o foco ENTRA na barra (sem blur recente de outro item da barra) e não
  // é a aba atual, redireciona pra aba atual. Setas ←/→ dentro da barra não são afetadas.
  const activeRef = useRef<TVFocusableHandle>(null);
  const lastBlur = useRef(0);
  const onBarBlur = () => { lastBlur.current = Date.now(); };
  const onBarFocus = (isActive: boolean) => {
    const entering = Date.now() - lastBlur.current > 200;
    lastBlur.current = Date.now();
    if (entering && !isActive) activeRef.current?.focus();
  };

  const showClock = useStore(s => s.settings.showClock);
  const showEpg   = useStore(s => s.settings.showEpg);
  const navItems = [
    ...TV_NAV_STATIC_BEFORE.filter(i => i.key !== 'epg' || showEpg),
    ...(jellyfinSources ?? []).map(s => ({ key: `jf-${s.id}`, label: s.serverName || s.name })),
    ...TV_NAV_STATIC_AFTER,
  ];

  return (
    <View style={styles.container}>
      {/* Scrim em degradê em vez de faixa opaca: o hero da Home sobe por trás da
          barra e o conteúdo rolado some suave, sem a "tampa" com fio embaixo. */}
      <LinearGradient
        pointerEvents="none"
        // Opaco até a linha dos itens: o que rola por baixo não "fantasma" atrás do texto.
        colors={['rgba(10,8,16,1)', 'rgba(10,8,16,0.97)', 'rgba(10,8,16,0)']}
        locations={[0, 0.6, 1]}
        style={styles.scrim}
      />
      {/* Wordmark */}
      <View style={styles.wordmark}>
        <View style={styles.logoIcon}>
          {/* Logo oficial com zoom-crop — a arte tem ~15% de margem interna */}
          <Image source={require('../../assets/icon.png')} style={styles.logoImg} resizeMode="cover" />
        </View>
        <Text style={styles.logoText}>
          Skaphos<Text style={[styles.logoDot, { color: logoAccent }]}>·</Text>TV
        </Text>
      </View>

      {/* Nav items */}
      <View style={styles.navItems}>
        {navItems.map(item => (
          <NavItem
            key={item.key}
            item={item}
            active={item.key === active}
            itemRef={item.key === active ? activeRef : undefined}
            onBarFocus={onBarFocus}
            onBarBlur={onBarBlur}
            onPress={() => onNavPress(item.key)}
          />
        ))}
      </View>

      {/* Right: clock + settings */}
      <View style={styles.rightSection}>
        {showClock && (
          <>
            <Text style={styles.clock}>{clock}</Text>
          </>
        )}
        <TVFocusable accessibilityLabel="Ajustes"
          onPress={onSettingsPress || (() => {})}
          onFocus={() => { lastBlur.current = Date.now(); }}
          onBlur={onBarBlur}
          style={styles.settingsBtn}
          borderRadius={radius.full}
        >
          <Ionicons name="settings-outline" size={18} color={colors.text2} />
        </TVFocusable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,   // 48 → 32
    paddingVertical: 14,              // 20 → 14
    gap: 20,                          // 36 → 20
    paddingBottom: 26, // o degradê precisa de cauda abaixo dos itens pra dissolver
  },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },

  // Wordmark
  wordmark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.25)',
    backgroundColor: colors.bg0,
  },
  logoImg: { width: 40, height: 40, marginTop: -7, marginLeft: -7 },
  logoText: {
    fontSize: 15,
    fontFamily: fontFamily.semiBold,
    color: colors.text1,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  logoDot: { color: colors.accent },

  // Nav items
  navItems: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 2,
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    flexShrink: 0,   // rótulo nunca quebra ("Favorito/s")
    borderRadius: radius.full,
  },
  navLabel: {
    fontSize: 14,
    fontFamily: fontFamily.medium,
    color: colors.text2,
    letterSpacing: -0.1,
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3,
  },
  navLabelActive: {
    fontFamily: fontFamily.semiBold,
    color: colors.text1,
  },
  navLabelFocused: {
    // Texto branco no item focado — contraste forte sobre a pílula
    color: colors.text1,
    fontFamily: fontFamily.semiBold,
  },
  activeDotWrap: {
    // Absoluto: não entra no fluxo — todos os itens ficam da mesma altura.
    // left:0/right:0 + alignItems:'center' garantem centralização pixel-perfect.
    position: 'absolute',
    bottom: 2,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  // Sublinha curta em vez de bolinha — marcador clássico de aba ativa
  activeDot: {
    width: 14,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.accent,
  },

  // Right
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  clock: {
    fontSize: 13,
    color: colors.text2,
    fontFamily: fontFamily.medium,
  },
  settingsBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg1,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
