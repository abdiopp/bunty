import { Loader2, Mic, Square } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import type { useVoice } from './use-voice'

/** Click to record, click again to transcribe. Esc while recording discards it. */
export function MicButton({ voice }: { voice: ReturnType<typeof useVoice> }): React.JSX.Element {
  const { phase, seconds } = voice
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

  return (
    <button
      type="button"
      aria-label={
        phase === 'recording'
          ? 'Stop recording'
          : phase === 'transcribing'
            ? 'Transcribing'
            : 'Add by voice'
      }
      title={phase === 'idle' ? 'Add by voice' : undefined}
      disabled={phase === 'transcribing'}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => (phase === 'recording' ? voice.stop() : void voice.start())}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && phase === 'recording') {
          event.stopPropagation()
          voice.cancel()
        }
      }}
      className={cn(
        'flex h-6 shrink-0 items-center gap-1.5 rounded-full px-1.5 text-xs transition-colors',
        phase === 'recording'
          ? 'bg-red-500/12 text-red-600 dark:text-red-400'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      )}
    >
      {phase === 'recording' ? (
        <>
          <span className="relative grid size-3 place-items-center">
            <span className="absolute size-3 animate-ping rounded-full bg-red-500/50" />
            <Square className="size-2.5 fill-current" />
          </span>
          <span className="tabular-nums">{clock}</span>
        </>
      ) : phase === 'transcribing' ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Mic className="size-4" />
      )}
    </button>
  )
}
