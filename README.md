# Limbik Frequencies — Native iOS & Android App

Official React Native (Expo) mobile application for **Limbik Frequencies (`limbikfreq.com`) — Radio Elektro[u]nique**.

## Features Included

1. **Background Audio & Lock-Screen / Notification Controls**
   - Configured via `expo-av` (`staysActiveInBackground: true`, `playsInSilentModeIOS: true`, `UIBackgroundModes: ["audio"]`, Android `FOREGROUND_SERVICE_MEDIA_PLAYBACK`) and MediaSession remote control handlers (`src/services/audioEngine.ts`, `src/services/carIntegration.ts`).
2. **Stream Quality Switcher (320 kbps vs 128 kbps MP3)**
   - Seamless live switching between `https://limbikfreq.com/listen/limbik_frequencies/320.mp3` (Audiophile HQ) and `https://limbikfreq.com/listen/limbik_frequencies/128.mp3` (Standard / Cellular) with persisted preference in `AsyncStorage`.
3. **Live "Now Playing" Metadata, Progress Bar & Album Artwork**
   - Real-time integration with `https://limbikfreq.com/api/nowplaying/limbik_frequencies`, displaying high-res cover art, track title, artist, album, live listener count, interpolated `mm:ss` progress bar, and "Up Next" track preview.
4. **Recently Played Track History & Saved Favorites**
   - Browse the station's recently broadcast tracks (`song_history`) with relative timestamps and bookmark any track (live, upcoming, or historical) to your persistent **Favorites** collection.
5. **Song Requests Catalog**
   - Search all 3,400+ requestable IDM, Glitch, Ambient, and Electronic tracks on `limbikfreq.com` (`GET /api/station/1/requests`) and submit instant on-air song requests (`POST /api/station/1/request/{id}`).
6. **CarPlay & Android Auto Support + In-App Driving Dashboard**
   - Native config plugin (`plugins/withCarPlayAndAndroidAuto.js`) injects iOS `com.apple.developer.carplay-audio` entitlements and Android Auto `com.google.android.gms.car.application` (`automotive_app_desc.xml`) manifest metadata.
   - Includes a dedicated oversized **Car Mode Dashboard** (`src/components/CarModeModal.tsx`) for distraction-free in-dash control.

---

## Quick Start (Windows / macOS / Linux)

### 1. Start the Development Server
```powershell
npm.cmd start
```
- **Test on your iPhone or Android phone immediately:** Install **Expo Go** from the iOS App Store or Google Play Store and scan the QR code shown in the terminal.
- **Test in Web Browser:** Press `w` in the Expo CLI (or run `npm.cmd run web`).

### 2. Build Standalone Native iOS (`.ipa`) & Android (`.apk` / `.aab`) Apps from Windows
Because you are on Windows, you can compile both the native **iOS** and **Android** binaries in the cloud using **EAS Build** (no Mac required):

```powershell
npx.cmd eas-cli login
npx.cmd eas-cli build:configure
# Build an installable Android APK for testing:
npx.cmd eas-cli build -p android --profile preview
# Build for iOS App Store / TestFlight & Google Play Store:
npx.cmd eas-cli build --platform all --profile production
```

### 3. Generate Native `ios/` and `android/` Directories Locally (Optional)
```powershell
npx.cmd expo prebuild
```
This runs `./plugins/withCarPlayAndAndroidAuto.js` to generate the native Xcode and Android Studio projects with background audio, CarPlay entitlements, and Android Auto XML descriptors pre-configured.
