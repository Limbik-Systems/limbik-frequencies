import React, { useMemo, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EQ_PRESETS, THEME } from '../constants/station';
import { EqBandConfig, EqPresetId, EqSettings } from '../types/radio';

interface EqualizerPanelProps {
  settings: EqSettings;
  onToggleEnabled: () => void;
  onSelectPreset: (presetId: Exclude<EqPresetId, 'custom'>) => void;
  onUpdateBand: (bandIndex: number, patch: Partial<EqBandConfig>) => void;
}

const PRESET_KEYS: Array<Exclude<EqPresetId, 'custom'>> = [
  'flat',
  'warm_bass',
  'idm_crisp',
  'late_night',
  'club',
];

const BAND_LABELS = ['Low Shelf', 'Peak 2', 'Peak 3', 'High Shelf'];
const MIN_FREQ = 30;
const MAX_FREQ = 16000;
const SAMPLE_RATE = 44100;
const CURVE_POINTS = 64;
const GRAPH_HEIGHT = 172;

function freqToNorm(freq: number): number {
  const clamped = Math.max(MIN_FREQ, Math.min(MAX_FREQ, freq));
  return Math.log(clamped / MIN_FREQ) / Math.log(MAX_FREQ / MIN_FREQ);
}

function normToFreq(norm: number): number {
  const clamped = Math.max(0, Math.min(1, norm));
  const raw = MIN_FREQ * Math.pow(MAX_FREQ / MIN_FREQ, clamped);
  if (raw < 100) return Math.round(raw);
  if (raw < 1000) return Math.round(raw / 5) * 5;
  return Math.round(raw / 50) * 50;
}

function formatFreq(freq: number): string {
  if (freq >= 1000) {
    const k = freq / 1000;
    return `${k >= 10 ? k.toFixed(0) : k.toFixed(1)} kHz`;
  }
  return `${Math.round(freq)} Hz`;
}

/**
 * Audio EQ Cookbook biquad magnitude response (dB) at frequency f
 * matching Web Audio BiquadFilterNode & Apple AVAudioUnitEQ.
 */
function evalBandDbAtFreq(
  f: number,
  band: EqBandConfig,
  bandIndex: number
): number {
  if (Math.abs(band.gain) < 0.01) return 0;
  const A = Math.pow(10, band.gain / 40);
  const w0 = (2 * Math.PI * band.freq) / SAMPLE_RATE;
  const w = (2 * Math.PI * f) / SAMPLE_RATE;
  const cosW0 = Math.cos(w0);
  const sinW0 = Math.sin(w0);
  const alpha = sinW0 / (2 * Math.max(0.3, band.q));

  let b0 = 1;
  let b1 = 0;
  let b2 = 0;
  let a0 = 1;
  let a1 = 0;
  let a2 = 0;

  if (bandIndex === 0) {
    // Low shelf
    const twoSqrtAAlpha = 2 * Math.sqrt(A) * alpha;
    b0 = A * (A + 1 - (A - 1) * cosW0 + twoSqrtAAlpha);
    b1 = 2 * A * (A - 1 - (A + 1) * cosW0);
    b2 = A * (A + 1 - (A - 1) * cosW0 - twoSqrtAAlpha);
    a0 = A + 1 + (A - 1) * cosW0 + twoSqrtAAlpha;
    a1 = -2 * (A - 1 + (A + 1) * cosW0);
    a2 = A + 1 + (A - 1) * cosW0 - twoSqrtAAlpha;
  } else if (bandIndex === 3) {
    // High shelf
    const twoSqrtAAlpha = 2 * Math.sqrt(A) * alpha;
    b0 = A * (A + 1 + (A - 1) * cosW0 + twoSqrtAAlpha);
    b1 = -2 * A * (A - 1 + (A + 1) * cosW0);
    b2 = A * (A + 1 + (A - 1) * cosW0 - twoSqrtAAlpha);
    a0 = A + 1 - (A - 1) * cosW0 + twoSqrtAAlpha;
    a1 = 2 * (A - 1 - (A + 1) * cosW0);
    a2 = A + 1 - (A - 1) * cosW0 - twoSqrtAAlpha;
  } else {
    // Peaking EQ
    b0 = 1 + alpha * A;
    b1 = -2 * cosW0;
    b2 = 1 - alpha * A;
    a0 = 1 + alpha / A;
    a1 = -2 * cosW0;
    a2 = 1 - alpha / A;
  }

  const cosW = Math.cos(w);
  const sinW = Math.sin(w);
  const cos2W = Math.cos(2 * w);
  const sin2W = Math.sin(2 * w);

  const numRe = b0 + b1 * cosW + b2 * cos2W;
  const numIm = -b1 * sinW - b2 * sin2W;
  const denRe = a0 + a1 * cosW + a2 * cos2W;
  const denIm = -a1 * sinW - a2 * sin2W;

  const mag2 = (numRe * numRe + numIm * numIm) / Math.max(1e-12, denRe * denRe + denIm * denIm);
  return 10 * Math.log10(Math.max(1e-12, mag2));
}

export const EqualizerPanel: React.FC<EqualizerPanelProps> = ({
  settings,
  onToggleEnabled,
  onSelectPreset,
  onUpdateBand,
}) => {
  const [selectedBand, setSelectedBand] = useState<number>(0);
  const [graphWidth, setGraphWidth] = useState<number>(300);
  const activeDragBandRef = useRef<number>(0);
  const settingsRef = useRef<EqSettings>(settings);
  settingsRef.current = settings;
  const graphWidthRef = useRef<number>(graphWidth);
  graphWidthRef.current = graphWidth;
  const onUpdateBandRef = useRef(onUpdateBand);
  onUpdateBandRef.current = onUpdateBand;

  const curveDbValues = useMemo(() => {
    const pts: number[] = [];
    for (let i = 0; i < CURVE_POINTS; i++) {
      const norm = i / (CURVE_POINTS - 1);
      const freq = MIN_FREQ * Math.pow(MAX_FREQ / MIN_FREQ, norm);
      let totalDb = 0;
      if (settings.enabled) {
        for (let b = 0; b < 4; b++) {
          totalDb += evalBandDbAtFreq(freq, settings.bands[b], b);
        }
      }
      pts.push(Math.max(-13.5, Math.min(13.5, totalDb)));
    }
    return pts;
  }, [settings]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const w = Math.max(1, graphWidthRef.current);
        const x = evt.nativeEvent.locationX;
        const y = evt.nativeEvent.locationY;

        // Pick nearest band node to touch point
        let bestIdx = 0;
        let bestDist = Infinity;
        settingsRef.current.bands.forEach((b, idx) => {
          const bx = freqToNorm(b.freq) * w;
          const by = ((12 - b.gain) / 24) * GRAPH_HEIGHT;
          const d = Math.hypot(x - bx, y - by);
          if (d < bestDist) {
            bestDist = d;
            bestIdx = idx;
          }
        });
        activeDragBandRef.current = bestIdx;
        setSelectedBand(bestIdx);

        if (settingsRef.current.enabled) {
          const nextFreq = normToFreq(x / w);
          const nextGain = Math.round(Math.max(-12, Math.min(12, 12 - (y / GRAPH_HEIGHT) * 24)) * 2) / 2;
          onUpdateBandRef.current(bestIdx, { freq: nextFreq, gain: nextGain });
        }
      },
      onPanResponderMove: (evt) => {
        if (!settingsRef.current.enabled) return;
        const w = Math.max(1, graphWidthRef.current);
        const x = Math.max(0, Math.min(w, evt.nativeEvent.locationX));
        const y = Math.max(0, Math.min(GRAPH_HEIGHT, evt.nativeEvent.locationY));
        const nextFreq = normToFreq(x / w);
        const nextGain = Math.round(Math.max(-12, Math.min(12, 12 - (y / GRAPH_HEIGHT) * 24)) * 2) / 2;
        onUpdateBandRef.current(activeDragBandRef.current, { freq: nextFreq, gain: nextGain });
      },
    })
  ).current;

  const activeBand = settings.bands[selectedBand] || settings.bands[0];

  const handleGraphLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0) setGraphWidth(w);
  };

  const stepFreq = (dir: -1 | 1) => {
    const curNorm = freqToNorm(activeBand.freq);
    const nextFreq = normToFreq(curNorm + dir * 0.035);
    onUpdateBand(selectedBand, { freq: nextFreq });
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTextCol}>
          <Text style={styles.title} numberOfLines={1}>
            4-Band Parametric EQ
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            Drag nodes on graph or fine-tune Freq, Gain & Q
          </Text>
        </View>

        <TouchableOpacity
          style={[
            styles.powerBtn,
            settings.enabled && styles.powerBtnActive,
          ]}
          onPress={onToggleEnabled}
          activeOpacity={0.8}
        >
          <Ionicons
            name="power"
            size={15}
            color={settings.enabled ? '#FFFFFF' : THEME.textMuted}
          />
          <Text
            style={[
              styles.powerBtnText,
              settings.enabled && styles.powerBtnTextActive,
            ]}
          >
            {settings.enabled ? 'ON' : 'BYPASS'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Presets Row */}
        <View style={styles.presetsCard}>
          <View style={styles.presetsScrollRow}>
            {PRESET_KEYS.map((key) => {
              const active = settings.presetId === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.presetChip,
                    active && styles.presetChipActive,
                  ]}
                  onPress={() => onSelectPreset(key)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.presetChipText,
                      active && styles.presetChipTextActive,
                    ]}
                    numberOfLines={1}
                  >
                    {EQ_PRESETS[key].label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Graphical Frequency Response Plot */}
        <View style={styles.graphCard}>
          <View
            style={styles.graphCanvas}
            onLayout={handleGraphLayout}
            {...panResponder.panHandlers}
          >
            {/* Horizontal Grid Lines (+6 dB, 0 dB, -6 dB) */}
            <View style={[styles.gridLineH, { top: '25%' }]} />
            <View style={[styles.gridLineHZero, { top: '50%' }]} />
            <View style={[styles.gridLineH, { top: '75%' }]} />

            {/* Vertical Frequency Grid Lines (100 Hz, 1 kHz, 10 kHz) */}
            {[100, 1000, 10000].map((f) => (
              <View
                key={f}
                style={[
                  styles.gridLineV,
                  { left: `${Math.round(freqToNorm(f) * 100)}%` },
                ]}
              />
            ))}

            {/* Combined Biquad Frequency Response Curve */}
            <View style={styles.curveRow} pointerEvents="none">
              {curveDbValues.map((db, idx) => {
                const centerY = GRAPH_HEIGHT / 2;
                const y = ((12 - db) / 24) * GRAPH_HEIGHT;
                const fillTop = Math.min(centerY, y);
                const fillHeight = Math.max(2, Math.abs(y - centerY));

                return (
                  <View key={idx} style={styles.curveCol}>
                    <View
                      style={[
                        styles.curveFill,
                        {
                          top: fillTop,
                          height: fillHeight,
                          backgroundColor: settings.enabled
                            ? 'rgba(33, 150, 243, 0.24)'
                            : 'rgba(120, 130, 150, 0.12)',
                        },
                      ]}
                    />
                    <View
                      style={[
                        styles.curveDot,
                        {
                          top: Math.max(0, Math.min(GRAPH_HEIGHT - 3, y - 1.5)),
                          backgroundColor: settings.enabled
                            ? THEME.primaryLight
                            : THEME.textMuted,
                        },
                      ]}
                    />
                  </View>
                );
              })}
            </View>

            {/* 4 Draggable Band Control Nodes */}
            {settings.bands.map((band, idx) => {
              const x = freqToNorm(band.freq) * graphWidth;
              const y = ((12 - band.gain) / 24) * GRAPH_HEIGHT;
              const isSelected = selectedBand === idx;
              return (
                <View
                  key={idx}
                  pointerEvents="none"
                  style={[
                    styles.bandNode,
                    {
                      left: Math.max(12, Math.min(graphWidth - 12, x)) - 13,
                      top: Math.max(12, Math.min(GRAPH_HEIGHT - 12, y)) - 13,
                      borderColor: isSelected ? '#FFFFFF' : THEME.primaryLight,
                      backgroundColor: isSelected ? THEME.primary : '#1A2333',
                    },
                  ]}
                >
                  <Text style={styles.bandNodeText}>{idx + 1}</Text>
                </View>
              );
            })}
          </View>

          <View style={styles.graphScaleRow}>
            <Text style={styles.graphScaleText}>30 Hz</Text>
            <Text style={styles.graphScaleText}>100 Hz</Text>
            <Text style={styles.graphScaleText}>1 kHz</Text>
            <Text style={styles.graphScaleText}>10 kHz</Text>
            <Text style={styles.graphScaleText}>16 kHz</Text>
          </View>
        </View>

        {/* 4 Band Selector Pills */}
        <View style={styles.bandTabsRow}>
          {settings.bands.map((band, idx) => {
            const active = selectedBand === idx;
            return (
              <TouchableOpacity
                key={idx}
                style={[styles.bandPill, active && styles.bandPillActive]}
                onPress={() => setSelectedBand(idx)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.bandPillTitle,
                    active && styles.bandPillTitleActive,
                  ]}
                  numberOfLines={1}
                >
                  {idx + 1} • {BAND_LABELS[idx]}
                </Text>
                <Text style={styles.bandPillMeta} numberOfLines={1}>
                  {formatFreq(band.freq)} • {band.gain > 0 ? `+${band.gain}` : band.gain} dB
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Selected Band Precision Controls: Gain, Frequency & Q */}
        <View
          style={[
            styles.controlsCard,
            !settings.enabled && styles.controlsCardDisabled,
          ]}
        >
          {/* GAIN */}
          <View style={styles.paramRow}>
            <View style={styles.paramHeader}>
              <Text style={styles.paramLabel}>GAIN</Text>
              <Text style={styles.paramValue}>
                {activeBand.gain > 0 ? `+${activeBand.gain.toFixed(1)}` : activeBand.gain.toFixed(1)} dB
              </Text>
            </View>
            <View style={styles.paramControlRow}>
              <TouchableOpacity
                style={styles.stepBtn}
                disabled={!settings.enabled}
                onPress={() =>
                  onUpdateBand(selectedBand, {
                    gain: Math.max(-12, Math.round((activeBand.gain - 0.5) * 2) / 2),
                  })
                }
              >
                <Ionicons name="remove" size={16} color={THEME.textSecondary} />
              </TouchableOpacity>

              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    { width: `${Math.round(((activeBand.gain + 12) / 24) * 100)}%` },
                  ]}
                />
              </View>

              <TouchableOpacity
                style={styles.stepBtn}
                disabled={!settings.enabled}
                onPress={() =>
                  onUpdateBand(selectedBand, {
                    gain: Math.min(12, Math.round((activeBand.gain + 0.5) * 2) / 2),
                  })
                }
              >
                <Ionicons name="add" size={16} color={THEME.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* FREQUENCY */}
          <View style={styles.paramRow}>
            <View style={styles.paramHeader}>
              <Text style={styles.paramLabel}>FREQUENCY</Text>
              <Text style={styles.paramValue}>{formatFreq(activeBand.freq)}</Text>
            </View>
            <View style={styles.paramControlRow}>
              <TouchableOpacity
                style={styles.stepBtn}
                disabled={!settings.enabled}
                onPress={() => stepFreq(-1)}
              >
                <Ionicons name="remove" size={16} color={THEME.textSecondary} />
              </TouchableOpacity>

              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    { width: `${Math.round(freqToNorm(activeBand.freq) * 100)}%` },
                  ]}
                />
              </View>

              <TouchableOpacity
                style={styles.stepBtn}
                disabled={!settings.enabled}
                onPress={() => stepFreq(1)}
              >
                <Ionicons name="add" size={16} color={THEME.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Q FACTOR */}
          <View style={styles.paramRow}>
            <View style={styles.paramHeader}>
              <Text style={styles.paramLabel}>Q (RESONANCE / WIDTH)</Text>
              <Text style={styles.paramValue}>{activeBand.q.toFixed(1)}</Text>
            </View>
            <View style={styles.paramControlRow}>
              <TouchableOpacity
                style={styles.stepBtn}
                disabled={!settings.enabled}
                onPress={() =>
                  onUpdateBand(selectedBand, {
                    q: Math.max(0.3, Math.round((activeBand.q - 0.1) * 10) / 10),
                  })
                }
              >
                <Ionicons name="remove" size={16} color={THEME.textSecondary} />
              </TouchableOpacity>

              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    { width: `${Math.round(((activeBand.q - 0.3) / 7.7) * 100)}%` },
                  ]}
                />
              </View>

              <TouchableOpacity
                style={styles.stepBtn}
                disabled={!settings.enabled}
                onPress={() =>
                  onUpdateBand(selectedBand, {
                    q: Math.min(8.0, Math.round((activeBand.q + 0.1) * 10) / 10),
                  })
                }
              >
                <Ionicons name="add" size={16} color={THEME.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={styles.resetFlatBtn}
            onPress={() => onSelectPreset('flat')}
            activeOpacity={0.8}
          >
            <Ionicons name="refresh-outline" size={14} color={THEME.primaryLight} />
            <Text style={styles.resetFlatText}>Reset All 4 Bands to Flat</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
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
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
    gap: 10,
  },
  headerTextCol: {
    flex: 1,
  },
  title: {
    color: THEME.textPrimary,
    fontSize: 17,
    fontWeight: '700',
  },
  subtitle: {
    color: THEME.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  powerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#1C2230',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  powerBtnActive: {
    backgroundColor: THEME.primary,
    borderColor: THEME.primary,
  },
  powerBtnText: {
    color: THEME.textMuted,
    fontSize: 12,
    fontWeight: '800',
  },
  powerBtnTextActive: {
    color: '#FFFFFF',
  },
  scrollContent: {
    padding: 14,
    gap: 12,
  },
  presetsCard: {
    backgroundColor: '#151A26',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  presetsScrollRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  presetChip: {
    backgroundColor: '#0E121B',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  presetChipActive: {
    backgroundColor: '#253047',
    borderColor: THEME.primary,
  },
  presetChipText: {
    color: THEME.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  presetChipTextActive: {
    color: '#FFFFFF',
  },
  graphCard: {
    backgroundColor: '#151A26',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 8,
  },
  graphCanvas: {
    height: GRAPH_HEIGHT,
    backgroundColor: '#0E121B',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    position: 'relative',
    overflow: 'hidden',
  },
  gridLineH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  gridLineHZero: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  gridLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  curveRow: {
    flex: 1,
    flexDirection: 'row',
  },
  curveCol: {
    flex: 1,
    height: GRAPH_HEIGHT,
    position: 'relative',
  },
  curveFill: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  curveDot: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 3,
    borderRadius: 1.5,
  },
  bandNode: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
    elevation: 4,
  },
  bandNodeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  graphScaleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  graphScaleText: {
    color: 'rgba(222, 226, 230, 0.45)',
    fontSize: 10,
    fontWeight: '600',
  },
  bandTabsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  bandPill: {
    width: '48.5%',
    backgroundColor: '#151A26',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  bandPillActive: {
    backgroundColor: '#1D273B',
    borderColor: THEME.primary,
  },
  bandPillTitle: {
    color: THEME.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  bandPillTitleActive: {
    color: '#FFFFFF',
  },
  bandPillMeta: {
    color: THEME.textMuted,
    fontSize: 11,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  controlsCard: {
    backgroundColor: '#151A26',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 12,
  },
  controlsCardDisabled: {
    opacity: 0.5,
  },
  paramRow: {
    gap: 6,
  },
  paramHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  paramLabel: {
    color: THEME.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  paramValue: {
    color: THEME.primaryLight,
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  paramControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stepBtn: {
    width: 34,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#1E2536',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  barTrack: {
    flex: 1,
    height: 8,
    backgroundColor: '#0E121B',
    borderRadius: 4,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  barFill: {
    height: '100%',
    backgroundColor: THEME.primary,
    borderRadius: 4,
  },
  resetFlatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#0E121B',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginTop: 2,
  },
  resetFlatText: {
    color: THEME.primaryLight,
    fontSize: 12,
    fontWeight: '700',
  },
});
