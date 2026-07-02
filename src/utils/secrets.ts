/**
 * secrets.ts — armazenamento seguro de credenciais por fonte.
 *
 * Senha Xtream e apiKey Jellyfin NÃO ficam mais em AsyncStorage (texto puro,
 * legível via backup/adb). Vão para o chaveiro do device via expo-secure-store.
 * Na web (sem SecureStore), cai para AsyncStorage — o endurecimento do proxy
 * cobre o vetor de rede nesse cenário.
 */

import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { IS_WEB } from './tvDetect';

const PREFIX = 'skaphostv_secret_';

export interface SourceSecrets {
  username?: string;
  password?: string;
  apiKey?: string;
}

// SecureStore só aceita chaves [A-Za-z0-9._-]
const keyFor = (id: string) => PREFIX + id.replace(/[^A-Za-z0-9._-]/g, '_');

export async function saveSourceSecrets(id: string, secrets: SourceSecrets): Promise<void> {
  const value = JSON.stringify(secrets);
  try {
    if (IS_WEB) await AsyncStorage.setItem(keyFor(id), value);
    else await SecureStore.setItemAsync(keyFor(id), value);
  } catch (e) {
    console.warn('Erro ao salvar credenciais:', e);
  }
}

export async function loadSourceSecrets(id: string): Promise<SourceSecrets | null> {
  try {
    const raw = IS_WEB
      ? await AsyncStorage.getItem(keyFor(id))
      : await SecureStore.getItemAsync(keyFor(id));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function deleteSourceSecrets(id: string): Promise<void> {
  try {
    if (IS_WEB) await AsyncStorage.removeItem(keyFor(id));
    else await SecureStore.deleteItemAsync(keyFor(id));
  } catch {
    /* noop */
  }
}
