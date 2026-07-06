/**
 * debugLog.ts — log em tela para o APK de dev (sem Metro/adb disponível na TV).
 * Fora de build de dev (IS_DEV_BUILD), `dlog` é NO-OP total — nem console.log
 * roda, pra não vazar nenhum traço disso (nem no logcat) num build de release.
 */
import { create } from 'zustand';

export const IS_DEV_BUILD = !!process.env.EXPO_PUBLIC_DEV_UPDATE_URL;

const MAX_LINES = 300;

interface DebugLogState {
  lines: string[];
}

export const useDebugLogStore = create<DebugLogState>(() => ({ lines: [] }));

export function dlog(msg: string): void {
  if (!IS_DEV_BUILD) return;
  console.log(msg);
  const stamp = new Date().toISOString().slice(11, 23);
  useDebugLogStore.setState(state => ({
    lines: [...state.lines, `${stamp} ${msg}`].slice(-MAX_LINES),
  }));
}

export function clearDebugLog(): void {
  useDebugLogStore.setState({ lines: [] });
}
