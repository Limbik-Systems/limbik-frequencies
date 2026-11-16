import { EqBandConfig, EqPresetId, StreamOption, StreamQuality } from '../types/radio';

export const STATION_CONFIG = {
  id: 1,
  shortcode: 'limbik_frequencies',
  name: 'Limbik Frequencies',
  tagline: 'Radio Elektro[u]nique',
  genres: 'IDM • Glitch • Ambient • Downtempo • Electronic',
  websiteUrl: 'https://limbikfreq.com',
  nowPlayingApiUrl: 'https://limbikfreq.com/api/nowplaying/limbik_frequencies',
  sseUrl:
    'https://limbikfreq.com/api/live/nowplaying/sse?cf_connect=%7B%22subs%22%3A%7B%22station%3Alimbik_frequencies%22%3A%7B%22recover%22%3Atrue%7D%7D%7D',
  requestsApiUrl: 'https://limbikfreq.com/api/station/1/requests',
  submitRequestBaseUrl: 'https://limbikfreq.com/api/station/1/request',
  defaultArtworkUrl:
    'https://limbikfreq.com/api/station/limbik_frequencies/art/88398f2bdd0500fb8e62f92f',
  backgroundArtworkUrl:
    'https://limbikfreq.com/static/uploads/limbik_frequencies/background.1701311518.jpg',
  playlistPlsUrl: 'https://limbikfreq.com/public/limbik_frequencies/playlist.pls',
  playlistM3uUrl: 'https://limbikfreq.com/public/limbik_frequencies/playlist.m3u',
};

export const STREAM_OPTIONS: Record<StreamQuality, StreamOption> = {
  '320': {
    id: '320',
    label: '320 kbps MP3 (Audiophile HQ)',
    shortLabel: '320 KBPS MP3',
    bitrate: 320,
    format: 'MP3 CBR Stereo',
    url: 'https://limbikfreq.com/listen/limbik_frequencies/320.mp3',
    description: 'Maximum fidelity 320 kbps stream for Wi-Fi and high-end audio systems',
  },
  '128': {
    id: '128',
    label: '128 kbps MP3 (Standard)',
    shortLabel: '128 KBPS MP3',
    bitrate: 128,
    format: 'MP3 CBR Stereo',
    url: 'https://limbikfreq.com/listen/limbik_frequencies/128.mp3',
    description: 'Balanced 128 kbps stream ideal for mobile data and on-the-go driving',
  },
};

export const THEME = {
  background: '#12151E',
  cardBg: 'rgba(34, 37, 47, 0.90)',
  cardSolid: '#22252F',
  surfaceElevated: '#2B303C',
  surfaceControl: '#343A46',
  border: 'rgba(255, 255, 255, 0.10)',
  primary: '#2196F3',
  primaryLight: '#78B8EF',
  primaryGlow: 'rgba(33, 150, 243, 0.25)',
  accentGreen: '#66BB6A',
  liveRed: '#EF5350',
  favoritePink: '#FF4081',
  textPrimary: '#FFFFFF',
  textSecondary: '#DEE2E6',
  textMuted: 'rgba(222, 226, 230, 0.68)',
};

export const DEFAULT_EQ_BANDS: [
  EqBandConfig,
  EqBandConfig,
  EqBandConfig,
  EqBandConfig
] = [
  { freq: 80, gain: 0, q: 0.7 },
  { freq: 400, gain: 0, q: 1.0 },
  { freq: 2400, gain: 0, q: 1.0 },
  { freq: 10000, gain: 0, q: 0.7 },
];

export const EQ_PRESETS: Record<
  Exclude<EqPresetId, 'custom'>,
  {
    label: string;
    bands: [EqBandConfig, EqBandConfig, EqBandConfig, EqBandConfig];
  }
> = {
  flat: {
    label: 'Flat',
    bands: [
      { freq: 80, gain: 0, q: 0.7 },
      { freq: 400, gain: 0, q: 1.0 },
      { freq: 2400, gain: 0, q: 1.0 },
      { freq: 10000, gain: 0, q: 0.7 },
    ],
  },
  warm_bass: {
    label: 'Warm Bass',
    bands: [
      { freq: 75, gain: 5, q: 0.8 },
      { freq: 320, gain: 2.5, q: 1.1 },
      { freq: 2200, gain: 0.5, q: 1.0 },
      { freq: 10000, gain: 1.5, q: 0.7 },
    ],
  },
  idm_crisp: {
    label: 'IDM Crisp',
    bands: [
      { freq: 65, gain: 3.5, q: 0.9 },
      { freq: 500, gain: -1.5, q: 1.4 },
      { freq: 3200, gain: 3.5, q: 1.2 },
      { freq: 12000, gain: 4.5, q: 0.8 },
    ],
  },
  late_night: {
    label: 'Late Night',
    bands: [
      { freq: 90, gain: 2, q: 0.7 },
      { freq: 800, gain: -2, q: 1.2 },
      { freq: 3000, gain: 1.5, q: 1.0 },
      { freq: 9500, gain: 2, q: 0.7 },
    ],
  },
  club: {
    label: 'Club',
    bands: [
      { freq: 60, gain: 6, q: 0.9 },
      { freq: 350, gain: -2, q: 1.5 },
      { freq: 2600, gain: 3, q: 1.1 },
      { freq: 11000, gain: 4, q: 0.8 },
    ],
  },
};
