import { useState } from 'react'
import { Mic, Pencil, Repeat2 } from 'lucide-react'
import type { Task } from '@shared/ipc'
import { parseQuickAdd } from '@shared/quick-add'
import type { Priority, Recurrence } from '@shared/schemas'
import { Button } from '@renderer/components/ui/button'
import { findCategory } from '@renderer/lib/categories'
import { cn } from '@renderer/lib/utils'
import { useApp } from '@renderer/stores/app'
import { describeRepeat } from '../quick-add/describe-repeat'
import { attempt } from '../tasks/actions'

interface Props {
  transcript: string
  today: string
  /** Used when the words didn't name a date, e.g. the day the calendar has selected. */
  defaultDate?: string | null
  onSaved: (task: Task) => void
  onCancel: () => void
  /** Puts the words into the text box instead, for fixes that are easier typed. */
  onEditAsText: (text: string) => void
}

const fieldClass =
  'bg-background border-input focus-visible:border-ring focus-visible:ring-ring/40 h-8 rounded-md border px-2 text-sm outline-none focus-visible:ring-2'

/**
 * What was heard, already read into a task, with every part editable before it's saved. Native
 * date and time inputs, so their pickers open as OS popups even inside the small quick-add window.
 */
export function VoiceConfirm({
  transcript,
  today,
  defaultDate = null,
  onSaved,
  onCancel,
  onEditAsText
}: Props): React.JSX.Element {
  const info = useApp((state) => state.info)
  const categories = useApp((state) => state.categories)
  const [initial] = useState(() =>
    parseQuickAdd(transcript, { now: new Date(), dayFirst: info?.dayFirst })
  )

  const [title, setTitle] = useState(initial.title)
  const [date, setDate] = useState(initial.date ?? defaultDate ?? '')
  const [time, setTime] = useState(initial.time ?? '')
  const [priority, setPriority] = useState<Priority>(initial.priority ?? 'medium')
  const [categoryId, setCategoryId] = useState(
    (initial.category && findCategory(categories, initial.category)?.id) ?? ''
  )
  const [recurrence, setRecurrence] = useState<Recurrence | null>(initial.recurrence)
  const [saving, setSaving] = useState(false)

  const problem = !title.trim()
    ? 'Add a title.'
    : date && date < today
      ? 'That date has passed.'
      : time && !date && !recurrence
        ? 'Pick a date for that time.'
        : null

  const save = async (): Promise<void> => {
    if (problem || saving) return
    setSaving(true)
    const task = await attempt(() =>
      window.api.tasks.create({
        title: title.trim(),
        date: date || null,
        time: time || null,
        priority,
        categoryId: categoryId || null,
        recurrence: recurrence ?? undefined
      })
    )
    setSaving(false)
    if (task) onSaved(task)
  }

  return (
    <form
      aria-label="Confirm task"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          onCancel()
        }
      }}
      className="animate-in fade-in-0 slide-in-from-top-1 flex flex-col gap-3 duration-150"
    >
      <p className="text-muted-foreground flex items-start gap-2 text-xs">
        <Mic className="mt-px size-3.5 shrink-0" />
        <span className="italic">“{transcript}”</span>
      </p>

      <input
        aria-label="Title"
        value={title}
        autoFocus
        onChange={(event) => setTitle(event.currentTarget.value)}
        className={cn(fieldClass, 'h-9 text-base font-medium')}
      />

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          aria-label="Date"
          value={date}
          min={today}
          onChange={(event) => setDate(event.currentTarget.value)}
          className={fieldClass}
        />
        <input
          type="time"
          aria-label="Time"
          value={time}
          onChange={(event) => setTime(event.currentTarget.value)}
          className={cn(fieldClass, 'tabular-nums')}
        />
        <div
          role="radiogroup"
          aria-label="Priority"
          className="flex overflow-hidden rounded-md border"
        >
          {(['high', 'medium', 'low'] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={priority === value}
              onClick={() => setPriority(value)}
              className={cn(
                'h-8 px-2.5 text-xs capitalize transition-colors',
                priority === value ? 'bg-primary/12 font-medium' : 'hover:bg-accent'
              )}
            >
              {value}
            </button>
          ))}
        </div>
        <select
          aria-label="Category"
          value={categoryId}
          onChange={(event) => setCategoryId(event.currentTarget.value)}
          className={fieldClass}
        >
          <option value="">No category</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        {recurrence && (
          <button
            type="button"
            title="Don’t repeat"
            onClick={() => setRecurrence(null)}
            className="bg-muted/60 flex h-8 items-center gap-1.5 rounded-md px-2 text-xs"
          >
            <Repeat2 className="size-3.5" />
            {describeRepeat(recurrence, date || today)} ×
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => onEditAsText(transcript)}>
          <Pencil />
          Edit as text
        </Button>
        <span className="text-overdue ml-auto text-xs" role="status">
          {problem && title ? problem : ''}
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={problem !== null || saving}>
          Save task
        </Button>
      </div>
    </form>
  )
}
