/**
 * appUpdate.ts — atualização do app.
 *
 *  1) OTA (expo-updates): baixa só o bundle JS novo e reinicia — SEM APK.
 *     Cobre mudanças de JS/React dentro do mesmo runtimeVersion.
 *  2) GitHub Releases: quando a atualização é NATIVA (libs/manifesto), o Android
 *     exige um APK novo — baixa o asset .apk do release e abre o instalador.
 */
import * as Updates from 'expo-updates';
import * as FileSystem from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const GH_REPO = 'clevim/skaphosTv';
const RELEASES_API = `https://api.github.com/repos/${GH_REPO}/releases/latest`;

export const CURRENT_VERSION = Constants.expoConfig?.version ?? '0.0.0';

/** semver simples "1.2.3" → true se a > b. */
export function isNewerVersion(a: string, b: string): boolean {
  const pa = a.split('.').map(n => parseInt(n, 10) || 0);
  const pb = b.split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return true;
    if ((pa[i] || 0) < (pb[i] || 0)) return false;
  }
  return false;
}

// ── OTA (expo-updates) ────────────────────────────────────────────
export type OtaResult = 'ready' | 'none' | 'unavailable' | 'error';

/** Verifica e BAIXA atualização OTA (não reinicia). 'ready' = pronta p/ aplicar. */
export async function checkOtaUpdate(): Promise<OtaResult> {
  if (__DEV__ || !Updates.isEnabled) return 'unavailable';
  try {
    const r = await Updates.checkForUpdateAsync();
    if (!r.isAvailable) return 'none';
    await Updates.fetchUpdateAsync();
    return 'ready';
  } catch {
    return 'error';
  }
}

export const reloadApp = () => Updates.reloadAsync();

// ── GitHub release (APK) ──────────────────────────────────────────
export interface GithubRelease {
  version: string;        // sem o "v"
  notes: string;
  apkUrl: string | null;  // asset .apk
  pageUrl: string;
}

export async function fetchLatestRelease(): Promise<GithubRelease | null> {
  try {
    const res = await fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) return null;
    const data: any = await res.json();
    const apk = (data.assets ?? []).find((a: any) => typeof a.name === 'string' && a.name.endsWith('.apk'));
    return {
      version: String(data.tag_name ?? '').replace(/^v/i, ''),
      notes: data.body ?? '',
      apkUrl: apk?.browser_download_url ?? null,
      pageUrl: data.html_url ?? `https://github.com/${GH_REPO}/releases`,
    };
  } catch {
    return null;
  }
}

/** Baixa o APK e abre o instalador do Android. */
export async function downloadAndInstallApk(
  apkUrl: string,
  onProgress?: (pct: number) => void,
): Promise<void> {
  if (Platform.OS !== 'android') throw new Error('Instalação de APK disponível apenas no Android');
  const dest = `${FileSystem.cacheDirectory}skaphostv-update.apk`;
  try { await FileSystem.deleteAsync(dest, { idempotent: true }); } catch { /* noop */ }

  const dl = FileSystem.createDownloadResumable(apkUrl, dest, {}, (p) => {
    if (p.totalBytesExpectedToWrite > 0) {
      onProgress?.(p.totalBytesWritten / p.totalBytesExpectedToWrite);
    }
  });
  const result = await dl.downloadAsync();
  if (!result?.uri) throw new Error('Falha ao baixar o APK');

  const contentUri = await FileSystem.getContentUriAsync(result.uri);
  // ACTION_VIEW + MIME de pacote + permissão de leitura da content URI → abre o instalador
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    type: 'application/vnd.android.package-archive',
    flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
  });
}
