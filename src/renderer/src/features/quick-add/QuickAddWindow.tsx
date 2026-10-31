import { useEffect, useRef, useState } from 'react'
import { CornerDownLeft } from 'lucide-react'
import { Kbd } from '@renderer/components/ui/kbd'
import { useToday } from '@renderer/hooks/use-today'
import { useApp } from '@renderer/stores/app'
import { MicButton } from '../voice/MicButton'
import { useVoice } from '../voice/use-voice'
import { VoiceConfirm } from '../voice/VoiceConfirm'
import { QuickAddInput, type QuickAddInputHandle } from './QuickAddInput'
import { useQuickAdd } from './use-quick-add'

/** The global popup: add a task from anywhere in Windows, then get out of the way. */
export function QuickAddWindow(): React.JSX.Element {
  const today = useToday()
  // Unlike the Today view, a capture from anywhere has no implied date: it goes to the Inbox.
  const controller = useQuickAdd({}, today)
  const input = useRef<QuickAddInputHandle>(null)
  const card = useRef<HTMLDivElement>(null)
  const { reset } = controller
  const [heard, setHeard] = useState<string | null>(null)
  const voice = useVoice(setHeard)
  const { cancel } = voice

  useEffect(() => useApp.getState().start(), [])

  // Clicking elsewhere hides the popup; a recording in progress must not keep the mic open.
  useEffect(() => {
    const onHidden = (): void => {
      if (document.visibilityState === 'hidden') cancel()
    }
    document.addEventListener('visibilitychange', onHidden)
    return () => document.removeEventListener('visibilitychange', onHidden)
  }, [cancel])

  useEffect(
    () =>
      window.api.on('quickAdd:opened', () => {
        reset()
        cancel()
        setHeard(null)
        input.current?.focus()
      }),
    [reset, cancel]
  )

  // The window is sized to the card, so chips appearing make it grow rather than clip.
  useEffect(() => {
    const element = card.current
    if (!element) return
    const observer = new ResizeObserver(() => {
      void window.api.quickAdd.resize(Math.ceil(element.getBoundingClientRect().height) + 32)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const close = (): void => void window.api.quickAdd.close()

  return (
    <div className="p-4">
      <div
        ref={card}
        className="bg-popover text-popover-foreground border-border rounded-2xl border px-5 pt-4 pb-3 shadow-[0_18px_50px_-12px_rgb(0_0_0/0.35)]"
      >
        {heard !== null ? (
          <VoiceConfirm
            transcript={heard}
            today={today}
            onSaved={close}
            onCancel={() => setHeard(null)}
            onEditAsText={(text) => {
              setHeard(null)
              controller.setText(text)
              requestAnimationFrame(() => input.current?.focus())
            }}
          />
        ) : (
          <div className="flex items-start gap-3">
            <QuickAddInput
              ref={input}
              large
              controller={controller}
              today={today}
              placeholder="Add a task, or click the mic and say it…"
              className="min-w-0 flex-1"
              onSubmitted={close}
              onEscape={close}
            />
            <MicButton voice={voice} />
          </div>
        )}
        <div className="text-muted-foreground border-border mt-3 flex items-center gap-4 border-t pt-2.5 text-xs">
          <span className="flex items-center gap-1.5">
            <Kbd>
              <CornerDownLeft />
            </Kbd>
            add
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>Esc</Kbd>
            close
          </span>
          <span className="ml-auto truncate">tomorrow 5pm · #category · !high · every monday</span>
        </div>
      </div>
    </div>
  )
}
