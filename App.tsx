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
import { useWatchProgress, computeContinueWatching, flushWatchProgress } from './src/store/watchProgress';
import { useUsageStats } from './src/store/usageStats';
import { initNotifications } from './src/utils/notifications';
import { afterInteractions } from './src/utils/afterInteractions';
import { promptApkUpdateOnLaunch } from './src/utils/appUpdate';
import { syncContinueWatchingWidget } from './src/utils/widgetSync';
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
import { setSplashCovering } from './src/utils/bootSplash';
import MiniPlayer from './src/components/MiniPlayer';
import AppAlertHost from './src/components/AppAlert';
import DebugOverlay from './src/components/DebugOverlay';
import { IS_TV, IS_WEB, IS_NATIVE_TV } from './src/utils/tvDetect';

// Easter egg do console (web): quem abre o DevTools merece um aceno do abismo.
if (IS_WEB && typeof console !== 'undefined') {
  console.log(
    '%cSKAPHOS·TV%c  o abismo também retribui o olhar.\n' +
    'Código aberto: https://github.com/clevim/skaphosTv',
    'color:#a78bfa;font-weight:700;font-size:16px;letter-spacing:2px',
    'color:#a1a1aa;font-size:12px',
  );
}
import { lockLandscape, unlockOrientation } from './src/utils/orientation';
import { colors } from './src/utils/theme';
import { activate as activateTvFocus } from './modules/tv-focus';

export type { Channel, RootStackParamList } from './src/types';
import type { RootStackParamList } from './src/types';

// Teto de espera da splash. Se a leitura do cache demorar mais que isso (disco
// lento, catálogo enorme), a splash sai assim mesmo: melhor uma Home carregando
// do que uma animação que parece travada. Acima do mínimo visível da própria
// splash (2,4 s + fade), então em boot normal quem manda continua sendo ela.
const BOOT_GATE_MS = 6000;

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
  const { fontsLoaded, fontError } = useGeistFonts();
  // `Font.useFonts` devolve [loaded, error] e, em caso de erro, `loaded` NUNCA
  // vira true. Como a splash só saía com ele, uma fonte que falhasse ao carregar
  // prendia o app na animação para sempre — e nem o teto abaixo salvava, porque
  // ele só libera o outro lado do `&&`. Sem a Geist o app cai na fonte do
  // sistema, que é incomparavelmente melhor que uma splash eterna.
  const fontsSettled = fontsLoaded || !!fontError;
  // Splash animada de entrada — cobre o boot INTEIRO, não só as fontes.
  //
  // Antes ela saía assim que as fontes carregavam (rápido, vêm no bundle) e o
  // usuário caía numa Home com spinner enquanto o cache de canais ainda era lido
  // do disco. Agora espera também a hidratação da store, que é quando existe
  // conteúdo para desenhar. `BOOT_GATE_MS` é o teto: se algo travar na leitura, a
  // splash sai mesmo assim em vez de virar tela de bloqueio.
  const [splashVisible, setSplashVisible] = useState(true);
  const hydrated = useStore(s => s.hydrated);
  const [gateExpired, setGateExpired] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setGateExpired(true), BOOT_GATE_MS);
    return () => clearTimeout(t);
  }, []);
  // Guarda URL recebida antes de nav estar pronta (cold start via deep link)
  const pendingUrl = useRef<string | null>(null);
  // OTA baixando → o app vai reiniciar sozinho; não oferece o APK por cima.
  const otaPendingRef = useRef(false);

  useEffect(() => {
    useThemeStore.getState().loadTheme();
    useWatchProgress.getState().load();
    useRecentSearches.getState().load();
    useUsageStats.getState().load();
    initNotifications();

    KeepAwake.activateKeepAwakeAsync();

    // OTA auto-update (só roda em builds de produção, não no dev). Cobre mudanças
    // de JS dentro do MESMO runtimeVersion — aplica sozinho, sem perguntar nada.
    if (!__DEV__) {
      Updates.checkForUpdateAsync()
        .then(({ isAvailable }) => {
          if (isAvailable) {
            otaPendingRef.current = true;
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
        flushWatchProgress();
      }
    });

    // Web: o AppState do navegador não dispara de forma confiável ao FECHAR a aba,
    // então o save debounced podia se perder (cache zerava → cards sumiam no reload).
    // visibilitychange (aba oculta) roda com a página ainda viva → grava em tempo;
    // pagehide cobre o fechamento. Ambos persistem o cache completo em memória.
    const flushChannels = () => {
      useStore.getState().saveChannelsToStorage().catch(() => {});
      flushWatchProgress();
    };
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

  // Web: robustez do estado local + botão Voltar do navegador.
  // Convite de atualização NATIVA (APK do GitHub) — o que o OTA não cobre.
  // Só depois da splash sair: o AppAlert é um Modal, que no Android abre janela
  // própria e apareceria POR CIMA da splash, roubando o foco do D-pad antes de o
  // usuário ver o app. Se um OTA estiver baixando, cala a boca — o app vai
  // reiniciar e o diálogo morreria no meio (ou pior, no meio de um download).
  useEffect(() => {
    if (splashVisible || __DEV__) return;
    return afterInteractions(() => {
      if (otaPendingRef.current) return;
      promptApkUpdateOnLaunch().catch(() => {});
    });
  }, [splashVisible]);

  useEffect(() => {
    if (!IS_WEB) return;

    // Armazenamento persistente: sem isto o navegador pode DESCARTAR o
    // localStorage (fontes, favoritos, progresso) sob pressão de disco.
    // Chamada idempotente; se negado, segue como está (best-effort).
    try { (navigator as any).storage?.persist?.(); } catch { /* noop */ }

    // Back do navegador volta UMA TELA em vez de sair do site: cada navegação
    // que aprofunda a pilha empurra uma entrada no history; popstate → goBack.
    // Sem linking/URLs (params carregam objetos Channel) — só history.state.
    let lastDepth = 1;
    const onNavState = () => {
      const depth = navigationRef.getRootState()?.routes?.length ?? 1;
      if (depth > lastDepth) window.history.pushState({ skDepth: depth }, '');
      lastDepth = depth;
    };
    const onPop = () => {
      if (navigationRef.isReady() && navigationRef.canGoBack()) navigationRef.goBack();
    };
    const unsub = navigationRef.addListener('state', onNavState);
    window.addEventListener('popstate', onPop);
    return () => { unsub(); window.removeEventListener('popstate', onPop); };
  }, []);

  // Widget de tela inicial "Continuar assistindo" (Android) — mantém sincronizado
  // com o que muda em recentChannels/watchProgress. Debounce curto: as duas stores
  // podem disparar em sequência (troca de canal + primeiro record() de progresso).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const sync = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const { recentChannels } = useStore.getState();
        const { entries } = useWatchProgress.getState();
        syncContinueWatchingWidget(computeContinueWatching(recentChannels, entries, 3));
      }, 1500);
    };
    sync();
    const unsubStore = useStore.subscribe(sync);
    const unsubProgress = useWatchProgress.subscribe(sync);
    return () => {
      if (timer) clearTimeout(timer);
      unsubStore();
      unsubProgress();
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {/* Mobile mostra a status bar (relógio/bateria); imersivo é só no player, que esconde a dele */}
        <StatusBar style="light" hidden={IS_TV} />
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
              // Fire Stick / Android TV: sem a transição de card. A animação
              // compõe DUAS telas cheias por ~350 ms bem enquanto a de cima
              // monta os primeiros cards — na Stick isso é o engasgo que se vê
              // ao entrar num filme, e ainda atrasa o D-pad até ela terminar
              // (a memória de foco só devolve o foco depois). Celular e web
              // seguem com a transição normal.
              animationEnabled: !IS_NATIVE_TV,
              // A tela de baixo continua MONTADA (é disso que a memória de foco
              // depende), mas para de re-renderizar enquanto está atrás. Sem
              // isto, cada refresh de catálogo em background re-renderiza a Home
              // inteira — 9 seções e milhares de itens — disputando a thread JS
              // com a tela que o usuário está usando. No web não: lá o stack não
              // desanexa telas, então não há o que congelar.
              freezeOnBlur: !IS_WEB,
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
          onExpand={(channel, playlist) => {
            if (navigationRef.isReady()) navigationRef.navigate('Player', { channel, playlist });
          }}
        />

        {/* Substitui o Alert.alert nativo (cinza, fora do tema) em todo o app */}
        <AppAlertHost />

        {/* Log em tela pro APK de dev — não existe no build normal */}
        <DebugOverlay />

        {splashVisible && (
          <AnimatedSplash
            ready={fontsSettled && (hydrated || gateExpired)}
            onFinish={() => { setSplashCovering(false); setSplashVisible(false); }}
          />
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
