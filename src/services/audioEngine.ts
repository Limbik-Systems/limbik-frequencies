import { Platform } from 'react-native';
import { Audio, InterruptionModeAndroid, InterruptionModeIOS, AVPlaybackStatus } from 'expo-av';
import { DEFAULT_EQ_BANDS, STREAM_OPTIONS } from '../constants/station';
import { EqBandConfig, StreamQuality } from '../types/radio';
import {
  isNativeSpectrumAvailable,
  nativePlayStream,
  nativeSetEq,
  nativeSetNowPlaying,
  nativeStopStream,
  NowPlayingMetadata,
  subscribeNativeSpectrum,
} from '../../modules/radio-spectrum';

export type PlaybackStatusState = 'stopped' | 'buffering' | 'playing' | 'error';

export const SPECTRUM_BAND_COUNT = 52;
const EMPTY_BANDS = Array(SPECTRUM_BAND_COUNT).fill(0.06);

export interface AudioEngineCallbacks {
  onStateChange: (state: PlaybackStatusState, errorMsg?: string) => void;
  onSpectrum?: (bands: number[]) => void;
}

class RadioAudioEngine {
  private sound: Audio.Sound | null = null;
  private currentQuality: StreamQuality = '320';
  private currentVolume = 1.0;
  private isConfigured = false;
  private statusState: PlaybackStatusState = 'stopped';
  private callbacks: AudioEngineCallbacks | null = null;
  private opLock = false;
  private nativeUnsub: (() => void) | null = null;

  // Web Audio API real-time FFT analyzer & 4-band parametric EQ state
  private webAudioEl: HTMLAudioElement | null = null;
  private webAudioCtx: AudioContext | null = null;
  private webAnalyser: AnalyserNode | null = null;
  private webEqFilters: BiquadFilterNode[] = [];
  private webRafId: number | null = null;
  private webSmoothed = new Array<number>(SPECTRUM_BAND_COUNT).fill(0.06);
  private eqEnabled = true;
  private eqBands: EqBandConfig[] = DEFAULT_EQ_BANDS.map((b) => ({ ...b }));

  public setCallbacks(cb: AudioEngineCallbacks) {
    this.callbacks = cb;

    if (Platform.OS !== 'web' && isNativeSpectrumAvailable && !this.nativeUnsub) {
      this.nativeUnsub = subscribeNativeSpectrum(
        (ev) => {
          this.emitState(ev.state, ev.error);
        },
        (ev) => {
          if (Array.isArray(ev.bands) && ev.bands.length > 0) {
            this.callbacks?.onSpectrum?.(ev.bands);
          }
        }
      );
    }
  }

  private emitState(state: PlaybackStatusState, errorMsg?: string) {
    this.statusState = state;
    this.callbacks?.onStateChange(state, errorMsg);
    if (state === 'stopped' || state === 'error') {
      this.callbacks?.onSpectrum?.(EMPTY_BANDS);
    }
  }

  public async configureAudioSession(): Promise<void> {
    if (this.isConfigured || Platform.OS === 'web') return;
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        staysActiveInBackground: true,
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
        playThroughEarpieceAndroid: false,
      });
      this.isConfigured = true;
    } catch (err) {
      console.warn('Failed to configure audio mode:', err);
    }
  }

  public getQuality(): StreamQuality {
    return this.currentQuality;
  }

  public getState(): PlaybackStatusState {
    return this.statusState;
  }

  public async updateNowPlayingMetadata(meta: NowPlayingMetadata): Promise<void> {
    if (Platform.OS !== 'web' && isNativeSpectrumAvailable) {
      try {
        await nativeSetNowPlaying(meta);
      } catch {
        // ignore metadata sync errors
      }
    }
  }

  public async play(quality?: StreamQuality): Promise<void> {
    if (this.opLock) return;
    this.opLock = true;

    try {
      if (quality) {
        this.currentQuality = quality;
      }

      const streamOption = STREAM_OPTIONS[this.currentQuality];
      const liveUri = `${streamOption.url}?_t=${Date.now()}`;

      // 1. Web: HTMLAudioElement + Web Audio AnalyserNode for real FFT spectrum
      if (Platform.OS === 'web') {
        await this.playWebWithAnalyser(liveUri);
        return;
      }

      // 2. Native iOS / Android Build: Custom RadioSpectrum module with real vDSP / MediaCodec FFT
      if (isNativeSpectrumAvailable) {
        this.emitState('buffering');
        await nativePlayStream(liveUri);
        return;
      }

      // 3. Expo Go fallback (no custom native modules compiled in)
      await this.configureAudioSession();
      this.emitState('buffering');

      if (this.sound) {
        try {
          await this.sound.unloadAsync();
        } catch {
          // ignore
        }
        this.sound = null;
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri: liveUri },
        {
          shouldPlay: true,
          volume: this.currentVolume,
          isLooping: false,
          progressUpdateIntervalMillis: 1000,
        },
        this.handlePlaybackStatusUpdate
      );

      this.sound = sound;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to connect to stream';
      this.emitState('error', msg);
    } finally {
      this.opLock = false;
    }
  }

  public async stop(): Promise<void> {
    if (this.opLock) return;
    this.opLock = true;

    try {
      if (Platform.OS === 'web') {
        this.stopWebAudio();
        this.emitState('stopped');
        return;
      }

      if (isNativeSpectrumAvailable) {
        await nativeStopStream();
        this.emitState('stopped');
        return;
      }

      if (this.sound) {
        await this.sound.stopAsync();
        await this.sound.unloadAsync();
        this.sound = null;
      }
      this.emitState('stopped');
    } catch {
      this.sound = null;
      this.emitState('stopped');
    } finally {
      this.opLock = false;
    }
  }

  public async togglePlayStop(): Promise<void> {
    if (this.statusState === 'playing' || this.statusState === 'buffering') {
      await this.stop();
    } else {
      await this.play(this.currentQuality);
    }
  }

  public async switchQuality(newQuality: StreamQuality): Promise<void> {
    const wasActive =
      this.statusState === 'playing' || this.statusState === 'buffering';
    this.currentQuality = newQuality;

    if (wasActive) {
      await this.play(newQuality);
    }
  }

  public async setEq(enabled: boolean, bands: EqBandConfig[]): Promise<void> {
    this.eqEnabled = enabled;
    this.eqBands = bands.slice(0, 4).map((b) => ({
      freq: Math.max(30, Math.min(16000, b.freq)),
      gain: Math.max(-12, Math.min(12, b.gain)),
      q: Math.max(0.3, Math.min(8.0, b.q)),
    }));

    if (Platform.OS === 'web') {
      this.webEqFilters.forEach((filter, idx) => {
        const b = this.eqBands[idx];
        if (!b) return;
        filter.frequency.value = b.freq;
        filter.Q.value = b.q;
        filter.gain.value = enabled ? b.gain : 0;
      });
      return;
    }

    if (isNativeSpectrumAvailable) {
      try {
        await nativeSetEq(enabled, this.eqBands);
      } catch {
        // ignore
      }
    }
  }

  public async setVolume(vol: number): Promise<void> {
    const clamped = Math.max(0, Math.min(1, vol));
    this.currentVolume = clamped;
    if (this.webAudioEl) {
      this.webAudioEl.volume = clamped;
    }
    if (this.sound) {
      try {
        await this.sound.setVolumeAsync(clamped);
      } catch {
        // ignore
      }
    }
  }

  // MARK: - Web Audio API Real-Time FFT Spectrum
  private async playWebWithAnalyser(uri: string): Promise<void> {
    this.stopWebAudio();
    this.emitState('buffering');

    const audioEl = new window.Audio();
    audioEl.crossOrigin = 'anonymous';
    audioEl.preload = 'none';
    audioEl.volume = this.currentVolume;
    audioEl.src = uri;
    this.webAudioEl = audioEl;

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    this.webAudioCtx = ctx;

    const source = ctx.createMediaElementSource(audioEl);
    const filters: BiquadFilterNode[] = this.eqBands.map((band, idx) => {
      const filter = ctx.createBiquadFilter();
      filter.type =
        idx === 0 ? 'lowshelf' : idx === this.eqBands.length - 1 ? 'highshelf' : 'peaking';
      filter.frequency.value = band.freq;
      filter.Q.value = band.q;
      filter.gain.value = this.eqEnabled ? band.gain : 0;
      return filter;
    });
    this.webEqFilters = filters;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.72;

    let chain: AudioNode = source;
    for (const f of filters) {
      chain.connect(f);
      chain = f;
    }
    chain.connect(analyser);
    analyser.connect(ctx.destination);
    this.webAnalyser = analyser;

    audioEl.onplaying = () => {
      this.emitState('playing');
      this.startWebSpectrumLoop();
    };
    audioEl.onwaiting = () => {
      if (this.statusState !== 'stopped') {
        this.emitState('buffering');
      }
    };
    audioEl.onerror = () => {
      this.emitState('error', 'Unable to connect to live stream');
    };

    await audioEl.play();
  }

  private startWebSpectrumLoop() {
    if (this.webRafId !== null) {
      cancelAnimationFrame(this.webRafId);
    }

    const analyser = this.webAnalyser;
    const ctx = this.webAudioCtx;
    if (!analyser || !ctx) return;

    const freqData = new Uint8Array(analyser.frequencyBinCount);
    const sampleRate = ctx.sampleRate || 44100;
    const fftSize = analyser.fftSize;
    const minFreq = 45;
    const maxFreq = Math.min(16000, sampleRate * 0.45);
    let lastEmit = 0;

    const tick = (ts: number) => {
      if (!this.webAnalyser || this.statusState !== 'playing') return;
      if (ts - lastEmit >= 32) {
        lastEmit = ts;
        analyser.getByteFrequencyData(freqData);
        const bands = new Array<number>(SPECTRUM_BAND_COUNT);

        for (let b = 0; b < SPECTRUM_BAND_COUNT; b++) {
          const fLow = minFreq * Math.pow(maxFreq / minFreq, b / SPECTRUM_BAND_COUNT);
          const fHigh = minFreq * Math.pow(maxFreq / minFreq, (b + 1) / SPECTRUM_BAND_COUNT);
          const binLow = Math.max(1, Math.min(freqData.length - 1, Math.floor((fLow * fftSize) / sampleRate)));
          const binHigh = Math.max(binLow, Math.min(freqData.length - 1, Math.floor((fHigh * fftSize) / sampleRate)));

          let peak = 0;
          for (let bin = binLow; bin <= binHigh; bin++) {
            if (freqData[bin] > peak) peak = freqData[bin];
          }
          const norm = Math.max(0.06, Math.min(1, peak / 255));
          this.webSmoothed[b] = this.webSmoothed[b] * 0.35 + norm * 0.65;
          bands[b] = this.webSmoothed[b];
        }

        this.callbacks?.onSpectrum?.(bands);
      }
      this.webRafId = requestAnimationFrame(tick);
    };

    this.webRafId = requestAnimationFrame(tick);
  }

  private stopWebAudio() {
    if (this.webRafId !== null) {
      cancelAnimationFrame(this.webRafId);
      this.webRafId = null;
    }
    if (this.webAudioEl) {
      try {
        this.webAudioEl.pause();
        this.webAudioEl.src = '';
      } catch {
        // ignore
      }
      this.webAudioEl = null;
    }
    if (this.webAudioCtx) {
      try {
        this.webAudioCtx.close();
      } catch {
        // ignore
      }
      this.webAudioCtx = null;
    }
    this.webEqFilters = [];
    this.webAnalyser = null;
  }

  private handlePlaybackStatusUpdate = (status: AVPlaybackStatus) => {
    if (!status.isLoaded) {
      if (status.error) {
        this.emitState('error', `Stream error: ${status.error}`);
      }
      return;
    }

    if (status.isPlaying) {
      if (this.statusState !== 'playing') {
        this.emitState('playing');
      }
    } else if (status.isBuffering) {
      if (this.statusState !== 'buffering') {
        this.emitState('buffering');
      }
    }
  };
}

export const audioEngine = new RadioAudioEngine();
