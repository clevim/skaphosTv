/**
 * orientation — helpers de orientação de tela seguros por plataforma.
 *
 * expo-screen-orientation não tem efeito no web (e lançava warning), então
 * todos os helpers são no-op fora do nativo. Na TV o app vive travado em
 * landscape; no smartphone só o player trava.
 */

import * as ScreenOrientation from 'expo-screen-orientation';
import { IS_WEB } from './tvDetect';

/** Trava em landscape (player / TV). No-op no web. */
export function lockLandscape(): void {
  if (IS_WEB) return;
  ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
}

/** Libera a orientação (volta ao portrait/auto no smartphone). No-op no web. */
export function unlockOrientation(): void {
  if (IS_WEB) return;
  ScreenOrientation.unlockAsync().catch(() => {});
}
