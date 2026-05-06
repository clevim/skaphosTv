import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as KeepAwake from 'expo-keep-awake';
import * as ScreenOrientation from 'expo-screen-orientation';

import HomeScreen from './src/screens/HomeScreen';
import PlayerScreen from './src/screens/PlayerScreen';
import SetupScreen from './src/screens/SetupScreen';
import SearchScreen from './src/screens/SearchScreen';
import FavoritesScreen from './src/screens/FavoritesScreen';
import SettingsScreen from './src/screens/SettingsScreen';

export type RootStackParamList = {
  Home: undefined;
  Player: { channel: Channel };
  Setup: undefined;
  Search: undefined;
  Favorites: undefined;
  Settings: undefined;
};

export interface Channel {
  id: string;
  name: string;
  url: string;
  logo?: string;
  group?: string;
  tvgId?: string;
  quality?: string;
  isFavorite?: boolean;
}

const Stack = createStackNavigator<RootStackParamList>();

export default function App() {
  useEffect(() => {
    KeepAwake.activateKeepAwakeAsync();
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    return () => {
      KeepAwake.deactivateKeepAwake();
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" hidden />
        <NavigationContainer
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
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
