/**
 * reducedMotion — espelha a preferência "Remover animações" do sistema
 * (Android: Remove animations / TalkBack; web: prefers-reduced-motion).
 *
 * Singleton com um único listener nativo — TVFocusable monta às centenas e
 * cada um assinando AccessibilityInfo seria desperdício.
 */
import { useSyncExternalStore } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

let reduced = false;
const subs = new Set<() => void>();
const notify = () => subs.forEach(f => f());

if (Platform.OS === 'web') {
  const mq = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-reduced-motion: reduce)') : null;
  if (mq) {
    reduced = mq.matches;
    mq.addEventListener?.('change', (e: MediaQueryListEvent) => { reduced = e.matches; notify(); });
  }
} else {
  AccessibilityInfo.isReduceMotionEnabled?.().then(v => {
    if (v !== reduced) { reduced = v; notify(); }
  }).catch(() => {});
  AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v: boolean) => { reduced = v; notify(); });
}

/** Leitura pontual (fora de componentes). */
export const isReducedMotion = () => reduced;

/** Hook reativo — re-renderiza quando o usuário muda a preferência. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    cb => { subs.add(cb); return () => subs.delete(cb); },
    () => reduced,
    () => reduced,
  );
}
