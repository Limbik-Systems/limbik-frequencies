import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { THEME } from '../constants/station';
import { PlaybackStatusState } from '../services/audioEngine';

interface AudioMeterProps {
  playbackState: PlaybackStatusState;
  bitrateLabel: string;
}

const BAR_COUNT = 26;

export const AudioMeter: React.FC<AudioMeterProps> = ({
  playbackState,
  bitrateLabel,
}) => {
  const barValues = useRef<Animated.Value[]>(
    Array.from({ length: BAR_COUNT }, () => new Animated.Value(0.12))
  ).current;

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    let phase = 0;

    if (playbackState === 'playing') {
      const updateBars = () => {
        phase += 0.35;
        const animations = barValues.map((val, idx) => {
          // Organic multi-band spectrum motion with subtle center-weighted energy
          const centerBias = 1 - Math.abs(idx - BAR_COUNT / 2) / (BAR_COUNT * 0.75);
          const wave =
            Math.sin(phase + idx * 0.55) * 0.25 +
            Math.cos(phase * 1.4 - idx * 0.35) * 0.2;
          const jitter = Math.random() * 0.45;
          const target = Math.min(
            1,
            Math.max(0.14, (0.28 + wave + jitter) * Math.max(0.55, centerBias))
          );

          return Animated.timing(val, {
            toValue: target,
            duration: 110,
            useNativeDriver: false,
          });
        });
        Animated.parallel(animations).start();
      };

      updateBars();
      timer = setInterval(updateBars, 120);
    } else if (playbackState === 'buffering') {
      const pulse = () => {
        phase += 0.45;
        const animations = barValues.map((val, idx) => {
          const target = 0.16 + ((Math.sin(phase - idx * 0.35) + 1) / 2) * 0.24;
          return Animated.timing(val, {
            toValue: target,
            duration: 160,
            useNativeDriver: false,
          });
        });
        Animated.parallel(animations).start();
      };

      pulse();
      timer = setInterval(pulse, 170);
    } else {
      const resetAnimations = barValues.map((val) =>
        Animated.timing(val, {
          toValue: 0.1,
          duration: 220,
          useNativeDriver: false,
        })
      );
      Animated.parallel(resetAnimations).start();
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [playbackState, barValues]);

  const isPlaying = playbackState === 'playing';
  const isBuffering = playbackState === 'buffering';

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
              ? 'AUDIO SIGNAL'
              : isBuffering
              ? 'SYNCING STREAM'
              : 'SIGNAL STANDBY'}
          </Text>
        </View>
        <Text style={styles.bitrateText}>{bitrateLabel}</Text>
      </View>

      <View style={styles.barsRow}>
        {barValues.map((animVal, idx) => {
          const height = animVal.interpolate({
            inputRange: [0, 1],
            outputRange: [3, 24],
          });

          return (
            <Animated.View
              key={idx}
              style={[
                styles.bar,
                {
                  height,
                  backgroundColor: isPlaying
                    ? idx > BAR_COUNT * 0.8
                      ? THEME.primaryLight
                      : THEME.primary
                    : isBuffering
                    ? 'rgba(120, 184, 239, 0.45)'
                    : '#262D3D',
                },
              ]}
            />
          );
        })}
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
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    gap: 8,
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
    height: 24,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 3,
  },
  bar: {
    flex: 1,
    borderRadius: 2,
    minHeight: 3,
  },
});
