import './src/utils/webHttp'; // web-only: proxy CORS + Alert polyfill (no-op em nativo)
import './src/utils/webWheel'; // web-only: roda do mouse rola listas horizontais (no-op em nativo)
import React, { useEffect, useRef, useState } from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as KeepAwake from 'expo-keep-awake';
import * as Updates from 'expo-updates';
import { Linking, AppState } from 'react-native';
import { useStore } from './src/store/useStore';
import { useWatchProgress } from './src/store/watchProgress';
import { useUsageStats } from './src/store/usageStats';
import { initNotifications } from './src/utils/notifications';
import { useRecentSearches } from './src/store/recentSearches';
import { useGeistFonts } from './src/hooks/useGeistFonts';
import HomeScreen from './src/screens/HomeScreen';
import PlayerScreen from './src/screens/PlayerScreen';
import SetupScreen from './src/screens/SetupScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import SeriesScreen from './src/screens/SeriesScreen';
import DetailScreen from './src/screens/DetailScreen';
import TVEPGScreen from './src/screens/TVEPGScreen';
import { useThemeStore } from './src/store/useThemeStore';
import AnimatedSplash from './src/components/AnimatedSplash';
import MiniPlayer from './src/components/MiniPlayer';
import AppAlertHost from './src/components/AppAlert';
import DebugOverlay from './src/components/DebugOverlay';
import { IS_TV, IS_WEB, IS_NATIVE_TV } from './src/utils/tvDetect';
import { lockLandscape, unlockOrientation } from './src/utils/orientation';
import { colors } from './src/utils/theme';
import { activate as activateTvFocus } from './modules/tv-focus';

export type { Channel, RootStackParamList } from './src/types';
import type { RootStackParamList } from './src/types';

const Stack = createStackNavigator<RootStackParamList>();

// Ref global de navegação — permite navegar fora de componentes (ex: deep links)
const navigationRef = createNavigationContainerRef<RootStackParamList>();

/**
 * Abre um deep link no formato:
 *   com.skaphostv.app://open?type=series&id=SERIES_ID&name=SERIES_NAME
 * Procura o canal na store pelo tvgId e navega para a tela correta.
 * Se o canal não for encontrado, não faz nada (lista diferente ou ID inválido).
 */
function handleDeepLink(url: string | null) {
  if (!url || !navigationRef.isReady()) return;
  try {
    const query = url.split('?')[1];
    if (!query) return;
    const params: Record<string, string> = {};
    for (const pair of query.split('&')) {
      const eq = pair.indexOf('=');
      if (eq === -1) continue;
      params[decodeURIComponent(pair.slice(0, eq))] = decodeURIComponent(pair.slice(eq + 1));
    }
    const { type, id, name } = params;
    if (!type || !id) return;

    const { channels } = useStore.getState();

    if (type === 'series') {
      const channel = channels.find(c => c.tvgId === id && c.streamType === 'series');
      if (channel) {
        navigationRef.navigate('Series', {
          seriesName: name || channel.name,
          channels: [channel],
        });
      }
    }

    if (type === 'movie') {
      const channel = channels.find(c => c.tvgId === id || c.id === id);
      if (channel) {
        navigationRef.navigate('Detail', { channel });
      }
    }
  } catch (_) {}
}

export default function App() {
  const { fontsLoaded } = useGeistFonts();
  // Splash animada de entrada (cobre o boot; some quando as fontes carregam)
  const [splashVisible, setSplashVisible] = useState(true);
  // Guarda URL recebida antes de nav estar pronta (cold start via deep link)
  const pendingUrl = useRef<string | null>(null);

  useEffect(() => {
    useThemeStore.getState().loadTheme();
    useWatchProgress.getState().load();
    useRecentSearches.getState().load();
    useUsageStats.getState().load();
    initNotifications();

    KeepAwake.activateKeepAwakeAsync();

    // OTA auto-update (só roda em builds de produção, não no dev)
    if (!__DEV__) {
      Updates.checkForUpdateAsync()
        .then(({ isAvailable }) => {
          if (isAvailable) {
            Updates.fetchUpdateAsync().then(() => Updates.reloadAsync()).catch(() => {});
          }
        })
        .catch(() => {});
    }

    if (IS_TV) {
      setTimeout(() => activateTvFocus(), 500);
    }

    // TV física vive em landscape; smartphone fica livre (o player trava sozinho)
    if (IS_NATIVE_TV) lockLandscape();
    else unlockOrientation();

    // Deep link — app já aberto
    const sub = Linking.addEventListener('url', ({ url }) => {
      if (navigationRef.isReady()) {
        handleDeepLink(url);
      } else {
        pendingUrl.current = url;
      }
    });

    // Deep link — cold start. Se a nav já estiver pronta quando isto resolver,
    // processa de imediato (senão onReady consome o pendingUrl).
    Linking.getInitialURL().then(url => {
      if (!url) return;
      if (navigationRef.isReady()) handleDeepLink(url);
      else pendingUrl.current = url;
    });

    // Ao mandar o app pra background, força o flush dos saves de canais pendentes
    // (o save é debounced) — evita que o cache fique parcial se o processo morrer.
    const appStateSub = AppState.addEventListener('change', (next) => {
      if (next === 'background' || next === 'inactive') {
        useStore.getState().saveChannelsToStorage().catch(() => {});
      }
    });

    // Web: o AppState do navegador não dispara de forma confiável ao FECHAR a aba,
    // então o save debounced podia se perder (cache zerava → cards sumiam no reload).
    // visibilitychange (aba oculta) roda com a página ainda viva → grava em tempo;
    // pagehide cobre o fechamento. Ambos persistem o cache completo em memória.
    const flushChannels = () => { useStore.getState().saveChannelsToStorage().catch(() => {}); };
    if (IS_WEB && typeof document !== 'undefined') {
      const onVisibility = () => { if (document.visibilityState === 'hidden') flushChannels(); };
      document.addEventListener('visibilitychange', onVisibility);
      window.addEventListener('pagehide', flushChannels);
      return () => {
        KeepAwake.deactivateKeepAwake();
        sub.remove();
        appStateSub.remove();
        document.removeEventListener('visibilitychange', onVisibility);
        window.removeEventListener('pagehide', flushChannels);
      };
    }

    return () => {
      KeepAwake.deactivateKeepAwake();
      sub.remove();
      appStateSub.remove();
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" hidden />
        {/* Navegação monta sempre (a splash cobre o boot/FOUT; nunca fica em branco) */}
        <NavigationContainer
          ref={navigationRef}
          onReady={() => {
            // Processa deep link pendente (cold start)
            if (pendingUrl.current) {
              handleDeepLink(pendingUrl.current);
              pendingUrl.current = null;
            }
          }}
          theme={{
            dark: true,
            colors: {
              primary: colors.accent3,
              background: colors.bg0,
              card: colors.bg1,
              text: colors.text1,
              border: colors.borderSoft,
              notification: colors.accent3,
            },
          }}
        >
          <Stack.Navigator
            screenOptions={{
              headerShown: false,
              animationEnabled: true,
              cardStyle: { backgroundColor: colors.bg0 },
              // headerMode:'float' (não usamos header nativo — headerShown:false já
              // esconde) é o que faz o @react-navigation/stack manter
              // pageOverflowEnabled=false no web. Sem isso, o CardSheet interno usa
              // minHeight:'100%' (pensado pra deixar o <body> rolar em navegador
              // mobile) em vez de flex:1+overflow:hidden — quebra TODO o scroll
              // interno da tela: a área do FlatList vira do tamanho do conteúdo
              // inteiro (ex.: 540.000px numa lista de 15k itens) em vez do viewport,
              // e o próprio FlatList passa a achar que quase tudo está "visível",
              // renderizando milhares de cards de uma vez — daí telas travando ao
              // entrar em Filmes/Séries com catálogos grandes.
              headerMode: 'float',
            }}
          >
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="Player" component={PlayerScreen} />
            <Stack.Screen name="Setup" component={SetupScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen name="Series" component={SeriesScreen} />
            <Stack.Screen name="Detail" component={DetailScreen} />
            <Stack.Screen name="EPG" component={TVEPGScreen} />
          </Stack.Navigator>
        </NavigationContainer>

        {/* Mini-player flutuante (PiP dentro do app) — acima do navegador para
            continuar tocando enquanto o usuário navega. Expandir volta ao Player. */}
        <MiniPlayer
          onExpand={(channel) => {
            if (navigationRef.isReady()) navigationRef.navigate('Player', { channel });
          }}
        />

        {/* Substitui o Alert.alert nativo (cinza, fora do tema) em todo o app */}
        <AppAlertHost />

        {/* Log em tela pro APK de dev — não existe no build normal */}
        <DebugOverlay />

        {splashVisible && (
          <AnimatedSplash ready={fontsLoaded} onFinish={() => setSplashVisible(false)} />
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
