/**
 * version.ts — fonte ÚNICA da versão do app (em runtime).
 * Lê do arquivo GERADO no build (scripts/sync-version.js), que é escrito a partir
 * do app.json junto com build.gradle/strings.xml. Assim a versão exibida bate
 * SEMPRE com o APK, sem depender de Constants (instável no fluxo bare).
 */
import { APP_VERSION as GEN_VERSION, BUILD_NUMBER as GEN_BUILD } from '../generated/appVersion';

export const APP_VERSION = GEN_VERSION;
export const BUILD_NUMBER = String(GEN_BUILD);
export const VERSION_LABEL = `v${APP_VERSION} · build ${BUILD_NUMBER}`;
