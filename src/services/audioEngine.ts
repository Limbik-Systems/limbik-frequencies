import { Audio, InterruptionModeAndroid, InterruptionModeIOS, AVPlaybackStatus } from 'expo-av';
import { STREAM_OPTIONS } from '../constants/station';
import { StreamQuality } from '../types/radio';

export type PlaybackStatusState = 'stopped' | 'buffering' | 'playing' | 'error';

export interface AudioEngineCallbacks {
  onStateChange: (state: PlaybackStatusState, errorMsg?: string) => void;
}

class RadioAudioEngine {
  private sound: Audio.Sound | null = null;
  private currentQuality: StreamQuality = '320';
  private currentVolume = 1.0;
  private isConfigured = false;
  private statusState: PlaybackStatusState = 'stopped';
  private callbacks: AudioEngineCallbacks | null = null;
  private opLock = false;

  public setCallbacks(cb: AudioEngineCallbacks) {
    this.callbacks = cb;
  }

  private emitState(state: PlaybackStatusState, errorMsg?: string) {
    this.statusState = state;
    this.callbacks?.onStateChange(state, errorMsg);
  }

  public async configureAudioSession(): Promise<void> {
    if (this.isConfigured) return;
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

  public async play(quality?: StreamQuality): Promise<void> {
    if (this.opLock) return;
    this.opLock = true;

    try {
      if (quality) {
        this.currentQuality = quality;
      }

      await this.configureAudioSession();
      this.emitState('buffering');

      if (this.sound) {
        try {
          await this.sound.unloadAsync();
        } catch {
          // ignore unload error
        }
        this.sound = null;
      }

      const streamOption = STREAM_OPTIONS[this.currentQuality];
      // Append cache-busting query param so live Icecast stream starts at live edge
      const liveUri = `${streamOption.url}?_t=${Date.now()}`;

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

  public async setVolume(vol: number): Promise<void> {
    const clamped = Math.max(0, Math.min(1, vol));
    this.currentVolume = clamped;
    if (this.sound) {
      try {
        await this.sound.setVolumeAsync(clamped);
      } catch {
        // ignore
      }
    }
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
