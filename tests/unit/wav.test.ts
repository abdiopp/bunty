import { describe, expect, it } from 'vitest'
import { encodeWav, SPEECH_RATE } from '@renderer/features/voice/wav'

describe('WAV encoding', () => {
  it('writes a 16 kHz mono 16-bit header and clamped samples', () => {
    const wav = encodeWav(new Float32Array([0, 1, -1, 2, -2, 0.5]), SPEECH_RATE)
    const view = new DataView(wav.buffer)
    const text = (offset: number, length: number): string =>
      String.fromCharCode(...wav.slice(offset, offset + length))

    expect(text(0, 4)).toBe('RIFF')
    expect(text(8, 4)).toBe('WAVE')
    expect(view.getUint16(22, true)).toBe(1)
    expect(view.getUint32(24, true)).toBe(16_000)
    expect(view.getUint16(34, true)).toBe(16)
    expect(view.getUint32(40, true)).toBe(12)
    expect(wav.byteLength).toBe(44 + 12)
    const samples = Array.from({ length: 6 }, (_, i) => view.getInt16(44 + i * 2, true))
    expect(samples).toEqual([0, 32767, -32768, 32767, -32768, 16383])
  })
})
