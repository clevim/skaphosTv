export interface Channel {
  id: string;
  name: string;
  url: string;
  logo?: string;
  group?: string;
  /** Fonte (IPTVSource.id) a que este canal pertence — permite múltiplas fontes coexistirem */
  sourceId?: string;
  tvgId?: string;
  quality?: string;
  isFavorite?: boolean;
  // Tipo explícito da Xtream API — mais confiável que heurística de grupo
  streamType?: 'live' | 'movie' | 'series';
  // Metadata rica da Xtream API (séries e filmes)
  plot?: string;
  cast?: string;
  director?: string;
  genre?: string;
  rating?: string;
  releaseDate?: string;
  backdrop?: string;
  // Jellyfin: posição de retomada em ticks de 100ns (dividir por 10_000_000 para segundos)
  resumePositionTicks?: number;
  /**
   * Episódios de série (Xtream/Jellyfin) carregam uma referência ao canal da SÉRIE-pai.
   * Usado para que "continuar assistindo" guarde a série (e reabra a SeriesScreen) em vez
   * do episódio solto — cujo id/URL não permitem rebuscar a lista de episódios.
   * Nunca é persistido (só o canal da série, que é plano, vai para os recentes).
   */
  seriesRef?: Channel;
}

/** Shape compartilhado das faixas de legenda Jellyfin (evita importação circular com jellyfinLoader) */
export interface SubtitleTrack {
  index: number;
  displayTitle: string;
  language: string;
  isExternal: boolean;
  vttUrl: string;
}

/** Shape compartilhado das faixas de áudio Jellyfin (evita importação circular com jellyfinLoader) */
export interface AudioTrack {
  index: number;
  displayTitle: string;
  language: string;
  isDefault: boolean;
}

export type RootStackParamList = {
  Home: undefined;
  Player: {
    channel: Channel;
    initialSubtitleIndex?: number | null;
    initialSubtitleTracks?: SubtitleTrack[];
    initialAudioIndex?: number | null;
    initialAudioTracks?: AudioTrack[];
    /** Lista ordenada de episódios (séries) para auto-play do próximo ao terminar. */
    playlist?: Channel[];
    /** Índice de `channel` dentro de `playlist`. */
    playlistIndex?: number;
  };
  Setup: undefined;
  Settings: undefined;
  Series: { seriesName: string; channels: Channel[] };
  Detail: { channel: Channel; relatedChannels?: Channel[] };
  EPG: undefined;
};
