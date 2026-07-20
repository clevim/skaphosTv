// pip.ts — Ponte fina para o módulo nativo de Picture-in-Picture (Android).
// No-op em iOS/web e quando o módulo nativo não está presente (ex.: build OTA antiga).
import { NativeModules, Platform } from 'react-native';
import { IS_NATIVE_TV } from './tvDetect';

const SkaphosPip = (NativeModules as any)?.SkaphosPip;

// Android TV: o PiP do sistema quebra o launcher em várias TVs (janela órfã).
// Guarda também no JS para proteger APKs antigos atualizados só via OTA,
// cujo nativo ainda não tem a checagem de UI_MODE_TYPE_TELEVISION.
const pipAllowed = Platform.OS === 'android' && !IS_NATIVE_TV;

/** Liga/desliga a entrada automática em PiP ao sair do app (durante um vídeo). */
export function setPipEnabled(enabled: boolean): void {
  if (!pipAllowed || !SkaphosPip?.setEnabled) return;
  try { SkaphosPip.setEnabled(enabled); } catch (_) {}
}

/** Entra em PiP imediatamente (uso opcional). */
export function enterPip(): void {
  if (!pipAllowed || !SkaphosPip?.enter) return;
  try { SkaphosPip.enter(); } catch (_) {}
}

/** Atualiza o ícone play/pause exibido na janela do PiP do sistema. */
export function setPipPlaying(playing: boolean): void {
  if (Platform.OS !== 'android' || !SkaphosPip?.setPlaying) return;
  try { SkaphosPip.setPlaying(playing); } catch (_) {}
}

/** true se o aparelho suporta PiP. */
export async function isPipSupported(): Promise<boolean> {
  if (!pipAllowed || !SkaphosPip?.isSupported) return false;
  try { return await SkaphosPip.isSupported(); } catch (_) { return false; }
}
