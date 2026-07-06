/**
 * widgetSync.ts — empurra os itens de "continuar assistindo" pro widget de
 * tela inicial (Android). Sem o módulo nativo (iOS/web/dev client antigo sem
 * rebuild), a chamada é um no-op silencioso — nunca deve derrubar o app.
 */
import { NativeModules, Platform } from 'react-native';
import { Channel } from '../types';
import { getSeriesBaseName } from './channelUtils';
import { ContinueWatchingItem } from '../store/watchProgress';

const SkaphosWidget = (NativeModules as any)?.SkaphosWidget;

function deepLinkFor(channel: Channel): string {
  const series = channel.seriesRef;
  if (series) {
    const id = series.tvgId || series.id;
    return `com.skaphostv.app://open?type=series&id=${encodeURIComponent(id)}&name=${encodeURIComponent(getSeriesBaseName(series.name))}`;
  }
  const id = channel.tvgId || channel.id;
  return `com.skaphostv.app://open?type=movie&id=${encodeURIComponent(id)}`;
}

/** Envia até 3 itens realmente em progresso pro widget (o resto não ajuda ali). */
export function syncContinueWatchingWidget(items: ContinueWatchingItem[]): void {
  if (Platform.OS !== 'android' || !SkaphosWidget?.updateContinueWatching) return;
  const payload = items
    .filter(i => i.progress > 0)
    .slice(0, 3)
    .map(({ channel, progress }) => ({
      name: channel.seriesRef ? getSeriesBaseName(channel.seriesRef.name) : channel.name,
      sub: `${Math.round(progress * 100)}% assistido`,
      deepLink: deepLinkFor(channel),
    }));
  try { SkaphosWidget.updateContinueWatching(JSON.stringify(payload)); } catch (_) { /* noop */ }
}
