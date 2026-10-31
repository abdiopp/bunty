import { execFile } from 'child_process'
import { access, constants, mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { promisify } from 'util'
import type { VoiceStatus } from '@shared/ipc'
import type { Settings } from '@shared/schemas'
import { AppError } from '../errors'

const OPENAI_URL = 'https://api.openai.com/v1/audio/transcriptions'
const OPENAI_MODEL = 'whisper-1'

interface Deps {
  settings: () => Settings
  apiKey: () => string | null
  /** Swappable in tests. */
  fetch?: typeof fetch
  run?: (file: string, args: string[]) => Promise<string>
}

const runProgram = async (file: string, args: string[]): Promise<string> => {
  const { stdout } = await promisify(execFile)(file, args, {
    timeout: 120_000,
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024
  })
  return stdout
}

async function exists(path: string, mode = constants.R_OK): Promise<boolean> {
  if (!path) return false
  try {
    await access(path, mode)
    return true
  } catch {
    return false
  }
}

/** Whisper's output is a sentence; quick add wants a phrase, so drop the full stop. */
function tidy(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * Speech to text, through OpenAI's Whisper API or a local whisper.cpp. Audio arrives as 16 kHz
 * mono WAV, which both accept, so nothing here needs ffmpeg.
 */
export function createVoiceService({
  settings,
  apiKey,
  fetch: request = fetch,
  run = runProgram
}: Deps) {
  async function status(): Promise<VoiceStatus> {
    const { voiceProvider, whisperPath, whisperModel } = settings()
    const hasKey = apiKey() !== null
    switch (voiceProvider) {
      case 'off':
        return { provider: 'off', ready: false, hasKey, problem: 'Voice input is turned off.' }
      case 'openai':
        return hasKey
          ? { provider: 'openai', ready: true, hasKey }
          : { provider: 'openai', ready: false, hasKey, problem: 'Add your OpenAI API key.' }
      case 'local': {
        const problem = !(await exists(whisperPath, constants.X_OK))
          ? 'Choose the whisper.cpp program.'
          : !(await exists(whisperModel))
            ? 'Choose a whisper.cpp model file.'
            : undefined
        return { provider: 'local', ready: !problem, hasKey, problem }
      }
    }
  }

  async function viaOpenAi(wav: Uint8Array, language: string): Promise<string> {
    const key = apiKey()
    if (!key) throw new AppError('VOICE_SETUP', 'Add your OpenAI API key in Settings first.')
    const form = new FormData()
    form.append('file', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'speech.wav')
    form.append('model', OPENAI_MODEL)
    form.append('response_format', 'json')
    if (language) form.append('language', language)

    let response: Response
    try {
      response = await request(OPENAI_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}` },
        body: form,
        signal: AbortSignal.timeout(60_000)
      })
    } catch {
      throw new AppError(
        'VOICE_FAILED',
        "Couldn't reach OpenAI. Check your connection, or switch to offline transcription."
      )
    }
    if (!response.ok) {
      const reason =
        response.status === 401
          ? 'OpenAI rejected the API key. Check it in Settings.'
          : response.status === 429
            ? "OpenAI's rate limit or quota was reached. Try again shortly, or check your plan."
            : response.status === 413
              ? 'That recording is too long to transcribe.'
              : `OpenAI couldn't transcribe that (error ${response.status}).`
      throw new AppError('VOICE_FAILED', reason)
    }
    const body = (await response.json()) as { text?: unknown }
    return typeof body.text === 'string' ? body.text : ''
  }

  async function viaWhisperCpp(wav: Uint8Array, language: string): Promise<string> {
    const { whisperPath, whisperModel } = settings()
    if (!(await exists(whisperPath, constants.X_OK)) || !(await exists(whisperModel))) {
      throw new AppError('VOICE_SETUP', 'Choose the whisper.cpp program and model in Settings.')
    }
    const folder = await mkdtemp(join(tmpdir(), 'bunty-voice-'))
    const file = join(folder, 'speech.wav')
    try {
      await writeFile(file, wav)
      // -nt: no timestamps, -np: no progress or system info, so stdout is just the words.
      const args = ['-m', whisperModel, '-f', file, '-nt', '-np', '-l', language || 'auto']
      return await run(whisperPath, args)
    } catch (err) {
      if (err instanceof AppError) throw err
      throw new AppError('VOICE_FAILED', 'whisper.cpp failed to transcribe the recording.')
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
  }

  return {
    status,

    async transcribe(wav: Uint8Array): Promise<{ text: string }> {
      const { voiceProvider, voiceLanguage } = settings()
      if (voiceProvider === 'off') {
        throw new AppError('VOICE_SETUP', 'Voice input is turned off in Settings.')
      }
      const raw =
        voiceProvider === 'openai'
          ? await viaOpenAi(wav, voiceLanguage)
          : await viaWhisperCpp(wav, voiceLanguage)
      const text = tidy(raw)
      if (!text) {
        throw new AppError('VOICE_FAILED', "Didn't catch anything. Try again, a little closer.")
      }
      return { text }
    }
  }
}

export type VoiceService = ReturnType<typeof createVoiceService>
