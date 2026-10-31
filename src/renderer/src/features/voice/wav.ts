/** Speech models want 16 kHz mono; it's also small: about 32 KB a second. */
export const SPEECH_RATE = 16_000

/** 16-bit PCM WAV, the one format both OpenAI and whisper.cpp read without conversion. */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const bytes = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(bytes)
  const text = (offset: number, value: string): void => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i))
  }
  text(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true) // fmt chunk size
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // bytes per second
  view.setUint16(32, 2, true) // bytes per sample frame
  view.setUint16(34, 16, true) // bits per sample
  text(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  samples.forEach((sample, i) => {
    const clamped = Math.max(-1, Math.min(1, sample))
    view.setInt16(44 + i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
  })
  return new Uint8Array(bytes)
}

/** Whatever the microphone recorded (WebM/Opus in Chromium) as 16 kHz mono WAV. */
export async function toSpeechWav(recording: Blob): Promise<Uint8Array> {
  const context = new AudioContext()
  let decoded: AudioBuffer
  try {
    decoded = await context.decodeAudioData(await recording.arrayBuffer())
  } finally {
    await context.close()
  }
  // A one-channel offline context mixes down and resamples in one pass.
  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * SPEECH_RATE), SPEECH_RATE)
  const source = offline.createBufferSource()
  source.buffer = decoded
  source.connect(offline.destination)
  source.start()
  const rendered = await offline.startRendering()
  return encodeWav(rendered.getChannelData(0), SPEECH_RATE)
}
