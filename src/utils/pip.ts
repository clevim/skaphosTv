// pip.ts — Ponte fina para o módulo nativo de Picture-in-Picture (Android).
// No-op em iOS/web e quando o módulo nativo não está presente (ex.: build OTA antiga).
import { NativeModules, Platform } from 'react-native';

const SkaphosPip = (NativeModules as any)?.SkaphosPip;

/** Liga/desliga a entrada automática em PiP ao sair do app (durante um vídeo). */
export function setPipEnabled(enabled: boolean): void {
  if (Platform.OS !== 'android' || !SkaphosPip?.setEnabled) return;
  try { SkaphosPip.setEnabled(enabled); } catch (_) {}
}

/** Entra em PiP imediatamente (uso opcional). */
export function enterPip(): void {
  if (Platform.OS !== 'android' || !SkaphosPip?.enter) return;
  try { SkaphosPip.enter(); } catch (_) {}
}

/** true se o aparelho suporta PiP. */
export async function isPipSupported(): Promise<boolean> {
  if (Platform.OS !== 'android' || !SkaphosPip?.isSupported) return false;
  try { return await SkaphosPip.isSupported(); } catch (_) { return false; }
}
