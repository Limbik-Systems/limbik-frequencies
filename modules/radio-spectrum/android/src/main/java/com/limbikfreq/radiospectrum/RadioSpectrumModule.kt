package com.limbikfreq.radiospectrum

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.audiofx.Equalizer
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.nio.ByteOrder
import kotlin.concurrent.thread
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.ln
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

private const val BAND_COUNT = 52
private const val FFT_SIZE = 2048

class RadioSpectrumModule : Module() {
  @Volatile
  private var isRunning = false
  private var workerThread: Thread? = null
  private val smoothedBands = DoubleArray(BAND_COUNT) { 0.06 }
  private var equalizer: Equalizer? = null
  private var eqEnabled = true
  private var eqGains = DoubleArray(5) { 0.0 }

  override fun definition() = ModuleDefinition {
    Name("RadioSpectrum")

    Events("onStateChange", "onSpectrum")

    OnDestroy {
      stopInternal()
    }

    AsyncFunction("play") { url: String ->
      stopInternal()
      startStream(url)
    }

    AsyncFunction("stop") {
      stopInternal()
      sendEvent("onStateChange", mapOf("state" to "stopped"))
      sendEvent("onSpectrum", mapOf("bands" to List(BAND_COUNT) { 0.0 }))
    }

    AsyncFunction("setNowPlaying") { _: Map<String, Any?> ->
      // Handled by MediaSession / system notification layer
    }

    AsyncFunction("setEq") { enabled: Boolean, bands: List<Map<String, Any?>>, _: String?, _: List<Map<String, Any?>>? ->
      eqEnabled = enabled
      for (i in 0 until min(4, bands.size)) {
        val g = (bands[i]["gain"] as? Number)?.toDouble() ?: 0.0
        eqGains[i] = max(-12.0, min(12.0, g))
      }
      applyAndroidEq()
    }
  }

  private fun startStream(url: String) {
    isRunning = true
    sendEvent("onStateChange", mapOf("state" to "buffering"))

    workerThread = thread(start = true, name = "LimbikRadioStream") {
      var extractor: MediaExtractor? = null
      var codec: MediaCodec? = null
      var audioTrack: AudioTrack? = null

      try {
        extractor = MediaExtractor()
        extractor.setDataSource(url)

        var audioTrackIndex = -1
        var inputFormat: MediaFormat? = null
        for (i in 0 until extractor.trackCount) {
          val fmt = extractor.getTrackFormat(i)
          val mime = fmt.getString(MediaFormat.KEY_MIME) ?: ""
          if (mime.startsWith("audio/")) {
            audioTrackIndex = i
            inputFormat = fmt
            break
          }
        }

        if (audioTrackIndex < 0 || inputFormat == null) {
          sendEvent("onStateChange", mapOf("state" to "error", "error" to "No audio track found"))
          return@thread
        }

        extractor.selectTrack(audioTrackIndex)
        val mime = inputFormat.getString(MediaFormat.KEY_MIME) ?: "audio/mpeg"
        val sampleRate = if (inputFormat.containsKey(MediaFormat.KEY_SAMPLE_RATE)) {
          inputFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE)
        } else 44100
        val channels = if (inputFormat.containsKey(MediaFormat.KEY_CHANNEL_COUNT)) {
          inputFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
        } else 2

        codec = MediaCodec.createDecoderByType(mime)
        codec.configure(inputFormat, null, null, 0)
        codec.start()

        val channelMask = if (channels == 1) AudioFormat.CHANNEL_OUT_MONO else AudioFormat.CHANNEL_OUT_STEREO
        val minBuf = AudioTrack.getMinBufferSize(sampleRate, channelMask, AudioFormat.ENCODING_PCM_16BIT)

        audioTrack = AudioTrack.Builder()
          .setAudioAttributes(
            AudioAttributes.Builder()
              .setUsage(AudioAttributes.USAGE_MEDIA)
              .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
              .build()
          )
          .setAudioFormat(
            AudioFormat.Builder()
              .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
              .setSampleRate(sampleRate)
              .setChannelMask(channelMask)
              .build()
          )
          .setBufferSizeInBytes(max(minBuf * 2, 16384))
          .setTransferMode(AudioTrack.MODE_STREAM)
          .build()

        audioTrack.play()
        try {
          equalizer?.release()
          equalizer = Equalizer(0, audioTrack.audioSessionId)
          applyAndroidEq()
        } catch (_: Exception) {}
        sendEvent("onStateChange", mapOf("state" to "playing"))

        val bufferInfo = MediaCodec.BufferInfo()
        val pcmRing = FloatArray(FFT_SIZE)
        var ringPos = 0
        var lastEmitMs = 0L

        while (isRunning) {
          val inIdx = codec.dequeueInputBuffer(10_000)
          if (inIdx >= 0) {
            val inBuf = codec.getInputBuffer(inIdx)
            if (inBuf != null) {
              val sampleSize = extractor.readSampleData(inBuf, 0)
              if (sampleSize < 0) {
                codec.queueInputBuffer(inIdx, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
              } else {
                codec.queueInputBuffer(inIdx, 0, sampleSize, extractor.sampleTime, 0)
                extractor.advance()
              }
            }
          }

          val outIdx = codec.dequeueOutputBuffer(bufferInfo, 10_000)
          if (outIdx >= 0) {
            val outBuf = codec.getOutputBuffer(outIdx)
            if (outBuf != null && bufferInfo.size > 0) {
              val chunk = ByteArray(bufferInfo.size)
              outBuf.position(bufferInfo.offset)
              outBuf.get(chunk)
              audioTrack.write(chunk, 0, chunk.size)

              val shortBuf = java.nio.ByteBuffer.wrap(chunk).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer()
              val step = max(1, channels)
              var idx = 0
              while (idx < shortBuf.limit()) {
                pcmRing[ringPos] = shortBuf.get(idx) / 32768.0f
                ringPos = (ringPos + 1) % FFT_SIZE
                idx += step
              }

              val nowMs = System.currentTimeMillis()
              if (nowMs - lastEmitMs >= 33L) {
                lastEmitMs = nowMs
                val bands = computeSpectrum(pcmRing, ringPos, sampleRate)
                sendEvent("onSpectrum", mapOf("bands" to bands))
              }
            }
            codec.releaseOutputBuffer(outIdx, false)
            if ((bufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) break
          }
        }
      } catch (e: Exception) {
        if (isRunning) {
          sendEvent("onStateChange", mapOf("state" to "error", "error" to (e.message ?: "Stream error")))
        }
      } finally {
        try { equalizer?.release() } catch (_: Exception) {}
        equalizer = null
        try { audioTrack?.stop() } catch (_: Exception) {}
        try { audioTrack?.release() } catch (_: Exception) {}
        try { codec?.stop() } catch (_: Exception) {}
        try { codec?.release() } catch (_: Exception) {}
        try { extractor?.release() } catch (_: Exception) {}
      }
    }
  }

  private fun applyAndroidEq() {
    val eq = equalizer ?: return
    try {
      eq.enabled = eqEnabled
      val numBands = eq.numberOfBands.toInt()
      val range = eq.bandLevelRange
      val minLevel = range[0].toDouble()
      val maxLevel = range[1].toDouble()
      for (b in 0 until min(numBands, 5)) {
        val db = eqGains[b]
        val normalized = (db + 12.0) / 24.0
        val level = (minLevel + normalized * (maxLevel - minLevel)).toInt().toShort()
        eq.setBandLevel(b.toShort(), level)
      }
    } catch (_: Exception) {}
  }

  private fun stopInternal() {
    isRunning = false
    try {
      workerThread?.join(400)
    } catch (_: Exception) {}
    workerThread = null
  }

  private fun computeSpectrum(ring: FloatArray, offset: Int, sampleRate: Int): List<Double> {
    val re = DoubleArray(FFT_SIZE)
    val im = DoubleArray(FFT_SIZE)

    for (i in 0 until FFT_SIZE) {
      val sample = ring[(offset + i) % FFT_SIZE].toDouble()
      val hann = 0.5 * (1.0 - cos(2.0 * PI * i / (FFT_SIZE - 1)))
      re[i] = sample * hann
    }

    fftRadix2(re, im)

    val halfN = FFT_SIZE / 2
    val minFreq = 45.0
    val maxFreq = min(16000.0, sampleRate * 0.45)
    val out = ArrayList<Double>(BAND_COUNT)

    for (b in 0 until BAND_COUNT) {
      val fLow = minFreq * (maxFreq / minFreq).pow(b.toDouble() / BAND_COUNT)
      val fHigh = minFreq * (maxFreq / minFreq).pow((b + 1).toDouble() / BAND_COUNT)
      val binLow = max(1, min(halfN - 1, (fLow * FFT_SIZE / sampleRate).toInt()))
      val binHigh = max(binLow, min(halfN - 1, (fHigh * FFT_SIZE / sampleRate).toInt()))

      var peak = 0.0
      for (bin in binLow..binHigh) {
        val mag = sqrt(re[bin] * re[bin] + im[bin] * im[bin])
        if (mag > peak) peak = mag
      }

      val rms = peak / halfN
      val db = 20.0 * log10(max(rms, 1e-6))
      val norm = max(0.06, min(1.0, (db + 65.0) / 57.0))
      smoothedBands[b] = smoothedBands[b] * 0.45 + norm * 0.55
      out.add(smoothedBands[b])
    }
    return out
  }

  private fun fftRadix2(re: DoubleArray, im: DoubleArray) {
    val n = re.size
    var j = 0
    for (i in 1 until n) {
      var bit = n shr 1
      while (j and bit != 0) {
        j = j xor bit
        bit = bit shr 1
      }
      j = j xor bit
      if (i < j) {
        val tr = re[i]; re[i] = re[j]; re[j] = tr
        val ti = im[i]; im[i] = im[j]; im[j] = ti
      }
    }

    var len = 2
    while (len <= n) {
      val ang = -2.0 * PI / len
      val wLenRe = cos(ang)
      val wLenIm = sin(ang)
      var i = 0
      while (i < n) {
        var wRe = 1.0
        var wIm = 0.0
        for (k in 0 until len / 2) {
          val uRe = re[i + k]
          val uIm = im[i + k]
          val vRe = re[i + k + len / 2] * wRe - im[i + k + len / 2] * wIm
          val vIm = re[i + k + len / 2] * wIm + im[i + k + len / 2] * wRe
          re[i + k] = uRe + vRe
          im[i + k] = uIm + vIm
          re[i + k + len / 2] = uRe - vRe
          im[i + k + len / 2] = uIm - vIm
          val nextWRe = wRe * wLenRe - wIm * wLenIm
          wIm = wRe * wLenIm + wIm * wLenRe
          wRe = nextWRe
        }
        i += len
      }
      len = len shl 1
    }
  }
}
