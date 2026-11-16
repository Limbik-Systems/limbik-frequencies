import AsyncStorage from '@react-native-async-storage/async-storage';
import { AzuraSong, EqSettings, FavoriteTrack, StreamQuality } from '../types/radio';

const STORAGE_KEYS = {
  STREAM_QUALITY: '@limbikfreq/stream_quality_v1',
  FAVORITE_TRACKS: '@limbikfreq/favorite_tracks_v1',
  VOLUME: '@limbikfreq/volume_v1',
  EQ_SETTINGS: '@limbikfreq/eq_settings_v1',
};

export async function loadPreferredQuality(): Promise<StreamQuality> {
  try {
    const val = await AsyncStorage.getItem(STORAGE_KEYS.STREAM_QUALITY);
    if (val === '320' || val === '128') {
      return val;
    }
  } catch {
    // fallback to 320 kbps HQ
  }
  return '320';
}

export async function savePreferredQuality(quality: StreamQuality): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.STREAM_QUALITY, quality);
  } catch {
    // ignore storage write error
  }
}

export async function loadSavedVolume(): Promise<number> {
  try {
    const val = await AsyncStorage.getItem(STORAGE_KEYS.VOLUME);
    if (val !== null) {
      const parsed = parseFloat(val);
      if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 1) {
        return parsed;
      }
    }
  } catch {
    // fallback
  }
  return 1.0;
}

export async function saveVolume(volume: number): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.VOLUME, String(volume));
  } catch {
    // ignore
  }
}

export async function loadFavoriteTracks(): Promise<FavoriteTrack[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.FAVORITE_TRACKS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch {
    // ignore parse error
  }
  return [];
}

export async function saveFavoriteTracks(tracks: FavoriteTrack[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.FAVORITE_TRACKS, JSON.stringify(tracks));
  } catch {
    // ignore write error
  }
}

export function songToFavorite(song: AzuraSong): FavoriteTrack {
  return {
    id: song.id || `${song.artist}-${song.title}`.toLowerCase(),
    artist: song.artist || 'Unknown Artist',
    title: song.title || song.text || 'Untitled',
    album: song.album || '',
    art: song.art || '',
    savedAt: Date.now(),
  };
}

const DEFAULT_EQ_SETTINGS: EqSettings = {
  enabled: true,
  presetId: 'flat',
  gains: [0, 0, 0, 0, 0],
};

export async function loadEqSettings(): Promise<EqSettings> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.EQ_SETTINGS);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<EqSettings>;
      if (Array.isArray(parsed.gains) && parsed.gains.length === 5) {
        return {
          enabled: parsed.enabled !== false,
          presetId: parsed.presetId || 'flat',
          gains: parsed.gains.map((g) =>
            Math.max(-12, Math.min(12, Number(g) || 0))
          ) as [number, number, number, number, number],
        };
      }
    }
  } catch {
    // fallback
  }
  return DEFAULT_EQ_SETTINGS;
}

export async function saveEqSettings(settings: EqSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.EQ_SETTINGS, JSON.stringify(settings));
  } catch {
    // ignore
  }
}
