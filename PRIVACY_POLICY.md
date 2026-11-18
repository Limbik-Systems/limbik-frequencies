# Privacy Policy for Limbik Frequencies

**Effective Date:** November 18, 2026  
**App Name:** Limbik Frequencies (`com.limbikfreq.radio`)  
**Website:** https://limbikfreq.com  

---

## 1. Overview
Limbik Frequencies ("we," "our," or "us") respects your privacy. This Privacy Policy explains how the **Limbik Frequencies** mobile application for iOS and Android (the "App") handles information when you stream audio, customize your equalizer, submit song requests, or use Apple CarPlay / Android Auto.

---

## 2. Information We Do Not Collect
- **No User Accounts or Registration:** The App does not require an account, login, name, email address, or phone number.
- **No Microphone or Camera Access:** The App does not record audio, access your microphone, or access your camera. Our real-time 52-band FFT spectrum analyzer processes only the decoded radio stream audio in memory on your device.
- **No Precise Location or Contacts:** The App does not request or collect GPS location, contacts, photos, or health data.

---

## 3. On-Device Preferences & Storage
The App stores your personal listening preferences locally on your device using standard OS app storage (`AsyncStorage`), including:
- Preferred stream quality (`320 kbps MP3` or `128 kbps MP3`)
- Your bookmarked **Saved Tracks** (Favorites)
- Your **4-Band Parametric EQ** settings and saved **User** preset

This data remains strictly on your device and is never uploaded to our servers. Uninstalling the App removes this local data.

---

## 4. Streaming & Station APIs (`limbikfreq.com`)
When you listen to the live radio stream, view track history, or submit a song request, the App communicates directly with `https://limbikfreq.com`:
- **Audio & Metadata Requests:** Standard HTTPS requests are made to fetch the live MP3 stream, current track metadata, album artwork, recently played history, and the requestable song catalog.
- **Song Requests:** When you tap **Request** on a track, a request is sent to `limbikfreq.com` to queue that track on air.
- Like any standard web server, `limbikfreq.com` may temporarily process standard network connection metadata (such as IP address and user-agent) in server logs for stream delivery, rate-limiting song requests, and service reliability.

---

## 5. Advertising (Google AdMob)
The App displays a banner advertisement powered by **Google AdMob** (`react-native-google-mobile-ads`).
- **Non-Personalized Ads:** The App is configured to request **non-personalized ads only** (`requestNonPersonalizedAdsOnly: true`) and does **not** request Apple App Tracking Transparency (ATT / IDFA) cross-app tracking permission.
- **Data Processed by Google AdMob:** To serve and measure non-personalized ads, detect fraud, and ensure SDK stability, Google AdMob may automatically collect limited technical information such as your device type, OS version, IP address (for coarse regional ad delivery), app crash/performance diagnostics, and basic ad impression/tap interactions.
- You can review how Google uses data in its [Google Privacy Policy](https://policies.google.com/privacy) and [How Google uses information from sites or apps that use our services](https://policies.google.com/technologies/partner-sites).

---

## 6. Apple CarPlay & Android Auto
When connected to **Apple CarPlay** or **Android Auto**, the App only shares station playback controls and current track metadata with your vehicle's media display. The App does not access or collect vehicle telemetry, driving history, or location data.

---

## 7. Children's Privacy
Limbik Frequencies is a general-audience music streaming app and does not knowingly collect personal information from children under 13 (or the applicable age in your jurisdiction).

---

## 8. Changes to This Privacy Policy
We may update this Privacy Policy from time to time. Any updates will be posted at `https://limbikfreq.com` and in our repository with an updated effective date.

---

## 9. Contact Us
If you have any questions about this Privacy Policy, please reach out via our official website:  
**Website:** https://limbikfreq.com  
**Developer:** Limbik Systems (`com.limbikfreq.radio`)
