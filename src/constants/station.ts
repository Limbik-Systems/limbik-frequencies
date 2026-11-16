import { EqPresetId, StreamOption, StreamQuality } from '../types/radio';

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

export const EQ_BANDS = [
  { index: 0, freq: 60, label: '60 Hz' },
  { index: 1, freq: 230, label: '230 Hz' },
  { index: 2, freq: 910, label: '910 Hz' },
  { index: 3, freq: 3600, label: '3.6 kHz' },
  { index: 4, freq: 14000, label: '14 kHz' },
] as const;

export const EQ_PRESETS: Record<
  Exclude<EqPresetId, 'custom'>,
  { label: string; gains: [number, number, number, number, number] }
> = {
  flat: { label: 'Flat', gains: [0, 0, 0, 0, 0] },
  warm_bass: { label: 'Warm Bass', gains: [5, 3, 0, 1, 2] },
  idm_crisp: { label: 'IDM Crisp', gains: [3, 0, 1, 4, 5] },
  late_night: { label: 'Late Night', gains: [2, 1, -2, 1, 2] },
  club: { label: 'Club', gains: [6, 4, -1, 3, 4] },
};
