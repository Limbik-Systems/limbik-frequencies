import ExpoModulesCore
import AVFoundation
import AudioToolbox
import Accelerate
import MediaPlayer
import CarPlay
import UIKit

private let kBandCount = 52
private let kFftSize = 2048
private let kStream320Url = "https://limbikfreq.com/listen/limbik_frequencies/320.mp3"
private let kStream128Url = "https://limbikfreq.com/listen/limbik_frequencies/128.mp3"

struct EqBandParamSwift {
  let freq: Float
  let gain: Float
  let q: Float
}

/// Shared playback & spectrum state so both the React Native bridge and CarPlaySceneDelegate
/// stay synchronized on the same live Icecast audio stream and 52-band FFT data.
final class RadioSharedCoordinator {
  static let shared = RadioSharedCoordinator()

  var streamer: IcecastAudioStreamer?
  var currentUrl: String = kStream320Url
  var currentTitle: String = "Limbik Frequencies"
  var currentArtist: String = "Radio Elektro[u]nique"
  var currentAlbum: String = "Limbik Frequencies"
  var baseArtworkImage: UIImage?
  var cachedBackdropImage: UIImage?
  var isCarPlayConnected: Bool = false
  var remoteConfigured: Bool = false

  var onStateEmit: ((String, String?) -> Void)?
  var onSpectrumEmit: (([Double]) -> Void)?

  private var lastArtworkRenderTime: CFAbsoluteTime = 0
  private var latestBands: [Double] = Array(repeating: 0.06, count: kBandCount)
  private let artworkQueue = DispatchQueue(label: "com.limbikfreq.carplay.artwork", qos: .userInteractive)
  private var isRenderingArtwork = false
  var eqEnabled: Bool = true
  var eqBands: [EqBandParamSwift] = [
    EqBandParamSwift(freq: 80, gain: 0, q: 0.7),
    EqBandParamSwift(freq: 400, gain: 0, q: 1.0),
    EqBandParamSwift(freq: 2400, gain: 0, q: 1.0),
    EqBandParamSwift(freq: 10000, gain: 0, q: 0.7),
  ]

  private init() {}

  func configureAudioSession() {
    do {
      let session = AVAudioSession.sharedInstance()
      try session.setCategory(.playback, mode: .default, options: [])
      try session.setActive(true)
    } catch {
      // Ignore if already active
    }
  }

  func configureRemoteCommands() {
    guard !remoteConfigured else { return }
    remoteConfigured = true
    let center = MPRemoteCommandCenter.shared()

    center.playCommand.isEnabled = true
    center.playCommand.addTarget { [weak self] _ in
      guard let self = self else { return .commandFailed }
      self.play(urlString: self.currentUrl)
      return .success
    }

    center.pauseCommand.isEnabled = true
    center.pauseCommand.addTarget { [weak self] _ in
      self?.stop()
      return .success
    }

    center.stopCommand.isEnabled = true
    center.stopCommand.addTarget { [weak self] _ in
      self?.stop()
      return .success
    }
  }

  func play(urlString: String) {
    currentUrl = urlString
    configureAudioSession()
    configureRemoteCommands()

    streamer?.stop()
    let newStreamer = IcecastAudioStreamer(
      onState: { [weak self] state, error in
        self?.onStateEmit?(state, error)
        if state == "playing" {
          self?.pushNowPlayingInfo(includeAnalyzer: true)
        } else if state == "stopped" {
          self?.pushNowPlayingInfo(includeAnalyzer: false)
        }
      },
      onSpectrum: { [weak self] bands in
        guard let self = self else { return }
        self.latestBands = bands
        self.onSpectrumEmit?(bands)
        self.maybeUpdateCarPlayAnalyzerArtwork(bands: bands)
      }
    )
    streamer = newStreamer
    newStreamer.applyEq(enabled: eqEnabled, bands: eqBands)
    newStreamer.start(urlString: urlString)
  }

  func setEq(enabled: Bool, bands: [[String: Any]]) {
    eqEnabled = enabled
    var updated: [EqBandParamSwift] = []
    for i in 0..<4 {
      let fallback = i < eqBands.count ? eqBands[i] : EqBandParamSwift(freq: 1000, gain: 0, q: 1.0)
      if i < bands.count {
        let item = bands[i]
        let f = max(30.0, min(16000.0, Float((item["freq"] as? Double) ?? Double(fallback.freq))))
        let g = max(-12.0, min(12.0, Float((item["gain"] as? Double) ?? Double(fallback.gain))))
        let q = max(0.3, min(8.0, Float((item["q"] as? Double) ?? Double(fallback.q))))
        updated.append(EqBandParamSwift(freq: f, gain: g, q: q))
      } else {
        updated.append(fallback)
      }
    }
    eqBands = updated
    streamer?.applyEq(enabled: eqEnabled, bands: eqBands)
  }

  func stop() {
    streamer?.stop()
    streamer = nil
    latestBands = Array(repeating: 0.06, count: kBandCount)
    onStateEmit?("stopped", nil)
    onSpectrumEmit?(latestBands)
    pushNowPlayingInfo(includeAnalyzer: false)
  }

  func updateMetadata(title: String, artist: String, album: String, artworkUrl: String) {
    currentTitle = title
    currentArtist = artist
    currentAlbum = album
    pushNowPlayingInfo(includeAnalyzer: streamer?.isPlaying == true)

    if let url = URL(string: artworkUrl) {
      URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
        guard let self = self, let data = data, let img = UIImage(data: data) else { return }
        self.baseArtworkImage = img
        self.cachedBackdropImage = self.buildBackdropImage(base: img)
        self.pushNowPlayingInfo(includeAnalyzer: self.streamer?.isPlaying == true)
      }.resume()
    }
  }

  private func pushNowPlayingInfo(includeAnalyzer: Bool) {
    let bandsSnapshot = latestBands
    let title = currentTitle
    let artist = currentArtist
    let album = currentAlbum
    let playing = streamer?.isPlaying == true

    artworkQueue.async { [weak self] in
      guard let self = self else { return }
      let rendered = self.renderCarPlayArtwork(
        bands: bandsSnapshot,
        active: includeAnalyzer
      )
      self.isRenderingArtwork = false

      DispatchQueue.main.async {
        var info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
        info[MPMediaItemPropertyTitle] = title
        info[MPMediaItemPropertyArtist] = artist
        info[MPMediaItemPropertyAlbumTitle] = album
        info[MPNowPlayingInfoPropertyIsLiveStream] = true
        info[MPNowPlayingInfoPropertyPlaybackRate] = playing ? 1.0 : 0.0
        if let img = rendered {
          info[MPMediaItemPropertyArtwork] = MPMediaItemArtwork(boundsSize: img.size) { _ in img }
        }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
      }
    }
  }

  private func maybeUpdateCarPlayAnalyzerArtwork(bands: [Double]) {
    // Target ~12.5 fps (80ms) on CarPlay using lightweight 360x360 @1x frames
    let interval: CFAbsoluteTime = isCarPlayConnected ? 0.08 : 0.5
    let now = CFAbsoluteTimeGetCurrent()
    guard !isRenderingArtwork, now - lastArtworkRenderTime >= interval else { return }
    lastArtworkRenderTime = now
    isRenderingArtwork = true
    pushNowPlayingInfo(includeAnalyzer: true)
  }

  private func buildBackdropImage(base: UIImage?) -> UIImage? {
    let size = CGSize(width: 360, height: 360)
    let fmt = UIGraphicsImageRendererFormat()
    fmt.scale = 1.0
    fmt.opaque = true
    let renderer = UIGraphicsImageRenderer(size: size, format: fmt)
    return renderer.image { ctx in
      let cg = ctx.cgContext
      UIColor(red: 0.043, green: 0.055, blue: 0.078, alpha: 1.0).setFill()
      cg.fill(CGRect(origin: .zero, size: size))

      if let baseImg = base {
        baseImg.draw(in: CGRect(x: 0, y: 0, width: 360, height: 360))
      }

      let panelHeight: CGFloat = 132
      let panelY: CGFloat = size.height - panelHeight
      let gradColors = [
        UIColor(red: 0.043, green: 0.055, blue: 0.078, alpha: 0.15).cgColor,
        UIColor(red: 0.043, green: 0.055, blue: 0.078, alpha: 0.92).cgColor,
        UIColor(red: 0.055, green: 0.071, blue: 0.106, alpha: 0.98).cgColor,
      ] as CFArray
      if let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: gradColors, locations: [0.0, 0.25, 1.0]) {
        cg.drawLinearGradient(
          gradient,
          start: CGPoint(x: 0, y: panelY - 24),
          end: CGPoint(x: 0, y: size.height),
          options: []
        )
      }
    }
  }

  /// Renders a fast 360x360 @1x artwork image by compositing the 52-band spectrum analyzer
  /// over the pre-cached album backdrop.
  private func renderCarPlayArtwork(bands: [Double], active: Bool) -> UIImage? {
    let size = CGSize(width: 360, height: 360)
    let fmt = UIGraphicsImageRendererFormat()
    fmt.scale = 1.0
    fmt.opaque = true
    let renderer = UIGraphicsImageRenderer(size: size, format: fmt)
    let backdrop = cachedBackdropImage ?? buildBackdropImage(base: baseArtworkImage)

    return renderer.image { ctx in
      let cg = ctx.cgContext
      if let bg = backdrop {
        bg.draw(at: .zero)
      } else {
        UIColor(red: 0.043, green: 0.055, blue: 0.078, alpha: 1.0).setFill()
        cg.fill(CGRect(origin: .zero, size: size))
      }

      // Draw 52-Band Real-Time FFT Spectrum Bars
      let padX: CGFloat = 14
      let barAreaWidth = size.width - padX * 2
      let spacing: CGFloat = 1.5
      let barWidth = (barAreaWidth - spacing * CGFloat(kBandCount - 1)) / CGFloat(kBandCount)
      let maxBarHeight: CGFloat = 94
      let baseY: CGFloat = size.height - 16

      for i in 0..<kBandCount {
        let level = active ? CGFloat(max(0.06, min(1.0, bands[i]))) : 0.06
        let h = max(4.0, level * maxBarHeight)
        let x = padX + CGFloat(i) * (barWidth + spacing)
        let rect = CGRect(x: x, y: baseY - h, width: barWidth, height: h)

        let barColor: UIColor
        if !active {
          barColor = UIColor(red: 0.15, green: 0.18, blue: 0.24, alpha: 1.0)
        } else if level > 0.72 {
          barColor = UIColor.white
        } else if Double(i) > Double(kBandCount) * 0.75 {
          barColor = UIColor(red: 0.471, green: 0.722, blue: 0.937, alpha: 1.0)
        } else {
          barColor = UIColor(red: 0.129, green: 0.588, blue: 0.953, alpha: 1.0)
        }

        let path = UIBezierPath(roundedRect: rect, cornerRadius: 1.5)
        barColor.setFill()
        path.fill()
      }
    }
  }
}

public class RadioSpectrumModule: Module {
  public func definition() -> ModuleDefinition {
    Name("RadioSpectrum")

    Events("onStateChange", "onSpectrum")

    OnCreate {
      let coord = RadioSharedCoordinator.shared
      coord.onStateEmit = { [weak self] state, error in
        var payload: [String: Any] = ["state": state]
        if let error = error { payload["error"] = error }
        self?.sendEvent("onStateChange", payload)
      }
      coord.onSpectrumEmit = { [weak self] bands in
        self?.sendEvent("onSpectrum", ["bands": bands])
      }
    }

    OnDestroy {
      RadioSharedCoordinator.shared.stop()
    }

    AsyncFunction("play") { (url: String) in
      RadioSharedCoordinator.shared.play(urlString: url)
    }

    AsyncFunction("stop") {
      RadioSharedCoordinator.shared.stop()
    }

    AsyncFunction("setNowPlaying") { (meta: [String: Any]) in
      RadioSharedCoordinator.shared.updateMetadata(
        title: meta["title"] as? String ?? "Limbik Frequencies",
        artist: meta["artist"] as? String ?? "Radio Elektro[u]nique",
        album: meta["album"] as? String ?? "Limbik Frequencies",
        artworkUrl: meta["artworkUrl"] as? String ?? ""
      )
    }

    AsyncFunction("setEq") { (enabled: Bool, bands: [[String: Any]]) in
      RadioSharedCoordinator.shared.setEq(enabled: enabled, bands: bands)
    }
  }
}

// MARK: - Phone Window Scene Delegate (Preserves Expo AppDelegate Root Window when Scene Manifest is enabled)
@objc(PhoneSceneDelegate)
class PhoneSceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene else { return }
    if let appDelegate = UIApplication.shared.delegate,
       let existingWindow = appDelegate.window ?? nil {
      existingWindow.windowScene = windowScene
      self.window = existingWindow
      existingWindow.makeKeyAndVisible()
    }
  }
}

// MARK: - Apple CarPlay Scene Delegate
@objc(CarPlaySceneDelegate)
class CarPlaySceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {
  private var interfaceController: CPInterfaceController?

  func templateApplicationScene(
    _ templateApplicationScene: CPTemplateApplicationScene,
    didConnect interfaceController: CPInterfaceController
  ) {
    self.interfaceController = interfaceController
    RadioSharedCoordinator.shared.isCarPlayConnected = true

    let nowPlayingItem = CPListItem(
      text: "Now Playing",
      detailText: "\(RadioSharedCoordinator.shared.currentTitle) — \(RadioSharedCoordinator.shared.currentArtist)"
    )
    nowPlayingItem.handler = { [weak self] _, completion in
      self?.interfaceController?.pushTemplate(CPNowPlayingTemplate.shared, animated: true, completion: nil)
      completion()
    }

    let hqItem = CPListItem(
      text: "Limbik Frequencies • 320 kbps MP3",
      detailText: "Audiophile HQ Live Stream"
    )
    hqItem.handler = { [weak self] _, completion in
      RadioSharedCoordinator.shared.play(urlString: "\(kStream320Url)?_t=\(Int(Date().timeIntervalSince1970))")
      self?.interfaceController?.pushTemplate(CPNowPlayingTemplate.shared, animated: true, completion: nil)
      completion()
    }

    let stdItem = CPListItem(
      text: "Limbik Frequencies • 128 kbps MP3",
      detailText: "Standard Mobile Stream"
    )
    stdItem.handler = { [weak self] _, completion in
      RadioSharedCoordinator.shared.play(urlString: "\(kStream128Url)?_t=\(Int(Date().timeIntervalSince1970))")
      self?.interfaceController?.pushTemplate(CPNowPlayingTemplate.shared, animated: true, completion: nil)
      completion()
    }

    let section = CPListSection(items: [nowPlayingItem, hqItem, stdItem])
    let listTemplate = CPListTemplate(title: "Limbik Frequencies", sections: [section])

    interfaceController.setRootTemplate(listTemplate, animated: false, completion: nil)
  }

  func templateApplicationScene(
    _ templateApplicationScene: CPTemplateApplicationScene,
    didDisconnectInterfaceController interfaceController: CPInterfaceController
  ) {
    RadioSharedCoordinator.shared.isCarPlayConnected = false
    self.interfaceController = nil
  }
}

// MARK: - Live Icecast MP3 Streamer + Accelerate vDSP 52-Band FFT
final class IcecastAudioStreamer: NSObject, URLSessionDataDelegate {
  private let onState: (String, String?) -> Void
  private let onSpectrum: ([Double]) -> Void

  private var session: URLSession?
  private var dataTask: URLSessionDataTask?
  private var audioFileStream: AudioFileStreamID?

  private let engine = AVAudioEngine()
  private let playerNode = AVAudioPlayerNode()
  private let eqUnit = AVAudioUnitEQ(numberOfBands: 4)
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
    engine.attach(eqUnit)
    let eqFreqs: [Float] = [80, 400, 2400, 10000]
    for i in 0..<4 {
      let band = eqUnit.bands[i]
      band.filterType = (i == 0) ? .lowShelf : (i == 3 ? .highShelf : .parametric)
      band.frequency = eqFreqs[i]
      band.bandwidth = 1.0
      band.gain = 0
      band.bypass = false
    }

    let mixerFormat = engine.mainMixerNode.outputFormat(forBus: 0)
    self.targetFormat = AVAudioFormat(
      commonFormat: .pcmFormatFloat32,
      sampleRate: mixerFormat.sampleRate > 0 ? mixerFormat.sampleRate : 44100,
      channels: 2,
      interleaved: false
    )
    engine.connect(playerNode, to: eqUnit, format: targetFormat)
    engine.connect(eqUnit, to: engine.mainMixerNode, format: targetFormat)

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

  func applyEq(enabled: Bool, bands: [EqBandParamSwift]) {
    eqUnit.bypass = !enabled
    for i in 0..<min(4, bands.count) {
      let b = bands[i]
      eqUnit.bands[i].frequency = max(30.0, min(16000.0, b.freq))
      eqUnit.bands[i].gain = max(-12.0, min(12.0, b.gain))
      // Convert Q to octave bandwidth: BW = 2 * asinh(1 / (2 * Q)) / ln(2)
      let clampedQ = Double(max(0.3, min(8.0, b.q)))
      let bwOctaves = Float(2.0 * asinh(1.0 / (2.0 * clampedQ)) / log(2.0))
      eqUnit.bands[i].bandwidth = max(0.05, min(5.0, bwOctaves))
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
          let norm = Double(max(0.06, min(1.0, (db + 65.0) / 57.0)))
          smoothedBands[b] = smoothedBands[b] * 0.45 + norm * 0.55
          newBands[b] = smoothedBands[b]
        }

        self.onSpectrum(newBands)
      }
    }
  }
}
