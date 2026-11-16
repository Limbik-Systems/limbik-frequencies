Pod::Spec.new do |s|
  s.name           = 'RadioSpectrum'
  s.version        = '1.0.0'
  s.summary        = 'Native HTTP MP3 radio player with real-time Accelerate FFT spectrum analyzer'
  s.description    = 'Streams Icecast MP3 radio via AudioToolbox + AVAudioEngine and emits 26-band FFT spectrum data.'
  s.license        = 'MIT'
  s.author         = 'Limbik Frequencies'
  s.homepage       = 'https://limbikfreq.com'
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.frameworks = 'AVFoundation', 'AudioToolbox', 'Accelerate', 'MediaPlayer'
  s.source_files = '**/*.{h,m,mm,swift}'
end
