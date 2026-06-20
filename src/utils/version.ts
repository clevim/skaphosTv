/**
 * version.ts — fonte ÚNICA da versão do app.
 * Lê do build nativo (versionName/versionCode); cai pro app.json se preciso.
 */
import Constants from 'expo-constants';

export const APP_VERSION = Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? '1.1.0';
export const BUILD_NUMBER = Constants.nativeBuildVersion ?? '';
export const VERSION_LABEL = BUILD_NUMBER ? `v${APP_VERSION} · build ${BUILD_NUMBER}` : `v${APP_VERSION}`;
