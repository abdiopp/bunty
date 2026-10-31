import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { ApiFailure } from '@shared/ipc'
import { toSpeechWav } from './wav'

/** Long enough for any task; short enough to stay well under upload limits. */
const MAX_SECONDS = 120

export type VoicePhase = 'idle' | 'recording' | 'transcribing'

function microphoneProblem(error: unknown): string {
  const name = (error as DOMException)?.name
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Bunty can’t use the microphone. Allow it in Windows Settings › Privacy & security › Microphone.'
  }
  if (name === 'NotFoundError') return 'No microphone found.'
  return 'The microphone couldn’t be started.'
}

/**
 * Record, then transcribe. Recording happens here; transcription in the main process, so the
 * API key never reaches a page.
 */
export function useVoice(onTranscript: (text: string) => void) {
  const [phase, setPhase] = useState<VoicePhase>('idle')
  const [seconds, setSeconds] = useState(0)
  const recorder = useRef<MediaRecorder | null>(null)
  const discard = useRef(false)
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  // From the click until the result is in, so a second click can't start a second recorder.
  const busy = useRef(false)
  // Bumped by every start and cancel: a start still waiting for the microphone checks it to
  // see whether it was called off in the meantime.
  const attempt = useRef(0)
  const deliver = useRef(onTranscript)
  useEffect(() => {
    deliver.current = onTranscript
  })

  const finish = useCallback(async (chunks: Blob[], mimeType: string): Promise<void> => {
    clearInterval(timer.current)
    if (discard.current) {
      busy.current = false
      setPhase('idle')
      return
    }
    setPhase('transcribing')
    try {
      const wav = await toSpeechWav(new Blob(chunks, { type: mimeType }))
      const { text } = await window.api.voice.transcribe(wav)
      deliver.current(text)
    } catch (err) {
      const message = (err as ApiFailure).message ?? 'That recording couldn’t be read.'
      toast.error(message)
    } finally {
      busy.current = false
      setPhase('idle')
    }
  }, [])

  const start = useCallback(async (): Promise<void> => {
    if (busy.current) return
    busy.current = true
    const mine = ++attempt.current
    const calledOff = (): boolean => attempt.current !== mine

    const status = await window.api.voice.status().catch(() => null)
    if (calledOff() || !status?.ready) {
      busy.current = false
      if (!calledOff()) {
        toast.error(status?.problem ?? 'Voice input isn’t set up.', {
          description: 'Set it up in Bunty’s Settings, under Voice input.'
        })
      }
      return
    }
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true }
      })
    } catch (err) {
      busy.current = false
      if (!calledOff()) toast.error(microphoneProblem(err))
      return
    }
    if (calledOff()) {
      // Dismissed while the microphone was starting: let it go again straight away.
      stream.getTracks().forEach((track) => track.stop())
      busy.current = false
      return
    }
    const chunks: Blob[] = []
    const media = new MediaRecorder(stream)
    media.ondataavailable = (event) => event.data.size && chunks.push(event.data)
    media.onstop = () => {
      stream.getTracks().forEach((track) => track.stop())
      void finish(chunks, media.mimeType)
    }
    discard.current = false
    recorder.current = media
    media.start()
    setSeconds(0)
    setPhase('recording')
    timer.current = setInterval(() => {
      setSeconds((value) => {
        if (value + 1 >= MAX_SECONDS) recorder.current?.stop()
        return value + 1
      })
    }, 1000)
  }, [finish])

  const stop = useCallback((): void => {
    if (recorder.current?.state === 'recording') recorder.current.stop()
  }, [])

  const cancel = useCallback((): void => {
    discard.current = true
    // A start still waiting on the microphone gives up as soon as it hears back.
    attempt.current += 1
    stop()
  }, [stop])

  // Leaving mid-recording must not keep the microphone open.
  useEffect(() => cancel, [cancel])

  return { phase, seconds, start, stop, cancel }
}
