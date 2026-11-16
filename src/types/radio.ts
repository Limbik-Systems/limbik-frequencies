export type StreamQuality = '320' | '128';

export interface StreamOption {
  id: StreamQuality;
  label: string;
  shortLabel: string;
  bitrate: number;
  format: string;
  url: string;
  description: string;
}

export interface AzuraSong {
  id: string;
  text: string;
  artist: string;
  title: string;
  album: string;
  genre: string;
  isrc?: string;
  lyrics?: string;
  art: string;
}

export interface NowPlayingTrack {
  sh_id: number;
  played_at: number;
  duration: number;
  elapsed: number;
  remaining: number;
  is_request: boolean;
  song: AzuraSong;
}

export interface PlayingNextTrack {
  cued_at: number;
  played_at: number;
  duration: number;
  is_request: boolean;
  song: AzuraSong;
}

export interface SongHistoryItem {
  sh_id: number;
  played_at: number;
  duration: number;
  is_request?: boolean;
  song: AzuraSong;
}

export interface StationMount {
  id: number;
  name: string;
  url: string;
  bitrate: number;
  format: string;
  listeners: {
    total: number;
    unique: number;
    current: number;
  };
  path: string;
  is_default: boolean;
}

export interface NowPlayingResponse {
  station: {
    id: number;
    name: string;
    shortcode: string;
    description: string;
    listen_url: string;
    url: string;
    public_player_url: string;
    playlist_pls_url: string;
    playlist_m3u_url: string;
    requests_enabled: boolean;
    mounts: StationMount[];
  };
  listeners: {
    total: number;
    unique: number;
    current: number;
  };
  live: {
    is_live: boolean;
    streamer_name: string;
    broadcast_start: number | null;
    art: string | null;
  };
  now_playing: NowPlayingTrack;
  playing_next: PlayingNextTrack | null;
  song_history: SongHistoryItem[];
  is_online: boolean;
}

export interface FavoriteTrack {
  id: string;
  artist: string;
  title: string;
  album: string;
  art: string;
  savedAt: number;
}

export interface RequestableSongItem {
  request_id: string;
  request_url: string;
  song: AzuraSong;
}

export interface RequestCatalogResponse {
  rows: RequestableSongItem[];
  current: number;
  rowCount: number;
  total: number;
}

export interface CarMediaTemplateItem {
  id: string;
  title: string;
  subtitle: string;
  artworkUrl: string;
  playable: boolean;
  actionType: 'play_stream' | 'switch_quality' | 'favorite_track' | 'history_track';
  payload?: string;
}
