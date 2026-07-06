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
import { Platform } from 'react-native';
import { APP_VERSION } from './version';
import { useStore } from '../store/useStore';
import { IS_DEV_BUILD } from './debugLog';

const GH_REPO = 'clevim/skaphosTv';
const RELEASES_API = `https://api.github.com/repos/${GH_REPO}/releases/latest`;

// Dev: aponta "Verificar/Forçar atualização" pra um servidor local em vez do
// GitHub — ver scripts/dev-update-server.js (serve storage/apks/ na LAN).
// EXPO_PUBLIC_DEV_UPDATE_URL (build-time) só liga o modo dev e serve de valor
// inicial; o IP de fato é editável em Ajustes (settings.devUpdateUrl) pra não
// precisar rebuildar toda vez que o IP do PC mudar de rede.
// Trava em IS_DEV_BUILD (flag de build): sem isso, testar um build de dev e
// depois instalar um release POR CIMA (mesmo pacote/assinatura) herdaria o IP
// salvo em Ajustes via AsyncStorage, e o release passaria a checar update no
// PC do dev em vez do GitHub.
function getDevUpdateUrl(): string | null {
  if (!IS_DEV_BUILD) return null;
  return useStore.getState().settings.devUpdateUrl || process.env.EXPO_PUBLIC_DEV_UPDATE_URL || null;
}

// Versão NATIVA instalada — base correta p/ comparar com o GitHub
export const CURRENT_VERSION = APP_VERSION;

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

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

/** Verifica e BAIXA atualização OTA (não reinicia). 'ready' = pronta p/ aplicar.
 *  Chamadas do expo-updates não têm timeout próprio — sem rede real (ex.: testando
 *  o dev build isolado numa LAN sem internet) elas podiam ficar penduradas para
 *  sempre, travando "Verificar atualização" antes mesmo de chegar no passo 2
 *  (checar o servidor de dev/GitHub). */
export async function checkOtaUpdate(): Promise<OtaResult> {
  if (__DEV__ || !Updates.isEnabled) return 'unavailable';
  try {
    const r = await withTimeout(Updates.checkForUpdateAsync(), 8_000);
    if (!r.isAvailable) return 'none';
    await withTimeout(Updates.fetchUpdateAsync(), 30_000);
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
  const devUrl = getDevUpdateUrl();
  if (devUrl) return fetchLatestFromDevServer(devUrl);
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

/** Mesmo contrato do GitHub, servido por scripts/dev-update-server.js. */
async function fetchLatestFromDevServer(devUrl: string): Promise<GithubRelease | null> {
  // fetch() sem timeout pode ficar pendurado por minutos se o servidor local não
  // estiver acessível (IP errado, servidor caído, rede diferente) — diferente do
  // resto do app, que sempre usa axios com timeout. AbortController cobre o fetch cru.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8_000);
  try {
    const res = await fetch(`${devUrl}/latest.json`, { signal: ctrl.signal });
    if (!res.ok) return null;
    const data: any = await res.json();
    if (!data?.version || !data?.apkUrl) return null;
    return { version: data.version, notes: '', apkUrl: data.apkUrl, pageUrl: devUrl };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
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
