/**
 * achievements.ts — badges bobos, calculados sob demanda a partir de dados que
 * já existem (watchProgress + usageStats + sources). Sem estado próprio, sem
 * persistência nova — é só uma leitura derivada, igual ao Wrapped.
 */
import { IPTVSource } from '../store/useStore';
import { useWatchProgress } from '../store/watchProgress';
import { useUsageStats, topChannelFor } from '../store/usageStats';

export interface Achievement {
  id: string;
  label: string;
  description: string;
  icon: string;
  unlocked: boolean;
}

export function getAchievements(sources: IPTVSource[]): Achievement[] {
  const { entries } = useWatchProgress.getState();
  const { bySource } = useUsageStats.getState();

  const watchedCount = Object.values(entries).filter(e => e.watched).length;
  let totalWatchSeconds = 0;
  let bestTopChannelCount = 0;
  for (const usage of Object.values(bySource)) {
    totalWatchSeconds += usage.watchSeconds;
    const top = topChannelFor(usage);
    if (top && top.count > bestTopChannelCount) bestTopChannelCount = top.count;
  }
  // Madrugador: alguma atualização de progresso salva entre 1h e 5h da madrugada —
  // só acontece se o app estava REALMENTE tocando nesse horário.
  const nightOwl = Object.values(entries).some(e => {
    const h = new Date(e.updatedAt).getHours();
    return h >= 1 && h < 5;
  });

  return [
    {
      id: 'maratonista',
      label: 'Maratonista',
      description: `Concluiu 20+ títulos (${watchedCount}/20)`,
      icon: 'infinite-outline',
      unlocked: watchedCount >= 20,
    },
    {
      id: 'madrugador',
      label: 'Madrugador',
      description: 'Assistiu algo entre 1h e 5h da manhã',
      icon: 'moon-outline',
      unlocked: nightOwl,
    },
    {
      id: 'fiel',
      label: 'Fiel',
      description: `Assistiu o mesmo canal 20+ vezes (${bestTopChannelCount}/20)`,
      icon: 'heart-outline',
      unlocked: bestTopChannelCount >= 20,
    },
    {
      id: 'colecionador',
      label: 'Colecionador',
      description: `Configurou 3+ fontes diferentes (${sources.length}/3)`,
      icon: 'albums-outline',
      unlocked: sources.length >= 3,
    },
    {
      id: 'assiduo',
      label: 'Assíduo',
      description: `24h+ de conteúdo assistido (${Math.floor(totalWatchSeconds / 3600)}/24h)`,
      icon: 'time-outline',
      unlocked: totalWatchSeconds >= 24 * 3600,
    },
  ];
}
