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

export function addFocusListener(
  callback: (event: TvFocusEvent) => void
): Subscription | null {
  if (!emitter) return null;
  return emitter.addListener('onTvFocusChanged', callback);
}
