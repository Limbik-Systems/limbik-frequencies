const {
  withInfoPlist,
  withEntitlementsPlist,
  withAndroidManifest,
  withDangerousMod,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo Config Plugin that configures:
 * 1. iOS Background Audio + CarPlay Audio Entitlements (`com.apple.developer.carplay-audio`)
 * 2. Android Auto (`com.google.android.gms.car.application` meta-data + `res/xml/automotive_app_desc.xml`)
 * 3. Android Foreground Media Playback Service permissions
 */
function withCarPlayAndAndroidAuto(config) {
  // 1. iOS Info.plist: Ensure UIBackgroundModes includes 'audio'
  config = withInfoPlist(config, (mod) => {
    const existingModes = Array.isArray(mod.modResults.UIBackgroundModes)
      ? mod.modResults.UIBackgroundModes
      : [];
    if (!existingModes.includes('audio')) {
      existingModes.push('audio');
    }
    mod.modResults.UIBackgroundModes = existingModes;
    return mod;
  });

  // 2. iOS Entitlements: CarPlay Audio entitlement
  config = withEntitlementsPlist(config, (mod) => {
    mod.modResults['com.apple.developer.carplay-audio'] = true;
    return mod;
  });

  // 3. Android Manifest: Add Android Auto meta-data & foreground media permissions
  config = withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    if (!manifest['uses-permission']) {
      manifest['uses-permission'] = [];
    }

    const requiredPermissions = [
      'android.permission.INTERNET',
      'android.permission.WAKE_LOCK',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
    ];

    for (const perm of requiredPermissions) {
      const exists = manifest['uses-permission'].some(
        (p) => p.$ && p.$['android:name'] === perm
      );
      if (!exists) {
        manifest['uses-permission'].push({
          $: { 'android:name': perm },
        });
      }
    }

    const mainApplication = manifest.application && manifest.application[0];
    if (mainApplication) {
      if (!mainApplication['meta-data']) {
        mainApplication['meta-data'] = [];
      }
      const hasCarMeta = mainApplication['meta-data'].some(
        (m) =>
          m.$ &&
          m.$['android:name'] === 'com.google.android.gms.car.application'
      );
      if (!hasCarMeta) {
        mainApplication['meta-data'].push({
          $: {
            'android:name': 'com.google.android.gms.car.application',
            'android:resource': '@xml/automotive_app_desc',
          },
        });
      }
    }

    return mod;
  });

  // 4. Android XML resource: Create res/xml/automotive_app_desc.xml for Android Auto media support
  config = withDangerousMod(config, [
    'android',
    async (mod) => {
      const xmlDir = path.join(
        mod.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'xml'
      );
      fs.mkdirSync(xmlDir, { recursive: true });
      const xmlFile = path.join(xmlDir, 'automotive_app_desc.xml');
      const xmlContent = `<?xml version="1.0" encoding="utf-8"?>
<automotiveApp>
    <uses name="media" />
</automotiveApp>
`;
      fs.writeFileSync(xmlFile, xmlContent, 'utf8');
      return mod;
    },
  ]);

  return config;
}

module.exports = withCarPlayAndAndroidAuto;
