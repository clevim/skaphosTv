export interface Channel {
  id: string;
  name: string;
  url: string;
  logo?: string;
  group?: string;
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
}

export type RootStackParamList = {
  Home: undefined;
  Player: { channel: Channel };
  Setup: undefined;
  Search: undefined;
  Favorites: undefined;
  Settings: undefined;
  Series: { seriesName: string; channels: Channel[] };
  Detail: { channel: Channel; relatedChannels?: Channel[] };
  EPG: undefined;
};
