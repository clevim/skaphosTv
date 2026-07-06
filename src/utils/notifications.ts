/**
 * notifications.ts — notificações locais (sem servidor push, tudo disparado
 * pelo próprio app quando ele detecta a condição: canal fora do ar, catálogo
 * atualizado, fonte vencendo). Uma única inicialização (canal Android +
 * handler) chamada uma vez no boot (App.tsx).
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

let initialized = false;
let permissionGranted = false;

/** Chamar uma vez no boot do app. Pede permissão e cria o canal Android. */
export async function initNotifications(): Promise<void> {
  if (initialized) return;
  initialized = true;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Geral',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status === 'granted') { permissionGranted = true; return; }
    const { status: asked } = await Notifications.requestPermissionsAsync();
    permissionGranted = asked === 'granted';
  } catch {
    permissionGranted = false;
  }
}

/** Notificação local imediata. No-op silencioso sem permissão (nunca insiste/bloqueia o fluxo). */
export async function notify(title: string, body: string): Promise<void> {
  if (!permissionGranted) return;
  try {
    await Notifications.scheduleNotificationAsync({ content: { title, body }, trigger: null });
  } catch {
    /* noop — notificação é conveniência, nunca deve derrubar o fluxo principal */
  }
}
