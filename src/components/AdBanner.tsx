import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { THEME } from '../constants/station';

/**
 * Web preview implementation of AdBanner.
 * Native iOS & Android builds automatically resolve AdBanner.native.tsx.
 */
export const AdBanner: React.FC = () => {
  return (
    <View style={styles.container}>
      <View style={styles.previewBox}>
        <Text style={styles.previewBadge}>AD</Text>
        <Text style={styles.previewText} numberOfLines={1}>
          Google AdMob Adaptive Banner (Native Build Only)
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0B0E14',
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
    paddingVertical: 2,
  },
  previewBox: {
    width: '100%',
    maxWidth: 360,
    height: 48,
    borderRadius: 6,
    backgroundColor: '#111520',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderStyle: 'dashed',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  previewBadge: {
    color: THEME.textMuted,
    fontSize: 9,
    fontWeight: '800',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  previewText: {
    color: THEME.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
});
