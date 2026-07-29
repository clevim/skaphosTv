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
import { showAlert } from '../components/AppAlert';

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

// ── Convite ao abrir o app ────────────────────────────────────────
// Atualização NATIVA não sai por OTA: exige baixar o APK novo. Até aqui isso
// dependia do usuário lembrar de entrar em Ajustes → "Verificar atualização",
// então na prática quase ninguém atualizava. Este convite avisa sozinho ao
// abrir, uma vez por versão.
//
// Usa o showAlert padrão do app de propósito: é o mesmo diálogo que Ajustes já
// mostra para esta decisão, com a paleta e o foco de D-pad do tema. Nada de
// tela nova para manter em paralelo.

/** Primeiras linhas úteis das notas — o corpo inteiro do release não cabe no diálogo. */
function summarizeNotes(notes: string, maxChars = 260): string {
  const body = notes
    .split('\n')
    .map(l => l.trim())
    // Fora: título ("SkaphosTV v1.6.2"), cabeçalhos de seção e linhas vazias.
    .filter(l => l && !l.startsWith('#') && !/^SkaphosTV v/i.test(l))
    .join('\n');
  if (!body) return '';
  return body.length > maxChars ? `${body.slice(0, maxChars).trimEnd()}…` : body;
}

/**
 * Checa o GitHub e, havendo versão nova com APK, oferece instalar na hora.
 * Silenciosa em qualquer outro caso (sem rede, sem versão nova, já dispensada).
 */
export async function promptApkUpdateOnLaunch(): Promise<void> {
  // Instalador de APK só existe no Android; no web/iOS não há o que oferecer.
  if (Platform.OS !== 'android' || __DEV__) return;

  const rel = await fetchLatestRelease();
  if (!rel?.apkUrl || !isNewerVersion(rel.version, CURRENT_VERSION)) return;

  const { settings, updateSettings } = useStore.getState();
  if (settings.updateDismissedVersion === rel.version) return;

  const summary = summarizeNotes(rel.notes);
  showAlert(
    'Atualização disponível',
    `A versão ${rel.version} está pronta para instalar.` +
      `\n\nVocê está na ${CURRENT_VERSION}.` +
      (summary ? `\n\n${summary}` : ''),
    [
      {
        text: 'Agora não',
        style: 'cancel',
        // Não insiste nesta versão — mas volta a avisar na próxima.
        onPress: () => updateSettings({ updateDismissedVersion: rel.version }),
      },
      { text: 'Atualizar', onPress: () => runApkUpdate(rel) },
    ],
  );
}

/** Baixa com progresso e abre o instalador, reusando o mesmo diálogo. */
async function runApkUpdate(rel: GithubRelease): Promise<void> {
  // showAlert reescreve o estado do diálogo já aberto, então dá pra usá-lo como
  // barra de progresso sem criar componente novo. "Ocultar" só fecha a caixa —
  // o download segue e o instalador abre sozinho ao terminar.
  const progress = (msg: string) =>
    showAlert(`Baixando a v${rel.version}`, msg, [{ text: 'Ocultar', style: 'cancel' }]);

  progress('Iniciando…');
  try {
    await downloadAndInstallApk(rel.apkUrl!, p => progress(`${Math.round(p * 100)}%`));
    showAlert('Instalador aberto', 'Confirme a instalação para concluir a atualização.');
  } catch {
    showAlert('Falha na atualização', 'Não foi possível baixar o APK. Tente de novo em Ajustes → Verificar atualização.');
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
