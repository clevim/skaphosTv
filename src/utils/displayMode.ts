// displayMode.ts — ponte fina para o AFR nativo (Android TV / Fire TV).
// No-op no celular, no web e em APK antigo atualizado só por OTA (módulo ausente).
import { NativeModules } from 'react-native';
import { IS_NATIVE_TV } from './tvDetect';

const SkaphosDisplay = (NativeModules as any)?.SkaphosDisplay;

// Só em TV física: no celular a tela é do aparelho (trocar modo não faz sentido)
// e no web não existe API.
const afrAllowed = IS_NATIVE_TV && !!SkaphosDisplay;

/**
 * Casa a taxa de atualização da TV com o fps do conteúdo.
 * @returns Hz aplicado, ou 0 se nada mudou (sem suporte, sem modo melhor, já ok).
 */
export async function matchFrameRate(fps: number): Promise<number> {
  if (!afrAllowed || !fps || fps <= 0) return 0;
  try { return await SkaphosDisplay.matchFrameRate(fps); } catch (_) { return 0; }
}

/** Volta ao modo original da TV. Seguro chamar sem ter trocado nada. */
export function restoreDisplayMode(): void {
  if (!afrAllowed) return;
  try { SkaphosDisplay.restore(); } catch (_) {}
}

/** true se a TV oferece mais de uma taxa na resolução atual. */
export async function isAfrSupported(): Promise<boolean> {
  if (!afrAllowed) return false;
  try { return await SkaphosDisplay.isSupported(); } catch (_) { return false; }
}
