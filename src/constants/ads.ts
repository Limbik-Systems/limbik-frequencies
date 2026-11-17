import { Platform } from 'react-native';

/**
 * Google AdMob Banner Unit IDs.
 * Currently configured with Google's official test banner unit IDs so TestFlight
 * and preview builds display safe test ads without policy risk.
 * Replace IOS_BANNER_UNIT_ID and ANDROID_BANNER_UNIT_ID with your live AdMob
 * unit IDs (and update iosAppId / androidAppId in app.json) before App Store release.
 */
export const ADMOB_CONFIG = {
  IOS_BANNER_UNIT_ID: 'ca-app-pub-7759892583400316/6579088775',
  ANDROID_BANNER_UNIT_ID: 'ca-app-pub-7759892583400316/6785817385',
};

export function getBannerAdUnitId(): string {
  return Platform.OS === 'ios'
    ? ADMOB_CONFIG.IOS_BANNER_UNIT_ID
    : ADMOB_CONFIG.ANDROID_BANNER_UNIT_ID;
}
