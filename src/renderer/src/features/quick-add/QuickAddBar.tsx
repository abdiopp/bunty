import { useEffect, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { addDays } from '@shared/dates'
import type { Task } from '@shared/ipc'
import { Kbd } from '@renderer/components/ui/kbd'
import { dayLabel } from '@renderer/lib/format'
import { cn } from '@renderer/lib/utils'
import { useUi, type View } from '@renderer/stores/ui'
import { UPCOMING_DAYS } from '../tasks/sections'
import { MicButton } from '../voice/MicButton'
import { useVoice } from '../voice/use-voice'
import { VoiceConfirm } from '../voice/VoiceConfirm'
import { QuickAddInput, type QuickAddInputHandle } from './QuickAddInput'
import { useQuickAdd, type QuickAddDefaults } from './use-quick-add'

function defaultsFor(view: View, today: string): QuickAddDefaults {
  if (view.kind === 'today') return { date: today }
  if (view.kind === 'category') return { categoryId: view.id }
  return {}
}

/** Where a new task will show up, so we can say so when it isn't on screen. */
function viewFor(task: Task, today: string): View {
  if (!task.date) return { kind: 'inbox' }
  if (task.date <= today) return { kind: 'today' }
  return { kind: 'upcoming' }
}

function isVisibleIn(view: View, task: Task, today: string): boolean {
  switch (view.kind) {
    case 'today':
      return task.date !== null && task.date <= today
    case 'upcoming':
      return task.date !== null && task.date > today && task.date <= addDays(today, UPCOMING_DAYS)
    case 'inbox':
      return task.date === null
    case 'category':
      return task.categoryId === view.id
    default:
      return false
  }
}

interface Props {
  view: View
  today: string
  /** Overrides what the view implies, e.g. the calendar's selected day. */
  defaults?: QuickAddDefaults
  /** Overrides whether a new task is on screen, so we know whether to say where it went. */
  isVisible?: (task: Task) => boolean
  placeholder?: string
}

export function QuickAddBar({
  view,
  today,
  defaults,
  isVisible,
  placeholder = 'Add a task — try “Call Ali tomorrow at 5pm #work !high”'
}: Props): React.JSX.Element {
  const effectiveDefaults = defaults ?? defaultsFor(view, today)
  const controller = useQuickAdd(effectiveDefaults, today)
  const input = useRef<QuickAddInputHandle>(null)
  const [focused, setFocused] = useState(false)
  const [heard, setHeard] = useState<string | null>(null)
  const voice = useVoice(setHeard)
  const focusRequest = useUi((state) => state.quickAddFocus)

  useEffect(() => {
    if (focusRequest) input.current?.focus()
  }, [focusRequest])

  // A new view (or day) brings new defaults; don't carry dismissed ones over.
  const defaultsKey = JSON.stringify([view, effectiveDefaults])
  const { reset } = controller
  useEffect(() => reset(), [defaultsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const announce = (task: Task): void => {
    if (isVisible ? isVisible(task) : isVisibleIn(view, task, today)) {
      useUi.getState().select(task.id)
      return
    }
    const where = task.date ? dayLabel(task.date, today) : 'Inbox'
    toast.success(`Added “${task.title}” · ${where}`, {
      action: {
        label: 'Show',
        onClick: () => {
          useUi.getState().setView(viewFor(task, today))
          useUi.getState().openDetail(task.id)
        }
      }
    })
  }

  return (
    <div
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      className={cn(
        'bg-card rounded-xl border px-3.5 py-2.5 shadow-xs transition-[border-color,box-shadow]',
        focused && 'border-ring/60 ring-ring/20 ring-3'
      )}
    >
      {heard !== null ? (
        <VoiceConfirm
          transcript={heard}
          today={today}
          defaultDate={effectiveDefaults.date ?? null}
          onSaved={(task) => {
            setHeard(null)
            announce(task)
          }}
          onCancel={() => setHeard(null)}
          onEditAsText={(text) => {
            setHeard(null)
            controller.setText(text)
            requestAnimationFrame(() => input.current?.focus())
          }}
        />
      ) : (
        <div className="flex items-start gap-3">
          <Plus className="text-muted-foreground mt-0.5 size-4 shrink-0" />
          <QuickAddInput
            ref={input}
            controller={controller}
            today={today}
            placeholder={placeholder}
            className="min-w-0 flex-1"
            onSubmitted={announce}
            onEscape={() => (document.activeElement as HTMLElement | null)?.blur()}
          />
          {!focused && !controller.draft.text && voice.phase === 'idle' && (
            <Kbd className="mt-0.5">N</Kbd>
          )}
          <MicButton voice={voice} />
        </div>
      )}
    </div>
  )
}
