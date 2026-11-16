import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EQ_BANDS, EQ_PRESETS, THEME } from '../constants/station';
import { EqPresetId, EqSettings } from '../types/radio';

interface EqualizerPanelProps {
  settings: EqSettings;
  onToggleEnabled: () => void;
  onSelectPreset: (presetId: Exclude<EqPresetId, 'custom'>) => void;
  onChangeBandGain: (bandIndex: number, nextGain: number) => void;
}

const PRESET_KEYS: Array<Exclude<EqPresetId, 'custom'>> = [
  'flat',
  'warm_bass',
  'idm_crisp',
  'late_night',
  'club',
];

export const EqualizerPanel: React.FC<EqualizerPanelProps> = ({
  settings,
  onToggleEnabled,
  onSelectPreset,
  onChangeBandGain,
}) => {
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTextCol}>
          <Text style={styles.title} numberOfLines={1}>
            5-Band Equalizer
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            Real-time DSP audio shaping (-12 dB to +12 dB)
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
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionLabel}>PRESETS</Text>
            {settings.presetId === 'custom' ? (
              <Text style={styles.customBadge}>CUSTOM</Text>
            ) : null}
          </View>
          <View style={styles.presetsGrid}>
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

        {/* 5-Band Parametric Sliders */}
        <View
          style={[
            styles.bandsCard,
            !settings.enabled && styles.bandsCardDisabled,
          ]}
        >
          <View style={styles.bandsRow}>
            {EQ_BANDS.map((band) => {
              const gain = settings.gains[band.index] ?? 0;
              // Map -12..+12 -> 0%..100%
              const ratio = (gain + 12) / 24;

              return (
                <View key={band.index} style={styles.bandCol}>
                  <Text style={styles.gainValueText}>
                    {gain > 0 ? `+${gain}` : `${gain}`} dB
                  </Text>

                  <TouchableOpacity
                    style={styles.stepBtn}
                    onPress={() =>
                      onChangeBandGain(band.index, Math.min(12, gain + 1))
                    }
                    disabled={!settings.enabled}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="add"
                      size={16}
                      color={THEME.textSecondary}
                    />
                  </TouchableOpacity>

                  {/* Visual Vertical Meter Track */}
                  <View style={styles.sliderTrack}>
                    <View style={styles.zeroLine} />
                    <View
                      style={[
                        styles.sliderFill,
                        {
                          height: `${Math.round(ratio * 100)}%`,
                          backgroundColor: settings.enabled
                            ? THEME.primary
                            : '#363B47',
                        },
                      ]}
                    />
                    <View
                      style={[
                        styles.sliderThumb,
                        {
                          bottom: `${Math.round(ratio * 100)}%`,
                          backgroundColor: settings.enabled
                            ? '#FFFFFF'
                            : THEME.textMuted,
                        },
                      ]}
                    />
                  </View>

                  <TouchableOpacity
                    style={styles.stepBtn}
                    onPress={() =>
                      onChangeBandGain(band.index, Math.max(-12, gain - 1))
                    }
                    disabled={!settings.enabled}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="remove"
                      size={16}
                      color={THEME.textSecondary}
                    />
                  </TouchableOpacity>

                  <Text style={styles.freqLabel} numberOfLines={1}>
                    {band.label}
                  </Text>
                </View>
              );
            })}
          </View>

          <TouchableOpacity
            style={styles.resetFlatBtn}
            onPress={() => onSelectPreset('flat')}
            activeOpacity={0.8}
          >
            <Ionicons
              name="refresh-outline"
              size={14}
              color={THEME.primaryLight}
            />
            <Text style={styles.resetFlatText}>Reset All Bands to 0 dB</Text>
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
    paddingVertical: 12,
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
    padding: 16,
    gap: 14,
  },
  sectionCard: {
    backgroundColor: '#151A26',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 10,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionLabel: {
    color: THEME.primaryLight,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.7,
  },
  customBadge: {
    color: THEME.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  presetsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetChip: {
    backgroundColor: '#0E121B',
    paddingHorizontal: 12,
    paddingVertical: 8,
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
    fontSize: 12,
    fontWeight: '700',
  },
  presetChipTextActive: {
    color: '#FFFFFF',
  },
  bandsCard: {
    backgroundColor: '#151A26',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 16,
  },
  bandsCardDisabled: {
    opacity: 0.55,
  },
  bandsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  bandCol: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  gainValueText: {
    color: THEME.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
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
  sliderTrack: {
    width: 12,
    height: 150,
    backgroundColor: '#0E121B',
    borderRadius: 6,
    justifyContent: 'flex-end',
    alignItems: 'center',
    position: 'relative',
    overflow: 'visible',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  zeroLine: {
    position: 'absolute',
    top: '50%',
    left: -5,
    right: -5,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  sliderFill: {
    width: '100%',
    borderRadius: 6,
  },
  sliderThumb: {
    position: 'absolute',
    width: 20,
    height: 10,
    borderRadius: 5,
    marginBottom: -5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
  },
  freqLabel: {
    color: THEME.textMuted,
    fontSize: 11,
    fontWeight: '700',
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
  },
  resetFlatText: {
    color: THEME.primaryLight,
    fontSize: 12,
    fontWeight: '700',
  },
});
