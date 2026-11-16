import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { getBannerAdUnitId } from '../constants/ads';
import { THEME } from '../constants/station';

type GoogleMobileAdsModule = typeof import('react-native-google-mobile-ads');

let cachedAdsModule: GoogleMobileAdsModule | null = null;
let adsInitialized = false;

function getAdsModuleSafely(): GoogleMobileAdsModule | null {
  if (Platform.OS === 'web') return null;
  // Expo Go does not include react-native-google-mobile-ads native binary
  if (Constants.appOwnership === 'expo') return null;
  if (cachedAdsModule) return cachedAdsModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cachedAdsModule = require('react-native-google-mobile-ads') as GoogleMobileAdsModule;
    return cachedAdsModule;
  } catch {
    return null;
  }
}

export const AdBanner: React.FC = () => {
  const [adFailed, setAdFailed] = useState(false);
  const [ready, setReady] = useState(adsInitialized);
  const adsModule = getAdsModuleSafely();

  useEffect(() => {
    if (!adsModule || adsInitialized) return;
    adsModule
      .default()
      .initialize()
      .then(() => {
        adsInitialized = true;
        setReady(true);
      })
      .catch(() => {
        setReady(true);
      });
  }, [adsModule]);

  // Show a 50px layout preview on Web / Expo Go where native AdMob SDK is unavailable
  if (!adsModule) {
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
  }

  if (!ready || adFailed) {
    return null;
  }

  const { BannerAd, BannerAdSize } = adsModule;

  return (
    <View style={styles.container}>
      <BannerAd
        unitId={getBannerAdUnitId()}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{
          requestNonPersonalizedAdsOnly: true,
        }}
        onAdFailedToLoad={() => setAdFailed(true)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0B0E14',
    borderTopWidth: 1,
    borderTopColor: THEME.border,
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
