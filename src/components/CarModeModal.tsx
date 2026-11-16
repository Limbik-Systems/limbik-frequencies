import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { STATION_CONFIG, THEME } from '../constants/station';
import {
  FavoriteTrack,
  NowPlayingResponse,
  StreamQuality,
} from '../types/radio';
import { PlaybackStatusState } from '../services/audioEngine';
import { buildCarMediaTree } from '../services/carIntegration';

interface CarModeModalProps {
  visible: boolean;
  onClose: () => void;
  nowPlaying: NowPlayingResponse | null;
  playbackState: PlaybackStatusState;
  quality: StreamQuality;
  isCurrentFavorite: boolean;
  favorites: FavoriteTrack[];
  onTogglePlay: () => void;
  onSelectQuality: (q: StreamQuality) => void;
  onToggleCurrentFavorite: () => void;
}

export const CarModeModal: React.FC<CarModeModalProps> = ({
  visible,
  onClose,
  nowPlaying,
  playbackState,
  quality,
  isCurrentFavorite,
  favorites,
  onTogglePlay,
  onSelectQuality,
  onToggleCurrentFavorite,
}) => {
  const song = nowPlaying?.now_playing?.song;
  const artUri = song?.art || STATION_CONFIG.defaultArtworkUrl;
  const isPlaying = playbackState === 'playing';
  const isBuffering = playbackState === 'buffering';

  const carTree = buildCarMediaTree(nowPlaying, quality, favorites);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        {/* Top Header */}
        <View style={styles.header}>
          <View style={styles.headerBadge}>
            <View
              style={[
                styles.liveDot,
                { backgroundColor: isPlaying ? THEME.accentGreen : THEME.primary },
              ]}
            />
            <Text style={styles.headerBadgeText} numberOfLines={1}>
              {carTree.platformLabel.toUpperCase()}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.exitButton}
            onPress={onClose}
            activeOpacity={0.8}
          >
            <Text style={styles.exitButtonText}>EXIT</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Main Now Playing Card */}
          <View style={styles.heroCard}>
            <Image source={{ uri: artUri }} style={styles.heroArt} />
            <View style={styles.heroMeta}>
              <Text style={styles.stationSubtitle} numberOfLines={1}>
                {STATION_CONFIG.name} • {quality} kbps
              </Text>
              <Text style={styles.trackTitle} numberOfLines={2}>
                {song?.title || STATION_CONFIG.name}
              </Text>
              <Text style={styles.trackArtist} numberOfLines={1}>
                {song?.artist || STATION_CONFIG.tagline}
              </Text>
              {song?.album ? (
                <Text style={styles.trackAlbum} numberOfLines={1}>
                  {song.album}
                </Text>
              ) : null}
            </View>
          </View>

          {/* Giant Touch Targets for Safe In-Car Operation */}
          <View style={styles.controlsGrid}>
            <TouchableOpacity
              style={[
                styles.bigPlayButton,
                isPlaying && styles.bigPlayButtonActive,
              ]}
              onPress={onTogglePlay}
              activeOpacity={0.85}
            >
              <Text style={styles.bigPlayIcon}>
                {isBuffering ? '⏳' : isPlaying ? '⏹' : '▶'}
              </Text>
              <Text style={styles.bigPlayLabel} numberOfLines={1}>
                {isBuffering
                  ? 'CONNECTING'
                  : isPlaying
                  ? 'STOP STREAM'
                  : 'PLAY LIVE'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.bigSecondaryButton,
                isCurrentFavorite && styles.bigFavoriteActive,
              ]}
              onPress={onToggleCurrentFavorite}
              activeOpacity={0.85}
            >
              <Text style={styles.bigSecondaryIcon}>
                {isCurrentFavorite ? '♥' : '♡'}
              </Text>
              <Text style={styles.bigSecondaryLabel} numberOfLines={1}>
                {isCurrentFavorite ? 'SAVED' : 'FAVORITE'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Stream Bitrate Selector (Oversized Buttons) */}
          <View style={styles.qualityRow}>
            {(['320', '128'] as StreamQuality[]).map((q) => {
              const active = quality === q;
              return (
                <TouchableOpacity
                  key={q}
                  style={[
                    styles.qualityBigButton,
                    active && styles.qualityBigButtonActive,
                  ]}
                  onPress={() => onSelectQuality(q)}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.qualityBigTitle,
                      active && styles.qualityBigTitleActive,
                    ]}
                    numberOfLines={1}
                  >
                    {q} kbps MP3
                  </Text>
                  <Text style={styles.qualityBigDesc} numberOfLines={1}>
                    {q === '320' ? 'High Fidelity' : 'Data Saver'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0E14',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
    gap: 12,
  },
  headerBadge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  headerBadgeText: {
    flex: 1,
    color: THEME.primaryLight,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  exitButton: {
    backgroundColor: THEME.surfaceControl,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
  },
  exitButtonText: {
    color: THEME.textPrimary,
    fontWeight: '700',
    fontSize: 13,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  heroCard: {
    alignItems: 'center',
    backgroundColor: '#161B26',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: THEME.border,
    gap: 14,
  },
  heroArt: {
    width: 150,
    height: 150,
    borderRadius: 14,
    backgroundColor: '#000',
  },
  heroMeta: {
    width: '100%',
    alignItems: 'center',
  },
  stationSubtitle: {
    color: THEME.primaryLight,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  trackTitle: {
    color: THEME.textPrimary,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 4,
  },
  trackArtist: {
    color: THEME.textSecondary,
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  trackAlbum: {
    color: THEME.textMuted,
    fontSize: 13,
    marginTop: 4,
    textAlign: 'center',
  },
  controlsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  bigPlayButton: {
    flex: 1.4,
    backgroundColor: THEME.primary,
    borderRadius: 16,
    paddingVertical: 22,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigPlayButtonActive: {
    backgroundColor: '#1976D2',
  },
  bigPlayIcon: {
    color: '#FFF',
    fontSize: 32,
    marginBottom: 4,
  },
  bigPlayLabel: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  bigSecondaryButton: {
    flex: 1,
    backgroundColor: '#1C2230',
    borderRadius: 16,
    paddingVertical: 22,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: THEME.border,
  },
  bigFavoriteActive: {
    borderColor: THEME.favoritePink,
    backgroundColor: 'rgba(255, 64, 129, 0.16)',
  },
  bigSecondaryIcon: {
    color: THEME.favoritePink,
    fontSize: 30,
    marginBottom: 4,
  },
  bigSecondaryLabel: {
    color: THEME.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  qualityRow: {
    flexDirection: 'row',
    gap: 12,
  },
  qualityBigButton: {
    flex: 1,
    backgroundColor: '#161B26',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 10,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
  },
  qualityBigButtonActive: {
    borderColor: THEME.primary,
    backgroundColor: 'rgba(33, 150, 243, 0.14)',
  },
  qualityBigTitle: {
    color: THEME.textSecondary,
    fontSize: 15,
    fontWeight: '800',
  },
  qualityBigTitleActive: {
    color: THEME.textPrimary,
  },
  qualityBigDesc: {
    color: THEME.textMuted,
    fontSize: 11,
    marginTop: 3,
  },
});
