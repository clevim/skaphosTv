/**
 * subtitleSync.ts — ajuste de sincronia de legenda (adianta/atrasa em ms).
 *
 * react-native-video não expõe um "delay" de legenda pra faixas VTT externas
 * (como as do Jellyfin), então a única forma de "adiantar"/atrasar é reescrever
 * os timestamps do próprio VTT e servir o arquivo já deslocado — daí o cache
 * local (expo-file-system), já que o player só aceita uma URI de arquivo.
 */
import * as FileSystem from 'expo-file-system';

const TIMESTAMP_RE = /(\d{2}):(\d{2}):(\d{2})\.(\d{3})/g;

function shiftVttTimestamps(vtt: string, offsetMs: number): string {
  return vtt.replace(TIMESTAMP_RE, (_match, h, m, s, ms) => {
    let total = (Number(h) * 3600 + Number(m) * 60 + Number(s)) * 1000 + Number(ms) + offsetMs;
    if (total < 0) total = 0;
    const hh = Math.floor(total / 3_600_000); total %= 3_600_000;
    const mm = Math.floor(total / 60_000);    total %= 60_000;
    const ss = Math.floor(total / 1_000);
    const msRem = total % 1_000;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${String(msRem).padStart(3, '0')}`;
  });
}

/**
 * Retorna a URI a ser usada como faixa de texto: a original (sem offset) ou um
 * arquivo local com os timestamps deslocados. Nunca lança — se buscar/escrever
 * falhar, cai de volta pra URL original (sem sincronia, mas não quebra a legenda).
 */
export async function resolveSubtitleUri(vttUrl: string, offsetMs: number): Promise<string> {
  if (!offsetMs) return vttUrl;
  try {
    const res = await fetch(vttUrl);
    const raw = await res.text();
    const shifted = shiftVttTimestamps(raw, offsetMs);
    const path = `${FileSystem.cacheDirectory}subtitle-sync-${offsetMs}.vtt`;
    await FileSystem.writeAsStringAsync(path, shifted);
    return path;
  } catch {
    return vttUrl;
  }
}
