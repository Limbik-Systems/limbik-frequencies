import { NativeModule, requireOptionalNativeModule } from 'expo-modules-core';

export type NativePlaybackState = 'stopped' | 'buffering' | 'playing' | 'error';

export interface RadioSpectrumStateEvent {
  state: NativePlaybackState;
  error?: string;
}

export interface RadioSpectrumBandsEvent {
  bands: number[];
}

export interface NowPlayingMetadata {
  title: string;
  artist: string;
  album: string;
  artworkUrl: string;
}

type RadioSpectrumModuleEvents = {
  onStateChange(event: RadioSpectrumStateEvent): void;
  onSpectrum(event: RadioSpectrumBandsEvent): void;
};

declare class RadioSpectrumNativeModule extends NativeModule<RadioSpectrumModuleEvents> {
  play(url: string): Promise<void>;
  stop(): Promise<void>;
  setNowPlaying(meta: NowPlayingMetadata): Promise<void>;
}

const NativeRadioSpectrum =
  requireOptionalNativeModule<RadioSpectrumNativeModule>('RadioSpectrum');

export const isNativeSpectrumAvailable = NativeRadioSpectrum !== null;

export async function nativePlayStream(url: string): Promise<void> {
  if (!NativeRadioSpectrum) {
    throw new Error('RadioSpectrum native module is not available');
  }
  await NativeRadioSpectrum.play(url);
}

export async function nativeStopStream(): Promise<void> {
  if (!NativeRadioSpectrum) return;
  await NativeRadioSpectrum.stop();
}

export async function nativeSetNowPlaying(meta: NowPlayingMetadata): Promise<void> {
  if (!NativeRadioSpectrum) return;
  await NativeRadioSpectrum.setNowPlaying(meta);
}

export function subscribeNativeSpectrum(
  onStateChange: (ev: RadioSpectrumStateEvent) => void,
  onSpectrum: (ev: RadioSpectrumBandsEvent) => void
): () => void {
  if (!NativeRadioSpectrum) return () => {};
  const sub1 = NativeRadioSpectrum.addListener('onStateChange', onStateChange);
  const sub2 = NativeRadioSpectrum.addListener('onSpectrum', onSpectrum);
  return () => {
    sub1.remove();
    sub2.remove();
  };
}
