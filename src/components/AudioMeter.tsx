import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { THEME } from '../constants/station';
import { PlaybackStatusState, SPECTRUM_BAND_COUNT } from '../services/audioEngine';

interface AudioMeterProps {
  playbackState: PlaybackStatusState;
  bitrateLabel: string;
  bands: number[];
}

export const AudioMeter: React.FC<AudioMeterProps> = ({
  playbackState,
  bitrateLabel,
  bands,
}) => {
  const isPlaying = playbackState === 'playing';
  const isBuffering = playbackState === 'buffering';
  const displayBands =
    bands.length === SPECTRUM_BAND_COUNT
      ? bands
      : Array(SPECTRUM_BAND_COUNT).fill(0.06);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.labelGroup}>
          <Ionicons
            name="pulse-outline"
            size={14}
            color={isPlaying ? THEME.primaryLight : THEME.textMuted}
          />
          <Text style={styles.labelText}>
            {isPlaying
              ? 'SPECTRUM ANALYZER'
              : isBuffering
              ? 'SYNCING STREAM'
              : 'SIGNAL STANDBY'}
          </Text>
        </View>
        <Text style={styles.bitrateText}>{bitrateLabel}</Text>
      </View>

      <View style={styles.barsRow}>
        {displayBands.map((level, idx) => {
          const clamped = Math.max(0.06, Math.min(1, level));
          const barHeight = isPlaying
            ? Math.round(4 + clamped * 80)
            : isBuffering
            ? 10
            : 4;

          return (
            <View
              key={idx}
              style={[
                styles.bar,
                {
                  height: barHeight,
                  backgroundColor: isPlaying
                    ? clamped > 0.72
                      ? '#FFFFFF'
                      : idx > SPECTRUM_BAND_COUNT * 0.75
                      ? THEME.primaryLight
                      : THEME.primary
                    : isBuffering
                    ? 'rgba(120, 184, 239, 0.4)'
                    : '#262D3D',
                },
              ]}
            />
          );
        })}
      </View>

      <View style={styles.freqScaleRow}>
        <Text style={styles.freqLabel}>45 Hz</Text>
        <Text style={styles.freqLabel}>1 kHz</Text>
        <Text style={styles.freqLabel}>16 kHz</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: '#0E121B',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  labelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  labelText: {
    color: THEME.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.7,
  },
  bitrateText: {
    color: THEME.textMuted,
    fontSize: 10,
    fontWeight: '600',
  },
  barsRow: {
    height: 84,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 3,
  },
  bar: {
    flex: 1,
    borderRadius: 2,
    minHeight: 4,
  },
  freqScaleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  freqLabel: {
    color: 'rgba(222, 226, 230, 0.42)',
    fontSize: 9,
    fontWeight: '600',
  },
});
