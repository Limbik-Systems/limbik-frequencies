import ExpoModulesCore
import AVFoundation
import AudioToolbox
import Accelerate
import MediaPlayer

private let kBandCount = 26
private let kFftSize = 1024

public class RadioSpectrumModule: Module {
  private var streamer: IcecastAudioStreamer?
  private var remoteConfigured = false
  private var currentUrl: String?
  private var cachedMeta: [String: Any] = [:]

  public func definition() -> ModuleDefinition {
    Name("RadioSpectrum")

    Events("onStateChange", "onSpectrum")

    OnDestroy {
      self.streamer?.stop()
      self.streamer = nil
    }

    AsyncFunction("play") { (url: String) in
      self.currentUrl = url
      self.configureAudioSession()
      self.configureRemoteCommands()

      self.streamer?.stop()
      let newStreamer = IcecastAudioStreamer(
        onState: { [weak self] state, error in
          var payload: [String: Any] = ["state": state]
          if let error = error {
            payload["error"] = error
          }
          self?.sendEvent("onStateChange", payload)
        },
        onSpectrum: { [weak self] bands in
          self?.sendEvent("onSpectrum", ["bands": bands])
        }
      )
      self.streamer = newStreamer
      newStreamer.start(urlString: url)
    }

    AsyncFunction("stop") {
      self.streamer?.stop()
      self.streamer = nil
      self.sendEvent("onStateChange", ["state": "stopped"])
      self.sendEvent("onSpectrum", ["bands": Array(repeating: 0.0, count: kBandCount)])
    }

    AsyncFunction("setNowPlaying") { (meta: [String: Any]) in
      self.cachedMeta = meta
      DispatchQueue.main.async {
        var info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
        info[MPMediaItemPropertyTitle] = meta["title"] as? String ?? "Limbik Frequencies"
        info[MPMediaItemPropertyArtist] = meta["artist"] as? String ?? "Radio Elektro[u]nique"
        info[MPMediaItemPropertyAlbumTitle] = meta["album"] as? String ?? "Limbik Frequencies"
        info[MPNowPlayingInfoPropertyIsLiveStream] = true
        info[MPNowPlayingInfoPropertyPlaybackRate] = self.streamer?.isPlaying == true ? 1.0 : 0.0
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info

        if let artStr = meta["artworkUrl"] as? String, let artUrl = URL(string: artStr) {
          URLSession.shared.dataTask(with: artUrl) { data, _, _ in
            guard let data = data, let image = UIImage(data: data) else { return }
            let artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
            DispatchQueue.main.async {
              var updated = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
              updated[MPMediaItemPropertyArtwork] = artwork
              MPNowPlayingInfoCenter.default().nowPlayingInfo = updated
            }
          }.resume()
        }
      }
    }
  }

  private func configureAudioSession() {
    do {
      let session = AVAudioSession.sharedInstance()
      try session.setCategory(.playback, mode: .default, options: [])
      try session.setActive(true)
    } catch {
      // Ignore if session already configured
    }
  }

  private func configureRemoteCommands() {
    guard !remoteConfigured else { return }
    remoteConfigured = true
    let center = MPRemoteCommandCenter.shared()

    center.playCommand.isEnabled = true
    center.playCommand.addTarget { [weak self] _ in
      guard let self = self, let url = self.currentUrl else { return .commandFailed }
      self.configureAudioSession()
      if self.streamer == nil {
        let s = IcecastAudioStreamer(
          onState: { [weak self] state, error in
            var payload: [String: Any] = ["state": state]
            if let error = error { payload["error"] = error }
            self?.sendEvent("onStateChange", payload)
          },
          onSpectrum: { [weak self] bands in
            self?.sendEvent("onSpectrum", ["bands": bands])
          }
        )
        self.streamer = s
        s.start(urlString: url)
      }
      return .success
    }

    center.pauseCommand.isEnabled = true
    center.pauseCommand.addTarget { [weak self] _ in
      self?.streamer?.stop()
      self?.streamer = nil
      self?.sendEvent("onStateChange", ["state": "stopped"])
      return .success
    }

    center.stopCommand.isEnabled = true
    center.stopCommand.addTarget { [weak self] _ in
      self?.streamer?.stop()
      self?.streamer = nil
      self?.sendEvent("onStateChange", ["state": "stopped"])
      return .success
    }
  }
}

private final class IcecastAudioStreamer: NSObject, URLSessionDataDelegate {
  private let onState: (String, String?) -> Void
  private let onSpectrum: ([Double]) -> Void

  private var session: URLSession?
  private var dataTask: URLSessionDataTask?
  private var audioFileStream: AudioFileStreamID?

  private let engine = AVAudioEngine()
  private let playerNode = AVAudioPlayerNode()
  private var converter: AVAudioConverter?
  private var sourceFormat: AVAudioFormat?
  private var targetFormat: AVAudioFormat?

  private var fftSetup: FFTSetup?
  private var window = [Float](repeating: 0, count: kFftSize)
  private var smoothedBands = [Double](repeating: 0, count: kBandCount)
  private var lastEmitTime: CFAbsoluteTime = 0
  private var stopped = false
  private var scheduledBuffers = 0
  private let queue = DispatchQueue(label: "com.limbikfreq.radiospectrum.decode")

  var isPlaying: Bool = false

  init(onState: @escaping (String, String?) -> Void, onSpectrum: @escaping ([Double]) -> Void) {
    self.onState = onState
    self.onSpectrum = onSpectrum
    super.init()

    let log2n = vDSP_Length(log2(Float(kFftSize)))
    self.fftSetup = vDSP_create_fftsetup(log2n, FFTRadix(kFFTRadix2))
    vDSP_hann_window(&window, vDSP_Length(kFftSize), Int32(vDSP_HANN_NORM))

    engine.attach(playerNode)
    let mixerFormat = engine.mainMixerNode.outputFormat(forBus: 0)
    self.targetFormat = AVAudioFormat(
      commonFormat: .pcmFormatFloat32,
      sampleRate: mixerFormat.sampleRate > 0 ? mixerFormat.sampleRate : 44100,
      channels: 2,
      interleaved: false
    )
    engine.connect(playerNode, to: engine.mainMixerNode, format: targetFormat)

    engine.mainMixerNode.installTap(onBus: 0, bufferSize: AVAudioFrameCount(kFftSize), format: nil) { [weak self] buffer, _ in
      self?.processTapBuffer(buffer)
    }
  }

  deinit {
    stop()
    if let fft = fftSetup {
      vDSP_destroy_fftsetup(fft)
    }
  }

  func start(urlString: String) {
    guard let url = URL(string: urlString) else {
      onState("error", "Invalid stream URL")
      return
    }
    stopped = false
    onState("buffering", nil)

    do {
      try engine.start()
    } catch {
      onState("error", "Audio engine error: \(error.localizedDescription)")
      return
    }

    var streamID: AudioFileStreamID?
    let selfPtr = Unmanaged.passUnretained(self).toOpaque()
    let openStatus = AudioFileStreamOpen(
      selfPtr,
      { clientData, fileStream, propertyID, _ in
        let me = Unmanaged<IcecastAudioStreamer>.fromOpaque(clientData).takeUnretainedValue()
        me.handlePropertyChange(fileStream: fileStream, propertyID: propertyID)
      },
      { clientData, numberBytes, numberPackets, inputData, packetDescriptions in
        let me = Unmanaged<IcecastAudioStreamer>.fromOpaque(clientData).takeUnretainedValue()
        me.handlePackets(
          numberBytes: numberBytes,
          numberPackets: numberPackets,
          inputData: inputData,
          packetDescriptions: packetDescriptions
        )
      },
      kAudioFileMP3Type,
      &streamID
    )

    guard openStatus == noErr, let validStream = streamID else {
      onState("error", "Unable to initialize MP3 stream parser")
      return
    }
    audioFileStream = validStream

    let config = URLSessionConfiguration.default
    config.requestCachePolicy = .reloadIgnoringLocalCacheData
    session = URLSession(configuration: config, delegate: self, delegateQueue: nil)
    var req = URLRequest(url: url)
    req.setValue("0", forHTTPHeaderField: "Icy-MetaData")
    dataTask = session?.dataTask(with: req)
    dataTask?.resume()
  }

  func stop() {
    stopped = true
    isPlaying = false
    dataTask?.cancel()
    dataTask = nil
    session?.invalidateAndCancel()
    session = nil

    engine.mainMixerNode.removeTap(onBus: 0)
    playerNode.stop()
    engine.stop()

    if let stream = audioFileStream {
      AudioFileStreamClose(stream)
      audioFileStream = nil
    }
  }

  // MARK: - URLSessionDataDelegate
  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
    guard !stopped else { return }
    queue.async { [weak self] in
      guard let self = self, !self.stopped, let stream = self.audioFileStream else { return }
      data.withUnsafeBytes { rawBuf in
        guard let baseAddr = rawBuf.baseAddress else { return }
        AudioFileStreamParseBytes(stream, UInt32(data.count), baseAddr, [])
      }
    }
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    guard !stopped else { return }
    if let err = error as NSError?, err.code != NSURLErrorCancelled {
      isPlaying = false
      onState("error", err.localizedDescription)
    }
  }

  // MARK: - AudioFileStream Callbacks
  private func handlePropertyChange(fileStream: AudioFileStreamID, propertyID: AudioFileStreamPropertyID) {
    if propertyID == kAudioFileStreamProperty_DataFormat {
      var asbd = AudioStreamBasicDescription()
      var size = UInt32(MemoryLayout<AudioStreamBasicDescription>.size)
      if AudioFileStreamGetProperty(fileStream, kAudioFileStreamProperty_DataFormat, &size, &asbd) == noErr {
        if let srcFmt = AVAudioFormat(streamDescription: &asbd), let dstFmt = targetFormat {
          self.sourceFormat = srcFmt
          self.converter = AVAudioConverter(from: srcFmt, to: dstFmt)
        }
      }
    }
  }

  private func handlePackets(
    numberBytes: UInt32,
    numberPackets: UInt32,
    inputData: UnsafeRawPointer,
    packetDescriptions: UnsafeMutablePointer<AudioStreamPacketDescription>?
  ) {
    guard !stopped, let srcFmt = sourceFormat, let dstFmt = targetFormat, let conv = converter else { return }
    guard let compressedBuf = AVAudioCompressedBuffer(
      format: srcFmt,
      packetCapacity: numberPackets,
      maximumPacketSize: Int(numberBytes)
    ) as AVAudioCompressedBuffer? else { return }

    memcpy(compressedBuf.data, inputData, Int(numberBytes))
    compressedBuf.byteLength = numberBytes
    compressedBuf.packetCount = numberPackets
    if let descs = packetDescriptions {
      for i in 0..<Int(numberPackets) {
        compressedBuf.packetDescriptions?[i] = descs[i]
      }
    }

    let ratio = dstFmt.sampleRate / max(srcFmt.sampleRate, 1)
    let estimatedFrames = AVAudioFrameCount(Double(numberPackets) * 1152.0 * ratio) + 512
    guard let pcmBuf = AVAudioPCMBuffer(pcmFormat: dstFmt, frameCapacity: estimatedFrames) else { return }

    var provided = false
    var convError: NSError?
    conv.convert(to: pcmBuf, error: &convError) { _, outStatus in
      if provided {
        outStatus.pointee = .noDataNow
        return nil
      }
      provided = true
      outStatus.pointee = .haveData
      return compressedBuf
    }

    guard convError == nil, pcmBuf.frameLength > 0 else { return }

    playerNode.scheduleBuffer(pcmBuf)
    scheduledBuffers += 1
    if !playerNode.isPlaying && scheduledBuffers >= 3 {
      playerNode.play()
      if !isPlaying {
        isPlaying = true
        onState("playing", nil)
      }
    }
  }

  // MARK: - Real-Time Accelerate vDSP FFT
  private func processTapBuffer(_ buffer: AVAudioPCMBuffer) {
    guard !stopped, isPlaying, let fftSetup = fftSetup else { return }
    let now = CFAbsoluteTimeGetCurrent()
    if now - lastEmitTime < 0.032 { return }
    lastEmitTime = now

    guard let channelData = buffer.floatChannelData?[0] else { return }
    let frameCount = min(Int(buffer.frameLength), kFftSize)
    guard frameCount >= kFftSize else { return }

    var samples = [Float](repeating: 0, count: kFftSize)
    vDSP_vmul(channelData, 1, window, 1, &samples, 1, vDSP_Length(kFftSize))

    let halfN = kFftSize / 2
    var real = [Float](repeating: 0, count: halfN)
    var imag = [Float](repeating: 0, count: halfN)

    real.withUnsafeMutableBufferPointer { rPtr in
      imag.withUnsafeMutableBufferPointer { iPtr in
        var split = DSPSplitComplex(realp: rPtr.baseAddress!, imagp: iPtr.baseAddress!)
        samples.withUnsafeBufferPointer { sPtr in
          sPtr.baseAddress!.withMemoryRebound(to: DSPComplex.self, capacity: halfN) { cPtr in
            vDSP_ctoz(cPtr, 2, &split, 1, vDSP_Length(halfN))
          }
        }
        let log2n = vDSP_Length(log2(Float(kFftSize)))
        vDSP_fft_zrip(fftSetup, &split, 1, log2n, FFTDirection(FFT_FORWARD))

        var magnitudes = [Float](repeating: 0, count: halfN)
        vDSP_zvmags(&split, 1, &magnitudes, 1, vDSP_Length(halfN))

        // Map 512 FFT bins onto 26 logarithmic frequency bands (40 Hz -> 16 kHz)
        let sampleRate = Float(buffer.format.sampleRate > 0 ? buffer.format.sampleRate : 44100)
        let minFreq: Float = 45.0
        let maxFreq: Float = min(16000.0, sampleRate * 0.45)
        var newBands = [Double](repeating: 0, count: kBandCount)

        for b in 0..<kBandCount {
          let fLow = minFreq * pow(maxFreq / minFreq, Float(b) / Float(kBandCount))
          let fHigh = minFreq * pow(maxFreq / minFreq, Float(b + 1) / Float(kBandCount))
          let binLow = max(1, min(halfN - 1, Int(fLow * Float(kFftSize) / sampleRate)))
          let binHigh = max(binLow, min(halfN - 1, Int(fHigh * Float(kFftSize) / sampleRate)))

          var peak: Float = 0
          for bin in binLow...binHigh {
            if magnitudes[bin] > peak { peak = magnitudes[bin] }
          }

          let rms = sqrt(peak) / Float(halfN)
          let db = 20.0 * log10(max(rms, 1e-6))
          // Normalize -65 dB .. -8 dB into 0.08 .. 1.0
          let norm = Double(max(0.06, min(1.0, (db + 65.0) / 57.0)))
          smoothedBands[b] = smoothedBands[b] * 0.45 + norm * 0.55
          newBands[b] = smoothedBands[b]
        }

        self.onSpectrum(newBands)
      }
    }
  }
}
