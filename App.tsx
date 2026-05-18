import React, { useEffect, useRef } from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as KeepAwake from 'expo-keep-awake';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Platform, Linking } from 'react-native';
import { useStore } from './src/store/useStore';
import { useGeistFonts } from './src/hooks/useGeistFonts';
import HomeScreen from './src/screens/HomeScreen';
import PlayerScreen from './src/screens/PlayerScreen';
import SetupScreen from './src/screens/SetupScreen';
import SearchScreen from './src/screens/SearchScreen';
import FavoritesScreen from './src/screens/FavoritesScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import SeriesScreen from './src/screens/SeriesScreen';
import DetailScreen from './src/screens/DetailScreen';
import TVEPGScreen from './src/screens/TVEPGScreen';
import { useThemeStore } from './src/store/useThemeStore';
import { IS_TV } from './src/utils/tvDetect';
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
  // Guarda URL recebida antes de nav estar pronta (cold start via deep link)
  const pendingUrl = useRef<string | null>(null);

  useEffect(() => {
    useThemeStore.getState().loadTheme();

    KeepAwake.activateKeepAwakeAsync();

    if (IS_TV) {
      setTimeout(() => activateTvFocus(), 500);
    }

    if (Platform.OS !== 'web') {
      const isTV = Platform.isTV;
      if (isTV) {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
      } else {
        ScreenOrientation.unlockAsync();
      }
    }

    // Deep link — app já aberto
    const sub = Linking.addEventListener('url', ({ url }) => {
      if (navigationRef.isReady()) {
        handleDeepLink(url);
      } else {
        pendingUrl.current = url;
      }
    });

    // Deep link — cold start
    Linking.getInitialURL().then(url => {
      if (url) pendingUrl.current = url;
    });

    return () => {
      KeepAwake.deactivateKeepAwake();
      sub.remove();
    };
  }, []);

  // Hold render until fonts are ready (prevents FOUT)
  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" hidden />
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
              primary: '#7c3aed',
              background: '#0a0a0f',
              card: '#12111a',
              text: '#e8e4f0',
              border: 'rgba(124,58,237,0.25)',
              notification: '#7c3aed',
            },
          }}
        >
          <Stack.Navigator
            screenOptions={{
              headerShown: false,
              animationEnabled: true,
              cardStyle: { backgroundColor: '#0a0a0f' },
            }}
          >
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="Player" component={PlayerScreen} />
            <Stack.Screen name="Setup" component={SetupScreen} />
            <Stack.Screen name="Search" component={SearchScreen} />
            <Stack.Screen name="Favorites" component={FavoritesScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen name="Series" component={SeriesScreen} />
            <Stack.Screen name="Detail" component={DetailScreen} />
            <Stack.Screen name="EPG" component={TVEPGScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
