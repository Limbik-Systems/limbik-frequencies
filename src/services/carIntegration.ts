import { Platform } from 'react-native';
import { STATION_CONFIG, STREAM_OPTIONS } from '../constants/station';
import {
  CarMediaTemplateItem,
  FavoriteTrack,
  NowPlayingResponse,
  StreamQuality,
} from '../types/radio';

/**
 * Syncs live track metadata, album artwork, and remote control handlers
 * with system Lock Screen / Notification Center / CarPlay / Android Auto
 * media sessions.
 */
export function syncMediaSessionMetadata(
  nowPlayingData: NowPlayingResponse | null,
  quality: StreamQuality,
  isPlaying: boolean,
  handlers: {
    onPlay: () => void;
    onStop: () => void;
    onToggleQuality: () => void;
  }
): void {
  const song = nowPlayingData?.now_playing?.song;
  const title = song?.title || STATION_CONFIG.name;
  const artist = song?.artist || STATION_CONFIG.tagline;
  const album = song?.album
    ? `${song.album} • Limbik (${quality}k)`
    : `${STATION_CONFIG.name} (${quality} kbps)`;
  const artworkUrl = song?.art || STATION_CONFIG.defaultArtworkUrl;

  // Sync with Navigator MediaSession API when available (Web / Android WebView / Car bridge)
  if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
    try {
      const navMedia = (navigator as unknown as {
        mediaSession: {
          metadata: unknown;
          playbackState: string;
          setActionHandler: (action: string, cb: (() => void) | null) => void;
        };
      }).mediaSession;

      const MediaMetadataCtor = (globalThis as unknown as {
        MediaMetadata?: new (init: {
          title: string;
          artist: string;
          album: string;
          artwork: Array<{ src: string; sizes: string; type: string }>;
        }) => unknown;
      }).MediaMetadata;

      if (MediaMetadataCtor) {
        navMedia.metadata = new MediaMetadataCtor({
          title,
          artist,
          album,
          artwork: [
            { src: artworkUrl, sizes: '512x512', type: 'image/jpeg' },
          ],
        });
      }

      navMedia.playbackState = isPlaying ? 'playing' : 'paused';
      navMedia.setActionHandler('play', handlers.onPlay);
      navMedia.setActionHandler('pause', handlers.onStop);
      navMedia.setActionHandler('stop', handlers.onStop);
      navMedia.setActionHandler('nexttrack', handlers.onToggleQuality);
    } catch {
      // Ignore unsupported media session actions
    }
  }
}

/**
 * Builds the hierarchical CarPlay (CPTabBarTemplate / CPListTemplate) and
 * Android Auto (MediaBrowserServiceCompat) media tree items.
 */
export function buildCarMediaTree(
  nowPlayingData: NowPlayingResponse | null,
  activeQuality: StreamQuality,
  favorites: FavoriteTrack[]
): {
  streamsSection: CarMediaTemplateItem[];
  historySection: CarMediaTemplateItem[];
  favoritesSection: CarMediaTemplateItem[];
  platformLabel: string;
} {
  const currentSong = nowPlayingData?.now_playing?.song;
  const currentTrackLabel = currentSong
    ? `${currentSong.artist} — ${currentSong.title}`
    : STATION_CONFIG.tagline;

  const streamsSection: CarMediaTemplateItem[] = [
    {
      id: 'stream-320',
      title: STREAM_OPTIONS['320'].shortLabel,
      subtitle:
        activeQuality === '320'
          ? `ACTIVE • ${currentTrackLabel}`
          : STREAM_OPTIONS['320'].description,
      artworkUrl: currentSong?.art || STATION_CONFIG.defaultArtworkUrl,
      playable: true,
      actionType: 'switch_quality',
      payload: '320',
    },
    {
      id: 'stream-128',
      title: STREAM_OPTIONS['128'].shortLabel,
      subtitle:
        activeQuality === '128'
          ? `ACTIVE • ${currentTrackLabel}`
          : STREAM_OPTIONS['128'].description,
      artworkUrl: currentSong?.art || STATION_CONFIG.defaultArtworkUrl,
      playable: true,
      actionType: 'switch_quality',
      payload: '128',
    },
  ];

  const historySection: CarMediaTemplateItem[] = (
    nowPlayingData?.song_history || []
  )
    .slice(0, 6)
    .map((item) => ({
      id: `hist-${item.sh_id}`,
      title: item.song.title,
      subtitle: `${item.song.artist}${item.song.album ? ` • ${item.song.album}` : ''}`,
      artworkUrl: item.song.art || STATION_CONFIG.defaultArtworkUrl,
      playable: false,
      actionType: 'history_track',
      payload: item.song.id,
    }));

  const favoritesSection: CarMediaTemplateItem[] = favorites
    .slice(0, 10)
    .map((fav) => ({
      id: `fav-${fav.id}`,
      title: fav.title,
      subtitle: `${fav.artist}${fav.album ? ` • ${fav.album}` : ''}`,
      artworkUrl: fav.art || STATION_CONFIG.defaultArtworkUrl,
      playable: false,
      actionType: 'favorite_track',
      payload: fav.id,
    }));

  const platformLabel =
    Platform.OS === 'ios'
      ? 'Apple CarPlay Audio'
      : Platform.OS === 'android'
      ? 'Android Auto Media'
      : 'CarPlay & Android Auto';

  return {
    streamsSection,
    historySection,
    favoritesSection,
    platformLabel,
  };
}
