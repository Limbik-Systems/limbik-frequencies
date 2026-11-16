import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
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

  if (!adsModule || !ready || adFailed) {
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
});
