import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  Share,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { DEFAULT_EQ_BANDS, EQ_PRESETS, STATION_CONFIG, THEME } from './src/constants/station';
import {
  AzuraSong,
  EqBandConfig,
  EqPresetId,
  EqSettings,
  FavoriteTrack,
  NowPlayingResponse,
  RequestableSongItem,
  StreamQuality,
} from './src/types/radio';
import {
  fetchNowPlaying,
  fetchRequestableSongs,
  submitSongRequest,
} from './src/services/azuracastApi';
import {
  loadEqSettings,
  loadFavoriteTracks,
  loadPreferredQuality,
  loadUserEqPreset,
  saveEqSettings,
  saveFavoriteTracks,
  savePreferredQuality,
  saveUserEqPreset,
  songToFavorite,
} from './src/services/storage';
import {
  audioEngine,
  PlaybackStatusState,
} from './src/services/audioEngine';
import { syncMediaSessionMetadata } from './src/services/carIntegration';
import { AudioMeter } from './src/components/AudioMeter';
import { EqualizerPanel } from './src/components/EqualizerPanel';
import { AdBanner } from './src/components/AdBanner';

type TabKey = 'player' | 'history' | 'favorites' | 'request' | 'eq';

const fallbackLogoAsset = require('./assets/station-logo.png');

function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds || 0));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatRelativeTime(unixSeconds: number): string {
  if (!unixSeconds) return '';
  const diffSec = Math.max(0, Math.floor(Date.now() / 1000 - unixSeconds));
  if (diffSec < 60) return 'Just now';
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m ago`;
}

export default function App() {
  const { width: screenWidth } = useWindowDimensions();
  const heroArtSize = Math.min(300, Math.max(200, Math.floor(screenWidth * 0.68)));

  const [activeTab, setActiveTab] = useState<TabKey>('player');
  const [nowPlaying, setNowPlaying] = useState<NowPlayingResponse | null>(null);
  const [loadingMeta, setLoadingMeta] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [playbackState, setPlaybackState] = useState<PlaybackStatusState>('stopped');
  const [streamError, setStreamError] = useState<string | null>(null);
  const [quality, setQuality] = useState<StreamQuality>('320');
  const [favorites, setFavorites] = useState<FavoriteTrack[]>([]);
  const [favoritesFilter, setFavoritesFilter] = useState<string>('');
  const [localElapsed, setLocalElapsed] = useState<number>(0);
  const [eqSettings, setEqSettings] = useState<EqSettings>({
    enabled: true,
    presetId: 'flat',
    bands: DEFAULT_EQ_BANDS,
  });
  const [userEqBands, setUserEqBands] = useState<
    [EqBandConfig, EqBandConfig, EqBandConfig, EqBandConfig]
  >(DEFAULT_EQ_BANDS);
  const userEqBandsRef = useRef(userEqBands);
  userEqBandsRef.current = userEqBands;

  // Song Requests catalog state
  const [requestQuery, setRequestQuery] = useState<string>('');
  const [requestItems, setRequestItems] = useState<RequestableSongItem[]>([]);
  const [loadingRequests, setLoadingRequests] = useState<boolean>(false);
  const [requestSubmittingId, setRequestSubmittingId] = useState<string | null>(null);
  const [requestStatusMsg, setRequestStatusMsg] = useState<string | null>(null);

  const lastFetchTimestampRef = useRef<number>(Date.now());

  // Load persisted preferences & favorites on startup
  useEffect(() => {
    let mounted = true;
    (async () => {
      const [savedQ, savedFavs, savedEq, savedUserBands] = await Promise.all([
        loadPreferredQuality(),
        loadFavoriteTracks(),
        loadEqSettings(),
        loadUserEqPreset(),
      ]);
      if (!mounted) return;
      setQuality(savedQ);
      setFavorites(savedFavs);
      setEqSettings(savedEq);
      setUserEqBands(savedUserBands);
      await audioEngine.setVolume(1.0);
      await audioEngine.setEq(
        savedEq.enabled,
        savedEq.bands,
        savedEq.presetId,
        savedUserBands
      );
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Subscribe to audio engine playback state updates
  useEffect(() => {
    audioEngine.setCallbacks({
      onStateChange: (state, err) => {
        setPlaybackState(state);
        if (err) {
          setStreamError(err);
        } else if (state === 'playing' || state === 'buffering') {
          setStreamError(null);
        }

        if (state === 'playing') {
          activateKeepAwakeAsync('limbik-stream').catch(() => {});
        } else if (state === 'stopped' || state === 'error') {
          deactivateKeepAwake('limbik-stream').catch(() => {});
        }
      },
      onEqChange: (ev) => {
        if (Array.isArray(ev.bands) && ev.bands.length === 4) {
          const next: EqSettings = {
            enabled: ev.enabled,
            presetId: (ev.presetId as EqPresetId) || 'custom',
            bands: ev.bands.map((b) => ({
              freq: b.freq,
              gain: b.gain,
              q: b.q,
            })) as [EqBandConfig, EqBandConfig, EqBandConfig, EqBandConfig],
          };
          setEqSettings(next);
          saveEqSettings(next);
        }
      },
    });
  }, []);

  // Fetch Now Playing metadata
  const refreshMetadata = useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true);
    try {
      const data = await fetchNowPlaying();
      setNowPlaying(data);
      setLocalElapsed(data.now_playing?.elapsed || 0);
      lastFetchTimestampRef.current = Date.now();
    } catch {
      // Keep last known metadata on transient network hiccup
    } finally {
      setLoadingMeta(false);
      if (showSpinner) setRefreshing(false);
    }
  }, []);

  // Poll metadata every 12 seconds
  useEffect(() => {
    refreshMetadata(false);
    const pollTimer = setInterval(() => {
      refreshMetadata(false);
    }, 12000);
    return () => clearInterval(pollTimer);
  }, [refreshMetadata]);

  // Smooth 1-second local elapsed progress counter
  useEffect(() => {
    const duration = nowPlaying?.now_playing?.duration || 0;
    const baseElapsed = nowPlaying?.now_playing?.elapsed || 0;

    const tick = setInterval(() => {
      const deltaSec = Math.floor((Date.now() - lastFetchTimestampRef.current) / 1000);
      const nextElapsed = baseElapsed + deltaSec;
      if (duration > 0 && nextElapsed >= duration) {
        setLocalElapsed(duration);
      } else {
        setLocalElapsed(nextElapsed);
      }
    }, 1000);

    return () => clearInterval(tick);
  }, [nowPlaying]);

  // Handlers for playback & quality
  const handleTogglePlay = useCallback(async () => {
    setStreamError(null);
    if (playbackState === 'playing' || playbackState === 'buffering') {
      await audioEngine.stop();
    } else {
      await audioEngine.play(quality);
    }
  }, [playbackState, quality]);

  const handleSelectQuality = useCallback(
    async (newQuality: StreamQuality) => {
      if (newQuality === quality) return;
      setQuality(newQuality);
      await savePreferredQuality(newQuality);
      await audioEngine.switchQuality(newQuality);
    },
    [quality]
  );

  const handleToggleEqEnabled = useCallback(() => {
    setEqSettings((prev) => {
      const next: EqSettings = { ...prev, enabled: !prev.enabled };
      audioEngine.setEq(
        next.enabled,
        next.bands,
        next.presetId,
        userEqBandsRef.current
      );
      saveEqSettings(next);
      return next;
    });
  }, []);

  const handleSelectEqPreset = useCallback(
    (presetId: 'flat' | 'warm' | 'crisp' | 'user') => {
      const sourceBands =
        presetId === 'user'
          ? userEqBandsRef.current
          : EQ_PRESETS[presetId].bands;

      const next: EqSettings = {
        enabled: true,
        presetId,
        bands: sourceBands.map((b) => ({ ...b })) as [
          EqBandConfig,
          EqBandConfig,
          EqBandConfig,
          EqBandConfig
        ],
      };
      setEqSettings(next);
      audioEngine.setEq(
        next.enabled,
        next.bands,
        next.presetId,
        userEqBandsRef.current
      );
      saveEqSettings(next);
    },
    []
  );

  const handleSaveUserPreset = useCallback(() => {
    setEqSettings((prev) => {
      const savedCopy = prev.bands.map((b) => ({ ...b })) as [
        EqBandConfig,
        EqBandConfig,
        EqBandConfig,
        EqBandConfig
      ];
      setUserEqBands(savedCopy);
      userEqBandsRef.current = savedCopy;
      saveUserEqPreset(savedCopy);

      const next: EqSettings = {
        enabled: true,
        presetId: 'user',
        bands: savedCopy,
      };
      audioEngine.setEq(next.enabled, next.bands, 'user', savedCopy);
      saveEqSettings(next);
      return next;
    });
  }, []);

  const handleUpdateEqBand = useCallback(
    (bandIndex: number, patch: Partial<EqBandConfig>) => {
      setEqSettings((prev) => {
        const nextBands = prev.bands.map((b, idx) => {
          if (idx !== bandIndex) return b;
          return {
            freq: Math.max(30, Math.min(16000, patch.freq ?? b.freq)),
            gain: Math.max(-12, Math.min(12, patch.gain ?? b.gain)),
            q: Math.max(0.3, Math.min(8.0, patch.q ?? b.q)),
          };
        }) as [EqBandConfig, EqBandConfig, EqBandConfig, EqBandConfig];

        const next: EqSettings = {
          enabled: true,
          presetId: 'custom',
          bands: nextBands,
        };
        audioEngine.setEq(
          next.enabled,
          next.bands,
          next.presetId,
          userEqBandsRef.current
        );
        saveEqSettings(next);
        return next;
      });
    },
    []
  );

  // Sync lock-screen / CarPlay / Android Auto media session metadata
  useEffect(() => {
    syncMediaSessionMetadata(
      nowPlaying,
      quality,
      playbackState === 'playing',
      {
        onPlay: () => audioEngine.play(quality),
        onStop: () => audioEngine.stop(),
        onToggleQuality: () => {
          const nextQ: StreamQuality = quality === '320' ? '128' : '320';
          handleSelectQuality(nextQ);
        },
      }
    );
    const s = nowPlaying?.now_playing?.song;
    audioEngine.updateNowPlayingMetadata({
      title: s?.title || STATION_CONFIG.name,
      artist: s?.artist || STATION_CONFIG.tagline,
      album: s?.album || `${STATION_CONFIG.name} (${quality} kbps)`,
      artworkUrl: s?.art || STATION_CONFIG.defaultArtworkUrl,
    });
  }, [nowPlaying, quality, playbackState, handleSelectQuality]);

  // Favorites management
  const isSongFavorited = useCallback(
    (song?: AzuraSong | null): boolean => {
      if (!song) return false;
      const key = song.id || `${song.artist}-${song.title}`.toLowerCase();
      return favorites.some((f) => f.id === key);
    },
    [favorites]
  );

  const toggleFavoriteSong = useCallback(
    async (song?: AzuraSong | null) => {
      if (!song) return;
      const favItem = songToFavorite(song);
      const exists = favorites.some((f) => f.id === favItem.id);
      const updated = exists
        ? favorites.filter((f) => f.id !== favItem.id)
        : [favItem, ...favorites];
      setFavorites(updated);
      await saveFavoriteTracks(updated);
    },
    [favorites]
  );

  const removeFavoriteById = useCallback(
    async (id: string) => {
      const updated = favorites.filter((f) => f.id !== id);
      setFavorites(updated);
      await saveFavoriteTracks(updated);
    },
    [favorites]
  );

  // Share current track or favorite track
  const handleShareTrack = useCallback(async (artist: string, title: string) => {
    try {
      await Share.share({
        message: `Listening to "${title}" by ${artist} on ${STATION_CONFIG.name} (${STATION_CONFIG.tagline}) — ${STATION_CONFIG.websiteUrl}`,
      });
    } catch {
      // ignore cancelled share
    }
  }, []);

  // Load requestable songs when switching to Request tab or searching
  const loadRequestsCatalog = useCallback(async (queryText: string) => {
    setLoadingRequests(true);
    setRequestStatusMsg(null);
    try {
      const res = await fetchRequestableSongs(queryText, 1, 30);
      setRequestItems(res.rows || []);
    } catch {
      setRequestStatusMsg('Unable to load song request catalog right now.');
    } finally {
      setLoadingRequests(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'request' && requestItems.length === 0) {
      loadRequestsCatalog('');
    }
  }, [activeTab, requestItems.length, loadRequestsCatalog]);

  const handleRequestSong = useCallback(async (item: RequestableSongItem) => {
    setRequestSubmittingId(item.request_id);
    setRequestStatusMsg(null);
    try {
      const result = await submitSongRequest(item.request_id);
      setRequestStatusMsg(result.message);
      if (Platform.OS !== 'web') {
        Alert.alert(
          result.success ? 'Request Submitted' : 'Request Notice',
          result.message
        );
      }
    } catch {
      setRequestStatusMsg('Network error submitting request.');
    } finally {
      setRequestSubmittingId(null);
    }
  }, []);

  const currentSong = nowPlaying?.now_playing?.song;
  const nextSong = nowPlaying?.playing_next?.song;
  const duration = nowPlaying?.now_playing?.duration || 0;
  const progressRatio =
    duration > 0 ? Math.min(1, Math.max(0, localElapsed / duration)) : 0;
  const currentFavorited = isSongFavorited(currentSong);

  const filteredFavorites = useMemo(() => {
    const q = favoritesFilter.trim().toLowerCase();
    if (!q) return favorites;
    return favorites.filter(
      (f) =>
        f.title.toLowerCase().includes(q) ||
        f.artist.toLowerCase().includes(q) ||
        f.album.toLowerCase().includes(q)
    );
  }, [favorites, favoritesFilter]);

  const isPlaying = playbackState === 'playing';
  const isBuffering = playbackState === 'buffering';

  return (
    <View style={styles.rootContainer}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safeArea}>
        {/* Top Station Header Bar (Clean, no Car button) */}
        <View style={styles.topBar}>
          <View style={styles.brandRow}>
            <Image source={fallbackLogoAsset} style={styles.stationLogo} />
            <View style={styles.brandTextCol}>
              <Text style={styles.stationTitle} numberOfLines={1}>
                {STATION_CONFIG.name}
              </Text>
              <View style={styles.taglineRow}>
                <View
                  style={[
                    styles.statusDot,
                    {
                      backgroundColor: isPlaying
                        ? THEME.accentGreen
                        : nowPlaying?.is_online !== false
                        ? THEME.primary
                        : THEME.liveRed,
                    },
                  ]}
                />
                <Text style={styles.stationTagline} numberOfLines={1}>
                  {STATION_CONFIG.tagline}
                  {nowPlaying?.listeners?.current
                    ? ` • ${nowPlaying.listeners.current} listening`
                    : ''}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Main Tab Content Area */}
        <View style={styles.contentArea}>
          {activeTab === 'player' && (
            <ScrollView
              contentContainerStyle={styles.playerScroll}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() => refreshMetadata(true)}
                  tintColor={THEME.primary}
                />
              }
            >
              {/* Primary Player Card */}
              <View style={styles.playerCard}>
                {/* Status Badge Row */}
                <View style={styles.cardHeaderRow}>
                  <View style={styles.livePill}>
                    <View
                      style={[
                        styles.livePulseDot,
                        {
                          backgroundColor: isPlaying
                            ? THEME.accentGreen
                            : THEME.primaryLight,
                        },
                      ]}
                    />
                    <Text style={styles.livePillText} numberOfLines={1}>
                      {isBuffering
                        ? 'BUFFERING STREAM...'
                        : isPlaying
                        ? `ON AIR • ${quality} KBPS MP3`
                        : 'READY TO STREAM'}
                    </Text>
                  </View>

                  {currentSong?.genre ? (
                    <Text style={styles.genreBadgeText} numberOfLines={1}>
                      {currentSong.genre}
                    </Text>
                  ) : null}
                </View>

                {/* Prominent Centered Album Artwork */}
                <View style={styles.heroArtworkContainer}>
                  <View
                    style={[
                      styles.artworkShadowBox,
                      { width: heroArtSize, height: heroArtSize },
                    ]}
                  >
                    <Image
                      source={
                        currentSong?.art
                          ? { uri: currentSong.art }
                          : fallbackLogoAsset
                      }
                      defaultSource={fallbackLogoAsset}
                      style={{
                        width: heroArtSize,
                        height: heroArtSize,
                        borderRadius: 16,
                        backgroundColor: '#000',
                      }}
                    />
                    {nowPlaying?.now_playing?.is_request ? (
                      <View style={styles.requestBadge}>
                        <Text style={styles.requestBadgeText}>
                          LISTENER REQUEST
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>

                {/* Centered Track Title, Artist & Album */}
                <View style={styles.trackMetaBlock}>
                  {loadingMeta && !currentSong ? (
                    <ActivityIndicator
                      color={THEME.primary}
                      style={{ marginVertical: 12 }}
                    />
                  ) : (
                    <>
                      <Text style={styles.songTitle} numberOfLines={2}>
                        {currentSong?.title || STATION_CONFIG.name}
                      </Text>
                      <Text style={styles.songArtist} numberOfLines={1}>
                        {currentSong?.artist || STATION_CONFIG.tagline}
                      </Text>
                      {currentSong?.album ? (
                        <Text style={styles.songAlbum} numberOfLines={1}>
                          {currentSong.album}
                        </Text>
                      ) : null}
                    </>
                  )}
                </View>

                {/* Full-Width Progress Bar */}
                <View style={styles.progressSection}>
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: `${Math.round(progressRatio * 100)}%` },
                      ]}
                    />
                  </View>
                  <View style={styles.timeLabelsRow}>
                    <Text style={styles.timeText}>
                      {formatDuration(localElapsed)}
                    </Text>
                    <Text style={styles.timeText}>
                      {formatDuration(duration)}
                    </Text>
                  </View>
                </View>

                {/* Stream Error Banner if any */}
                {streamError ? (
                  <View style={styles.errorBanner}>
                    <Text style={styles.errorBannerText} numberOfLines={2}>
                      {streamError}
                    </Text>
                    <TouchableOpacity onPress={handleTogglePlay}>
                      <Text style={styles.errorRetryText}>RETRY</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}

                {/* Primary Transport Controls: Save — Play/Stop — Share (Flat Monochromatic Icons) */}
                <View style={styles.transportRow}>
                  <TouchableOpacity
                    style={[
                      styles.sideActionButton,
                      currentFavorited && styles.sideActionButtonFavorited,
                    ]}
                    onPress={() => toggleFavoriteSong(currentSong)}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={currentFavorited ? 'heart' : 'heart-outline'}
                      size={20}
                      color={currentFavorited ? THEME.primaryLight : THEME.textSecondary}
                    />
                    <Text
                      style={[
                        styles.sideActionLabel,
                        currentFavorited && { color: THEME.primaryLight },
                      ]}
                    >
                      {currentFavorited ? 'Saved' : 'Save'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.playButton,
                      isPlaying && styles.playButtonActive,
                    ]}
                    onPress={handleTogglePlay}
                    activeOpacity={0.85}
                  >
                    {isBuffering ? (
                      <ActivityIndicator
                        color={isPlaying ? '#FFFFFF' : '#0B0E14'}
                        size="small"
                      />
                    ) : (
                      <Ionicons
                        name={isPlaying ? 'stop' : 'play'}
                        size={28}
                        color={isPlaying ? '#FFFFFF' : '#0B0E14'}
                        style={!isPlaying ? { marginLeft: 3 } : undefined}
                      />
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.sideActionButton}
                    onPress={() =>
                      handleShareTrack(
                        currentSong?.artist || STATION_CONFIG.name,
                        currentSong?.title || STATION_CONFIG.tagline
                      )
                    }
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name="share-outline"
                      size={20}
                      color={THEME.textSecondary}
                    />
                    <Text style={styles.sideActionLabel}>Share</Text>
                  </TouchableOpacity>
                </View>

                {/* Dedicated Full-Width Stream Quality Switcher */}
                <View style={styles.qualitySegment}>
                  {(['320', '128'] as StreamQuality[]).map((q) => {
                    const selected = quality === q;
                    return (
                      <TouchableOpacity
                        key={q}
                        style={[
                          styles.qualityTab,
                          selected && styles.qualityTabSelected,
                        ]}
                        onPress={() => handleSelectQuality(q)}
                        activeOpacity={0.85}
                      >
                        <Text
                          style={[
                            styles.qualityTabText,
                            selected && styles.qualityTabTextSelected,
                          ]}
                          numberOfLines={1}
                        >
                          {q} kbps MP3 {q === '320' ? '(HQ)' : '(Std)'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Active Real-Time FFT Audio Spectrum Meter */}
                <AudioMeter
                  playbackState={playbackState}
                  bitrateLabel={`${quality} kbps MP3`}
                />
              </View>

              {/* Playing Next Preview Card */}
              {nextSong ? (
                <View style={styles.upNextCard}>
                  <View style={styles.upNextHeader}>
                    <Text style={styles.upNextLabel}>UP NEXT ON LIMBIK</Text>
                    <TouchableOpacity
                      style={styles.upNextFavBtn}
                      onPress={() => toggleFavoriteSong(nextSong)}
                    >
                      <Ionicons
                        name={isSongFavorited(nextSong) ? 'heart' : 'heart-outline'}
                        size={14}
                        color={
                          isSongFavorited(nextSong)
                            ? THEME.primaryLight
                            : THEME.textMuted
                        }
                      />
                      <Text
                        style={[
                          styles.upNextFavIcon,
                          isSongFavorited(nextSong) && {
                            color: THEME.primaryLight,
                          },
                        ]}
                      >
                        {isSongFavorited(nextSong) ? 'Saved' : 'Save'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.upNextBody}>
                    <Image
                      source={
                        nextSong.art
                          ? { uri: nextSong.art }
                          : fallbackLogoAsset
                      }
                      style={styles.upNextArt}
                    />
                    <View style={styles.upNextTextCol}>
                      <Text style={styles.upNextTitle} numberOfLines={1}>
                        {nextSong.title}
                      </Text>
                      <Text style={styles.upNextArtist} numberOfLines={1}>
                        {nextSong.artist}
                        {nextSong.album ? ` • ${nextSong.album}` : ''}
                      </Text>
                    </View>
                  </View>
                </View>
              ) : null}
            </ScrollView>
          )}

          {/* TAB 2: RECENTLY PLAYED SONG HISTORY */}
          {activeTab === 'history' && (
            <View style={styles.tabPanel}>
              <View style={styles.panelHeader}>
                <View style={styles.panelHeaderTextCol}>
                  <Text style={styles.panelTitle} numberOfLines={1}>
                    Recently Played
                  </Text>
                  <Text style={styles.panelSub} numberOfLines={1}>
                    Last {nowPlaying?.song_history?.length || 0} tracks on Limbik Frequencies
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.refreshBtn}
                  onPress={() => refreshMetadata(true)}
                >
                  <Ionicons name="refresh" size={14} color={THEME.primaryLight} />
                  <Text style={styles.refreshBtnText}>Refresh</Text>
                </TouchableOpacity>
              </View>

              <FlatList
                data={nowPlaying?.song_history || []}
                keyExtractor={(item) => String(item.sh_id)}
                contentContainerStyle={styles.listContainer}
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={() => refreshMetadata(true)}
                    tintColor={THEME.primary}
                  />
                }
                renderItem={({ item, index }) => {
                  const saved = isSongFavorited(item.song);
                  return (
                    <View style={styles.trackRowCard}>
                      <Text style={styles.historyIndex}>{index + 1}</Text>
                      <Image
                        source={
                          item.song.art
                            ? { uri: item.song.art }
                            : fallbackLogoAsset
                        }
                        style={styles.rowArt}
                      />
                      <View style={styles.rowTextCol}>
                        <Text style={styles.rowTitle} numberOfLines={1}>
                          {item.song.title}
                        </Text>
                        <Text style={styles.rowArtist} numberOfLines={1}>
                          {item.song.artist}
                        </Text>
                        <Text style={styles.rowMeta} numberOfLines={1}>
                          {item.song.album ? `${item.song.album} • ` : ''}
                          {formatRelativeTime(item.played_at)}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={[
                          styles.rowFavBtn,
                          saved && styles.rowFavBtnActive,
                        ]}
                        onPress={() => toggleFavoriteSong(item.song)}
                      >
                        <Ionicons
                          name={saved ? 'heart' : 'heart-outline'}
                          size={18}
                          color={saved ? THEME.primaryLight : THEME.textSecondary}
                        />
                      </TouchableOpacity>
                    </View>
                  );
                }}
                ListEmptyComponent={
                  <View style={styles.emptyBox}>
                    <Text style={styles.emptyTitle}>
                      Loading recent track history...
                    </Text>
                  </View>
                }
              />
            </View>
          )}

          {/* TAB 3: SAVED FAVORITES */}
          {activeTab === 'favorites' && (
            <View style={styles.tabPanel}>
              <View style={styles.panelHeader}>
                <View style={styles.panelHeaderTextCol}>
                  <Text style={styles.panelTitle} numberOfLines={1}>
                    Saved Tracks ({favorites.length})
                  </Text>
                  <Text style={styles.panelSub} numberOfLines={1}>
                    Your bookmarked Limbik Frequencies selections
                  </Text>
                </View>
                {favorites.length > 0 ? (
                  <TouchableOpacity
                    style={styles.refreshBtn}
                    onPress={() => {
                      const summary = favorites
                        .map((f) => `• ${f.artist} - ${f.title}`)
                        .join('\n');
                      Share.share({
                        message: `My Limbik Frequencies Favorites:\n${summary}`,
                      }).catch(() => {});
                    }}
                  >
                    <Ionicons
                      name="share-outline"
                      size={14}
                      color={THEME.primaryLight}
                    />
                    <Text style={styles.refreshBtnText}>Export</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              {favorites.length > 0 ? (
                <View style={styles.searchBarWrap}>
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Filter saved tracks..."
                    placeholderTextColor={THEME.textMuted}
                    value={favoritesFilter}
                    onChangeText={setFavoritesFilter}
                  />
                </View>
              ) : null}

              <FlatList
                data={filteredFavorites}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContainer}
                renderItem={({ item }) => (
                  <View style={styles.trackRowCard}>
                    <Image
                      source={
                        item.art ? { uri: item.art } : fallbackLogoAsset
                      }
                      style={styles.rowArt}
                    />
                    <View style={styles.rowTextCol}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={styles.rowArtist} numberOfLines={1}>
                        {item.artist}
                      </Text>
                      {item.album ? (
                        <Text style={styles.rowMeta} numberOfLines={1}>
                          {item.album}
                        </Text>
                      ) : null}
                    </View>
                    <TouchableOpacity
                      style={styles.rowShareBtn}
                      onPress={() => handleShareTrack(item.artist, item.title)}
                    >
                      <Ionicons
                        name="share-outline"
                        size={16}
                        color={THEME.textSecondary}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.rowFavBtn}
                      onPress={() => removeFavoriteById(item.id)}
                    >
                      <Ionicons
                        name="close"
                        size={17}
                        color={THEME.textSecondary}
                      />
                    </TouchableOpacity>
                  </View>
                )}
                ListEmptyComponent={
                  <View style={styles.emptyBox}>
                    <Text style={styles.emptyTitle}>No saved tracks yet</Text>
                    <Text style={styles.emptySub}>
                      Tap Save on the Now Playing screen or in Song History to bookmark tracks you love.
                    </Text>
                  </View>
                }
              />
            </View>
          )}

          {/* TAB 4: SONG REQUESTS CATALOG */}
          {activeTab === 'request' && (
            <View style={styles.tabPanel}>
              <View style={styles.panelHeader}>
                <View style={styles.panelHeaderTextCol}>
                  <Text style={styles.panelTitle} numberOfLines={1}>
                    Request a Track
                  </Text>
                  <Text style={styles.panelSub} numberOfLines={1}>
                    Search 3,400+ tracks in the Limbik vault
                  </Text>
                </View>
              </View>

              <View style={styles.searchBarRow}>
                <TextInput
                  style={[styles.searchInput, { flex: 1 }]}
                  placeholder="Search artist or title..."
                  placeholderTextColor={THEME.textMuted}
                  value={requestQuery}
                  onChangeText={setRequestQuery}
                  onSubmitEditing={() => loadRequestsCatalog(requestQuery)}
                  returnKeyType="search"
                />
                <TouchableOpacity
                  style={styles.searchSubmitBtn}
                  onPress={() => loadRequestsCatalog(requestQuery)}
                >
                  <Ionicons name="search" size={16} color="#FFFFFF" />
                </TouchableOpacity>
              </View>

              {requestStatusMsg ? (
                <View style={styles.statusToast}>
                  <Text style={styles.statusToastText}>
                    {requestStatusMsg}
                  </Text>
                </View>
              ) : null}

              {loadingRequests ? (
                <View style={styles.emptyBox}>
                  <ActivityIndicator color={THEME.primary} size="large" />
                  <Text style={[styles.emptySub, { marginTop: 12 }]}>
                    Searching Limbik Frequencies catalog...
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={requestItems}
                  keyExtractor={(item) => item.request_id}
                  contentContainerStyle={styles.listContainer}
                  renderItem={({ item }) => {
                    const busy = requestSubmittingId === item.request_id;
                    return (
                      <View style={styles.trackRowCard}>
                        <Image
                          source={
                            item.song.art
                              ? { uri: item.song.art }
                              : fallbackLogoAsset
                          }
                          style={styles.rowArt}
                        />
                        <View style={styles.rowTextCol}>
                          <Text style={styles.rowTitle} numberOfLines={1}>
                            {item.song.title}
                          </Text>
                          <Text style={styles.rowArtist} numberOfLines={1}>
                            {item.song.artist}
                          </Text>
                          {item.song.album ? (
                            <Text style={styles.rowMeta} numberOfLines={1}>
                              {item.song.album}
                            </Text>
                          ) : null}
                        </View>
                        <TouchableOpacity
                          style={styles.requestActionBtn}
                          onPress={() => handleRequestSong(item)}
                          disabled={busy}
                        >
                          {busy ? (
                            <ActivityIndicator color="#FFF" size="small" />
                          ) : (
                            <Text style={styles.requestActionText}>
                              REQUEST
                            </Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    );
                  }}
                  ListEmptyComponent={
                    <View style={styles.emptyBox}>
                      <Text style={styles.emptyTitle}>No matching tracks</Text>
                      <Text style={styles.emptySub}>
                        Try searching for another artist or track title.
                      </Text>
                    </View>
                  }
                />
              )}
            </View>
          )}

          {/* TAB 5: 4-BAND GRAPHICAL PARAMETRIC EQUALIZER */}
          {activeTab === 'eq' && (
            <EqualizerPanel
              settings={eqSettings}
              onToggleEnabled={handleToggleEqEnabled}
              onSelectPreset={handleSelectEqPreset}
              onSaveUserPreset={handleSaveUserPreset}
              onUpdateBand={handleUpdateEqBand}
            />
          )}
        </View>

        {/* Persistent Mini-Player Bar when viewing History / Favorites / Requests */}
        {activeTab !== 'player' && (
          <TouchableOpacity
            style={styles.miniPlayer}
            activeOpacity={0.9}
            onPress={() => setActiveTab('player')}
          >
            <Image
              source={
                currentSong?.art
                  ? { uri: currentSong.art }
                  : fallbackLogoAsset
              }
              style={styles.miniArt}
            />
            <View style={styles.miniMeta}>
              <Text style={styles.miniTitle} numberOfLines={1}>
                {currentSong?.title || STATION_CONFIG.name}
              </Text>
              <Text style={styles.miniSubtitle} numberOfLines={1}>
                {currentSong?.artist || STATION_CONFIG.tagline} • {quality}k MP3
              </Text>
            </View>
            <TouchableOpacity
              style={styles.miniPlayBtn}
              onPress={handleTogglePlay}
            >
              {isBuffering ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Ionicons
                  name={isPlaying ? 'stop' : 'play'}
                  size={18}
                  color="#FFFFFF"
                  style={!isPlaying ? { marginLeft: 2 } : undefined}
                />
              )}
            </TouchableOpacity>
          </TouchableOpacity>
        )}

        {/* Unobtrusive Google AdMob Adaptive Banner docked above Bottom Navigation */}
        <AdBanner />

        {/* Bottom Navigation Bar (Flat Monochromatic Vector Icons) */}
        <View style={styles.bottomNav}>
          {(
            [
              {
                key: 'player',
                icon: 'radio-outline',
                activeIcon: 'radio',
                label: 'Live',
              },
              {
                key: 'history',
                icon: 'time-outline',
                activeIcon: 'time',
                label: 'History',
              },
              {
                key: 'favorites',
                icon: 'heart-outline',
                activeIcon: 'heart',
                label: favorites.length ? `Saved (${favorites.length})` : 'Saved',
              },
              {
                key: 'request',
                icon: 'musical-notes-outline',
                activeIcon: 'musical-notes',
                label: 'Request',
              },
              {
                key: 'eq',
                icon: 'options-outline',
                activeIcon: 'options',
                label: 'EQ',
              },
            ] as Array<{
              key: TabKey;
              icon: keyof typeof Ionicons.glyphMap;
              activeIcon: keyof typeof Ionicons.glyphMap;
              label: string;
            }>
          ).map((tab) => {
            const active = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.navTab, active && styles.navTabActive]}
                onPress={() => setActiveTab(tab.key)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={active ? tab.activeIcon : tab.icon}
                  size={20}
                  color={active ? THEME.primaryLight : THEME.textMuted}
                />
                <Text
                  style={[
                    styles.navLabel,
                    active && styles.navLabelActive,
                  ]}
                  numberOfLines={1}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: '#0B0E14',
  },
  safeArea: {
    flex: 1,
    paddingTop: Platform.OS === 'android' ? RNStatusBar.currentHeight || 0 : 0,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#111520',
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
  },
  brandRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandTextCol: {
    flex: 1,
  },
  stationLogo: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  stationTitle: {
    color: THEME.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  taglineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  stationTagline: {
    flex: 1,
    color: THEME.textSecondary,
    fontSize: 11,
  },
  contentArea: {
    flex: 1,
  },
  playerScroll: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
  },
  playerCard: {
    backgroundColor: '#151A26',
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    gap: 15,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(33, 150, 243, 0.14)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  livePulseDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  livePillText: {
    color: THEME.primaryLight,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  genreBadgeText: {
    color: THEME.textMuted,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    maxWidth: 120,
  },
  heroArtworkContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 2,
  },
  artworkShadowBox: {
    borderRadius: 16,
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 18,
    elevation: 10,
    overflow: 'hidden',
  },
  requestBadge: {
    position: 'absolute',
    bottom: 10,
    left: 12,
    right: 12,
    backgroundColor: 'rgba(33, 150, 243, 0.92)',
    paddingVertical: 4,
    borderRadius: 6,
    alignItems: 'center',
  },
  requestBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  trackMetaBlock: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  songTitle: {
    color: THEME.textPrimary,
    fontSize: 21,
    fontWeight: '800',
    lineHeight: 26,
    textAlign: 'center',
  },
  songArtist: {
    color: THEME.primaryLight,
    fontSize: 16,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
  },
  songAlbum: {
    color: THEME.textMuted,
    fontSize: 13,
    marginTop: 3,
    textAlign: 'center',
  },
  progressSection: {
    width: '100%',
    gap: 6,
  },
  progressTrack: {
    width: '100%',
    height: 6,
    backgroundColor: '#262D3D',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: THEME.primary,
    borderRadius: 3,
  },
  timeLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  timeText: {
    color: THEME.textMuted,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(239, 83, 80, 0.18)',
    borderColor: THEME.liveRed,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 8,
  },
  errorBannerText: {
    color: '#FFCDD2',
    fontSize: 12,
    flex: 1,
  },
  errorRetryText: {
    color: '#FFF',
    fontWeight: '800',
    fontSize: 12,
  },
  transportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    width: '100%',
    paddingVertical: 2,
  },
  playButton: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: THEME.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  playButtonActive: {
    backgroundColor: THEME.primary,
  },
  sideActionButton: {
    minWidth: 68,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#1E2536',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  sideActionButtonFavorited: {
    borderColor: THEME.primary,
    backgroundColor: 'rgba(33, 150, 243, 0.14)',
  },
  sideActionLabel: {
    color: THEME.textMuted,
    fontSize: 10,
    fontWeight: '600',
    marginTop: 3,
  },
  qualitySegment: {
    width: '100%',
    flexDirection: 'row',
    backgroundColor: '#0E121B',
    borderRadius: 12,
    padding: 4,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  qualityTab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qualityTabSelected: {
    backgroundColor: '#253047',
    borderWidth: 1,
    borderColor: THEME.primary,
  },
  qualityTabText: {
    color: THEME.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  qualityTabTextSelected: {
    color: '#FFFFFF',
  },
  upNextCard: {
    backgroundColor: '#151A26',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    gap: 10,
  },
  upNextHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  upNextLabel: {
    color: THEME.primaryLight,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.7,
  },
  upNextFavBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  upNextFavIcon: {
    color: THEME.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  upNextBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  upNextArt: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#000',
  },
  upNextTextCol: {
    flex: 1,
  },
  upNextTitle: {
    color: THEME.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  upNextArtist: {
    color: THEME.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  tabPanel: {
    flex: 1,
    backgroundColor: '#0B0E14',
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
    gap: 10,
  },
  panelHeaderTextCol: {
    flex: 1,
  },
  panelTitle: {
    color: THEME.textPrimary,
    fontSize: 17,
    fontWeight: '700',
  },
  panelSub: {
    color: THEME.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#1C2230',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  refreshBtnText: {
    color: THEME.primaryLight,
    fontSize: 12,
    fontWeight: '700',
  },
  searchBarWrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  searchBarRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 8,
  },
  searchInput: {
    backgroundColor: '#151A26',
    color: THEME.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: THEME.border,
    fontSize: 13,
  },
  searchSubmitBtn: {
    backgroundColor: THEME.primary,
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  statusToast: {
    marginHorizontal: 16,
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(33, 150, 243, 0.2)',
    borderWidth: 1,
    borderColor: THEME.primary,
  },
  statusToastText: {
    color: '#FFF',
    fontSize: 12,
  },
  listContainer: {
    padding: 14,
    gap: 10,
  },
  trackRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#151A26',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    gap: 10,
  },
  historyIndex: {
    color: THEME.textMuted,
    fontSize: 12,
    width: 18,
    textAlign: 'center',
    fontWeight: '700',
  },
  rowArt: {
    width: 46,
    height: 46,
    borderRadius: 8,
    backgroundColor: '#000',
  },
  rowTextCol: {
    flex: 1,
  },
  rowTitle: {
    color: THEME.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  rowArtist: {
    color: THEME.textSecondary,
    fontSize: 12,
    marginTop: 1,
  },
  rowMeta: {
    color: THEME.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  rowShareBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#1E2536',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowFavBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#1E2536',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowFavBtnActive: {
    backgroundColor: 'rgba(33, 150, 243, 0.14)',
  },
  requestActionBtn: {
    backgroundColor: THEME.primary,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 72,
    alignItems: 'center',
  },
  requestActionText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '800',
  },
  emptyBox: {
    padding: 32,
    alignItems: 'center',
  },
  emptyTitle: {
    color: THEME.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  emptySub: {
    color: THEME.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 19,
  },
  miniPlayer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#151A26',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: THEME.border,
    gap: 10,
  },
  miniArt: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#000',
  },
  miniMeta: {
    flex: 1,
  },
  miniTitle: {
    color: THEME.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  miniSubtitle: {
    color: THEME.textSecondary,
    fontSize: 11,
    marginTop: 1,
  },
  miniPlayBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: THEME.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: '#111520',
    borderTopWidth: 1,
    borderTopColor: THEME.border,
    paddingVertical: 6,
  },
  navTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 4,
    gap: 3,
  },
  navTabActive: {
    borderTopWidth: 2,
    borderTopColor: THEME.primary,
  },
  navLabel: {
    color: THEME.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  navLabelActive: {
    color: THEME.primaryLight,
    fontWeight: '700',
  },
});
