/**
 * backup.ts — exporta/importa a configuração completa (fontes + favoritos +
 * ajustes) como JSON, pra migrar de aparelho sem redigitar tudo.
 *
 * Exportar tem 3 caminhos conforme a plataforma: web baixa o .json direto
 * (Blob + <a download>, API nativa do browser); Android compartilha via
 * intent do sistema (mesmo mecanismo do instalador de APK); e em qualquer
 * plataforma dá pra copiar o JSON pro clipboard como alternativa garantida
 * (útil quando não há app instalado que aceite o SEND intent). Importar
 * aceita colar o JSON manualmente ou colar do clipboard direto.
 *
 * Inclui credenciais em texto puro no JSON — é um backup pessoal, avisa o
 * usuário na hora de compartilhar.
 */
import * as FileSystem from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Clipboard from 'expo-clipboard';
import { Platform, Share } from 'react-native';
import { useStore, IPTVSource } from '../store/useStore';
import { saveSourceSecrets } from './secrets';
import { loadSourceChannels } from './sourceLoader';

const VERSION = 1;

export function buildBackupJson(): string {
  const { sources, favorites, settings } = useStore.getState();
  return JSON.stringify({ version: VERSION, exportedAt: Date.now(), sources, favorites, settings }, null, 2);
}

function backupFileName(): string {
  return `skaphostv-backup-${new Date().toISOString().slice(0, 10)}.json`;
}

/** Baixa o backup como arquivo .json (só web — API nativa do browser). */
export function downloadBackupWeb(): void {
  const json = buildBackupJson();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = backupFileName();
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Compartilha o backup como arquivo .json via intent do sistema (Android). */
export async function shareBackup(): Promise<void> {
  const json = buildBackupJson();
  if (Platform.OS !== 'android') {
    await Share.share({ message: json });
    return;
  }
  const dest = `${FileSystem.cacheDirectory}${backupFileName()}`;
  await FileSystem.writeAsStringAsync(dest, json);
  const contentUri = await FileSystem.getContentUriAsync(dest);
  await IntentLauncher.startActivityAsync('android.intent.action.SEND', {
    data: contentUri,
    type: 'application/json',
    flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
    extra: { 'android.intent.extra.STREAM': contentUri },
  });
}

/** Abre o seletor de arquivos do navegador e devolve o texto do .json (só web). */
export function pickBackupFileWeb(): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return reject(new Error('Nenhum arquivo selecionado'));
      file.text().then(resolve, reject);
    };
    input.click();
  });
}

/** Copia o backup pro clipboard — alternativa garantida ao intent/download. */
export async function copyBackupToClipboard(): Promise<void> {
  await Clipboard.setStringAsync(buildBackupJson());
}

/** Lê o clipboard pra preencher o campo de import sem digitar/colar manual. */
export async function pasteFromClipboard(): Promise<string> {
  return Clipboard.getStringAsync();
}

/** Restaura fontes/favoritos/ajustes de um JSON exportado, e recarrega os
 *  canais de cada fonte importada em background (mesmo padrão do reload manual). */
export async function importBackup(json: string): Promise<{ sourcesCount: number }> {
  let data: any;
  try { data = JSON.parse(json); } catch { throw new Error('JSON inválido'); }
  if (!data || !Array.isArray(data.sources)) throw new Error('Arquivo de backup inválido');

  const sources = data.sources as IPTVSource[];
  const store = useStore.getState();

  for (const s of sources) {
    await saveSourceSecrets(s.id, { username: s.username, password: s.password, apiKey: s.apiKey });
  }
  useStore.setState({
    sources,
    favorites: Array.isArray(data.favorites) ? data.favorites : store.favorites,
    settings: data.settings ? { ...store.settings, ...data.settings } : store.settings,
  });
  await store.saveToStorage();

  for (const s of sources) {
    loadSourceChannels(s)
      .then(({ channels, groups }) => {
        if (channels.length > 0) useStore.getState().replaceSourceChannels(s.id, channels, groups);
      })
      .catch(() => {});
  }

  return { sourcesCount: sources.length };
}
