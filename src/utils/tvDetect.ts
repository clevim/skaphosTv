/**
 * tvDetect — detecção robusta de Android TV / FireTV.
 *
 * Platform.isTV em React Native chama UiModeManager.getCurrentModeType()
 * no Android. Em alguns builds Expo isso pode retornar false incorretamente.
 *
 * Fallback: lê Platform.constants.uiMode diretamente e compara com
 * UI_MODE_TYPE_TELEVISION (0x04), a mesma constante que o Android usa
 * internamente para definir isTV.
 *
 * FireTV Stick / Fire TV Cube → uiMode & 0x0F === 4
 */

import { Platform } from 'react-native';

const _uiModeRaw   = (Platform.constants as any)?.uiMode ?? 0;
// uiMode pode ser number (ex: 0x14) ou a string "tv" dependendo da build Expo/FireTV
const _uiModeType  = typeof _uiModeRaw === 'number' ? (_uiModeRaw & 0x0f) : 0;
const _isAndroidTV = _uiModeType === 4 || _uiModeRaw === 'tv'; // UI_MODE_TYPE_TELEVISION

// No navegador usamos o layout de TV (TVTopBar + navegação por foco): o webapp
// serve pra prever a experiência do FireStick, e o teclado já age como D-pad.
// O módulo nativo de foco (tv-focus) é no-op no web, então isto é seguro.
export const IS_WEB = Platform.OS === 'web';

/** TV física (Android TV / FireTV) — exclui o web, que só emula o layout de TV. */
export const IS_NATIVE_TV = Platform.isTV || _isAndroidTV;

/** Layout de TV (top bar + D-pad): TVs físicas e web. */
export const IS_TV = IS_NATIVE_TV || IS_WEB;

/** Layout de smartphone (bottom tab bar, toque): tudo que não usa layout de TV. */
export const IS_MOBILE = !IS_TV;

/** Para mostrar no overlay de debug */
export const TV_DEBUG = {
  platformIsTV:  Platform.isTV,
  platformOS:    Platform.OS,
  platformVer:   Platform.Version,
  uiModeRaw:     _uiModeRaw,
  uiModeType:    _uiModeType,
  isAndroidTV:   _isAndroidTV,
  finalIsTV:     IS_TV,
};
