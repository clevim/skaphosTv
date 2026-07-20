import { requireNativeModule, EventEmitter, Subscription } from 'expo-modules-core';
import { Platform } from 'react-native';

interface TvFocusEvent {
  oldViewTag: number;
  newViewTag: number;
}

const IS_ANDROID = Platform.OS === 'android';

// Only load on Android — iOS/web don't need this
const TvFocusNative = IS_ANDROID
  ? requireNativeModule('TvFocus')
  : null;

const emitter = TvFocusNative
  ? new EventEmitter(TvFocusNative)
  : null;

export function activate(): void {
  TvFocusNative?.activate();
}

/**
 * Garante o observer de foco na janela nativa onde `viewTag` vive.
 * Modais RN abrem um Dialog (janela própria) — sem isto, o foco lá dentro
 * nunca chega ao JS. `?.` no método: APK antigo via OTA não tem watchView.
 */
export function watchView(viewTag: number): void {
  try { TvFocusNative?.watchView?.(viewTag); } catch (_) {}
}

export function addFocusListener(
  callback: (event: TvFocusEvent) => void
): Subscription | null {
  if (!emitter) return null;
  return emitter.addListener('onTvFocusChanged', callback);
}
