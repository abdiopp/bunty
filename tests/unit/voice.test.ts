import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, type Settings } from '@shared/schemas'
import { createVoiceService } from '@main/services/voice-service'

const WAV = new Uint8Array([...Buffer.from('RIFF'), ...new Array(60).fill(0)])

describe('voice transcription', () => {
  let dir: string
  let settings: Settings

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'bunty-voice-test-'))
    settings = { ...DEFAULT_SETTINGS }
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  const ok = (body: unknown): Response =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })

  it('sends the recording to OpenAI as a WAV upload with the key and language', async () => {
    const fetch = vi.fn(async () => ok({ text: ' Call Ali tomorrow. ' }))
    settings.voiceLanguage = 'en'
    const voice = createVoiceService({
      settings: () => settings,
      apiKey: () => 'sk-test-key-0000000000',
      fetch
    })

    await expect(voice.transcribe(WAV)).resolves.toEqual({ text: 'Call Ali tomorrow.' })

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.openai.com/v1/audio/transcriptions')
    expect(init.headers).toEqual({ Authorization: 'Bearer sk-test-key-0000000000' })
    const form = init.body as FormData
    expect(form.get('model')).toBe('whisper-1')
    expect(form.get('language')).toBe('en')
    const file = form.get('file') as File
    expect(file.type).toBe('audio/wav')
    expect(file.size).toBe(WAV.byteLength)
  })

  it.each([
    [401, /rejected the API key/],
    [429, /rate limit or quota/],
    [500, /error 500/]
  ])('explains an OpenAI %i in plain words', async (status, message) => {
    const fetch = vi.fn(async () => new Response('{}', { status }))
    const voice = createVoiceService({
      settings: () => settings,
      apiKey: () => 'sk-x'.padEnd(24, 'x'),
      fetch
    })
    await expect(voice.transcribe(WAV)).rejects.toMatchObject({
      code: 'VOICE_FAILED',
      message: expect.stringMatching(message)
    })
  })

  it('says so when OpenAI is unreachable', async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })
    const voice = createVoiceService({
      settings: () => settings,
      apiKey: () => 'sk-x'.padEnd(24, 'x'),
      fetch
    })
    await expect(voice.transcribe(WAV)).rejects.toMatchObject({
      message: expect.stringMatching(/Couldn't reach OpenAI/)
    })
  })

  it('needs a key before using OpenAI', async () => {
    const voice = createVoiceService({ settings: () => settings, apiKey: () => null })
    await expect(voice.status()).resolves.toMatchObject({
      ready: false,
      problem: 'Add your OpenAI API key.'
    })
    await expect(voice.transcribe(WAV)).rejects.toMatchObject({ code: 'VOICE_SETUP' })
  })

  it('runs whisper.cpp on a temporary WAV and reads what it printed', async () => {
    const program = join(dir, 'whisper-cli')
    const model = join(dir, 'ggml-base.en.bin')
    writeFileSync(program, '')
    chmodSync(program, 0o755)
    writeFileSync(model, 'model')
    settings = { ...settings, voiceProvider: 'local', whisperPath: program, whisperModel: model }
    const run = vi.fn(async () => '  Water the plants\n')
    const voice = createVoiceService({ settings: () => settings, apiKey: () => null, run })

    await expect(voice.status()).resolves.toMatchObject({ provider: 'local', ready: true })
    await expect(voice.transcribe(WAV)).resolves.toEqual({ text: 'Water the plants' })
    const [file, args] = run.mock.calls[0] as unknown as [string, string[]]
    expect(file).toBe(program)
    expect(args).toEqual([
      '-m',
      model,
      '-f',
      expect.stringMatching(/speech\.wav$/),
      '-nt',
      '-np',
      '-l',
      'auto'
    ])
  })

  it('asks for the program and model when they are missing', async () => {
    settings = {
      ...settings,
      voiceProvider: 'local',
      whisperPath: join(dir, 'nope'),
      whisperModel: ''
    }
    const voice = createVoiceService({ settings: () => settings, apiKey: () => null })
    await expect(voice.status()).resolves.toMatchObject({
      ready: false,
      problem: 'Choose the whisper.cpp program.'
    })
    await expect(voice.transcribe(WAV)).rejects.toMatchObject({ code: 'VOICE_SETUP' })
  })

  it('treats silence as nothing heard', async () => {
    const fetch = vi.fn(async () => ok({ text: '   ' }))
    const voice = createVoiceService({
      settings: () => settings,
      apiKey: () => 'sk-x'.padEnd(24, 'x'),
      fetch
    })
    await expect(voice.transcribe(WAV)).rejects.toMatchObject({
      message: expect.stringMatching(/Didn't catch anything/)
    })
  })
})
