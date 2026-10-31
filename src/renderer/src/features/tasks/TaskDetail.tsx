import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CalendarDays,
  Circle,
  CirclePlus,
  Clock,
  Flame,
  History,
  MoreHorizontal,
  X
} from 'lucide-react'
import type { ActivityEntry, Task } from '@shared/ipc'
import type { Priority, Recurrence, SeriesScope } from '@shared/schemas'
import { Button } from '@renderer/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@renderer/components/ui/toggle-group'
import { useToday } from '@renderer/hooks/use-today'
import { dayLabel, inSentence, relativeTime } from '@renderer/lib/format'
import { cn } from '@renderer/lib/utils'
import { useApp } from '@renderer/stores/app'
import { useUi } from '@renderer/stores/ui'
import { useStreakSummary } from '../streaks/use-streaks'
import { attempt, taskActions } from './actions'
import { ACTIVITY_ICON, describeActivity } from './activity-text'
import { DateChoices } from './DateChoices'
import { TaskCheckbox } from './TaskCheckbox'
import { TaskMenuItems } from './TaskMenu'

/** The side panel: every field of one task, editable, plus its history. */
export function TaskDetail({ id }: { id: string }): React.JSX.Element | null {
  const [task, setTask] = useState<Task | null>(null)
  const [history, setHistory] = useState<ActivityEntry[]>([])
  const [scope, setScope] = useState<SeriesScope>('this')
  const today = useToday()

  useEffect(() => {
    let current = true
    const load = async (): Promise<void> => {
      try {
        const [next, entries] = await Promise.all([
          window.api.tasks.get(id),
          window.api.activity.list({ taskId: id, limit: 50 })
        ])
        if (current) {
          setTask(next)
          setHistory(entries)
        }
      } catch {
        // Deleted, from here or another window.
        if (current) useUi.getState().closeDetail()
      }
    }
    void load()
    const stop = window.api.on('tasks:changed', ({ ids }) => {
      if (ids.includes(id)) void load()
    })
    return () => {
      current = false
      stop()
    }
  }, [id])

  if (!task) return null
  const repeats = task.seriesId !== null
  const done = task.status === 'done'
  const update = (patch: Parameters<typeof window.api.tasks.update>[0]['patch']) =>
    attempt(() => window.api.tasks.update({ id, patch, scope }))

  return (
    <aside
      aria-label="Task details"
      className="border-border flex w-[380px] shrink-0 flex-col border-l animate-[panel-in_180ms_ease-out]"
    >
      <div className="flex items-center justify-end gap-1 px-3 pt-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="More actions">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <TaskMenuItems task={task} today={today} kind="dropdown" />
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Close details"
          onClick={() => useUi.getState().closeDetail()}
        >
          <X />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-8">
        <div className="flex items-start gap-3">
          <TaskCheckbox
            task={task}
            onToggle={() => void taskActions.toggle(task)}
            className="mt-[5px]"
          />
          <TitleField key={`${task.id}:${task.title}`} task={task} scope={scope} />
        </div>

        <NotesField key={`${task.id}:notes:${task.notes}`} task={task} scope={scope} />

        {repeats && (
          <div className="bg-muted/60 mt-4 flex items-center justify-between rounded-lg px-3 py-2 text-xs">
            <span className="text-muted-foreground">Edits apply to</span>
            <ToggleGroup
              type="single"
              size="sm"
              value={scope}
              onValueChange={(value) => value && setScope(value as SeriesScope)}
            >
              <ToggleGroupItem value="this" className="h-6 px-2 text-xs">
                This task
              </ToggleGroupItem>
              <ToggleGroupItem value="following" className="h-6 px-2 text-xs">
                This and later
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        )}

        <dl className="mt-5 grid grid-cols-[92px_1fr] items-center gap-x-3 gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">When</dt>
          <dd>
            <WhenField task={task} today={today} />
          </dd>

          <dt className="text-muted-foreground">Time</dt>
          <dd>
            <TimeField
              key={`${task.id}:${task.time}`}
              task={task}
              onSave={(time) => update({ time })}
            />
          </dd>

          <dt className="text-muted-foreground">Priority</dt>
          <dd>
            <PriorityField value={task.priority} onChange={(priority) => update({ priority })} />
          </dd>

          <dt className="text-muted-foreground">Category</dt>
          <dd>
            <CategoryField
              value={task.categoryId}
              onChange={(categoryId) => update({ categoryId })}
            />
          </dd>

          <dt className="text-muted-foreground">Repeat</dt>
          <dd>
            <RepeatField task={task} />
          </dd>
        </dl>

        {task.seriesId && <HabitStreak seriesId={task.seriesId} />}

        <p className="text-muted-foreground mt-5 text-xs leading-relaxed">
          Created {inSentence(relativeTime(task.createdAt, new Date(), today))}
          {task.rescheduleCount > 0 && task.originalDate && (
            <>
              {' · '}originally {inSentence(dayLabel(task.originalDate, today))}, moved{' '}
              {task.rescheduleCount}×
            </>
          )}
          {done && task.completedAt && (
            <> · done {inSentence(relativeTime(task.completedAt, new Date(), today))}</>
          )}
        </p>

        <TaskHistory entries={history} today={today} />
      </div>
    </aside>
  )
}

function TitleField({ task, scope }: { task: Task; scope: SeriesScope }): React.JSX.Element {
  return (
    <textarea
      aria-label="Title"
      defaultValue={task.title}
      rows={1}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          event.currentTarget.blur()
        }
        if (event.key === 'Escape') {
          event.currentTarget.value = task.title
          event.currentTarget.blur()
        }
      }}
      onBlur={(event) => {
        const value = event.currentTarget.value
        if (!value.trim()) event.currentTarget.value = task.title
        else void taskActions.rename(task, value, scope)
      }}
      className={cn(
        'min-w-0 flex-1 resize-none bg-transparent text-lg leading-snug font-semibold outline-none [field-sizing:content]',
        task.status === 'done' && 'text-muted-foreground'
      )}
    />
  )
}

/** Saved when you leave the field (or the panel), not on every keystroke, so history stays readable. */
function NotesField({ task, scope }: { task: Task; scope: SeriesScope }): React.JSX.Element {
  const draft = useRef(task.notes)
  const saved = useRef(task.notes)
  const save = useCallback((): void => {
    if (draft.current === saved.current) return
    saved.current = draft.current
    const notes = draft.current
    void attempt(() => window.api.tasks.update({ id: task.id, patch: { notes }, scope }))
  }, [task.id, scope])
  // Closing the panel mid-edit still keeps what was typed.
  useEffect(() => save, [save])

  return (
    <textarea
      aria-label="Notes"
      placeholder="Notes"
      defaultValue={task.notes}
      onChange={(event) => (draft.current = event.currentTarget.value)}
      onBlur={save}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) event.currentTarget.blur()
      }}
      className="placeholder:text-muted-foreground/70 mt-3 min-h-16 w-full resize-none bg-transparent text-sm leading-relaxed outline-none [field-sizing:content]"
    />
  )
}

function WhenField({ task, today }: { task: Task; today: string }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const done = task.status === 'done'
  const overdue = !done && task.date !== null && task.date < today
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={done}
          title={done ? 'Reopen the task to reschedule it' : undefined}
          className={cn(
            '-ml-2 font-normal',
            !task.date && 'text-muted-foreground',
            overdue && 'text-overdue'
          )}
        >
          <CalendarDays />
          {task.date ? dayLabel(task.date, today) : 'No date'}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[288px] p-2">
        <DateChoices
          value={task.date}
          today={today}
          allowNone={task.seriesId === null}
          onPick={(date) => {
            setOpen(false)
            void taskActions.schedule(task, date)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

function TimeField({
  task,
  onSave
}: {
  task: Task
  onSave: (time: string | null) => void
}): React.JSX.Element {
  const [value, setValue] = useState(task.time ?? '')
  if (!task.date) {
    return <span className="text-muted-foreground/70 text-sm">Set a date first</span>
  }
  const commit = (next: string): void => {
    if ((next || null) !== task.time) onSave(next || null)
  }
  return (
    <div className="flex items-center gap-1">
      <div className="relative">
        <Clock className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2" />
        <input
          type="time"
          aria-label="Time"
          value={value}
          onChange={(event) => setValue(event.currentTarget.value)}
          onBlur={() => commit(value)}
          onKeyDown={(event) => event.key === 'Enter' && commit(value)}
          className="hover:bg-accent focus:bg-accent focus:ring-ring/40 h-7 rounded-md bg-transparent pr-1 pl-8 text-sm tabular-nums outline-none focus:ring-2 [&::-webkit-calendar-picker-indicator]:hidden"
        />
      </div>
      {task.time && (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Clear time"
          onClick={() => {
            setValue('')
            onSave(null)
          }}
        >
          <X />
        </Button>
      )}
    </div>
  )
}

const PRIORITY_DOT: Record<Priority, string> = {
  high: 'bg-priority-high',
  medium: 'bg-priority-medium',
  low: 'bg-priority-low'
}

function PriorityField({
  value,
  onChange
}: {
  value: Priority
  onChange: (value: Priority) => void
}): React.JSX.Element {
  return (
    <ToggleGroup
      type="single"
      size="sm"
      variant="outline"
      value={value}
      onValueChange={(next) => next && onChange(next as Priority)}
      aria-label="Priority"
    >
      {(['high', 'medium', 'low'] as const).map((priority) => (
        <ToggleGroupItem
          key={priority}
          value={priority}
          className="h-7 gap-1.5 px-2.5 text-xs capitalize"
        >
          <span className={cn('size-2 rounded-full', PRIORITY_DOT[priority])} />
          {priority}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

const NONE = '__none__'
const NEW = '__new__'

function CategoryField({
  value,
  onChange
}: {
  value: string | null
  onChange: (value: string | null) => void
}): React.JSX.Element {
  const categories = useApp((state) => state.categories)
  return (
    <Select
      value={value ?? NONE}
      onValueChange={(next) => {
        if (next === NEW) useUi.getState().set({ categoryDialog: {} })
        else onChange(next === NONE ? null : next)
      }}
    >
      <SelectTrigger
        size="sm"
        aria-label="Category"
        className="-ml-2 border-transparent shadow-none hover:bg-accent"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>
          <span className="border-muted-foreground size-2 rounded-full border" />
          None
        </SelectItem>
        {categories.map((category) => (
          <SelectItem key={category.id} value={category.id}>
            <span className="size-2 rounded-full" style={{ background: category.color }} />
            {category.name}
          </SelectItem>
        ))}
        <SelectSeparator />
        <SelectItem value={NEW}>
          <CirclePlus />
          New category…
        </SelectItem>
      </SelectContent>
    </Select>
  )
}

const WEEKDAYS = [
  { day: 1, label: 'M', name: 'Monday' },
  { day: 2, label: 'T', name: 'Tuesday' },
  { day: 3, label: 'W', name: 'Wednesday' },
  { day: 4, label: 'T', name: 'Thursday' },
  { day: 5, label: 'F', name: 'Friday' },
  { day: 6, label: 'S', name: 'Saturday' },
  { day: 0, label: 'S', name: 'Sunday' }
]

function RepeatField({ task }: { task: Task }): React.JSX.Element {
  const save = (recurrence: Recurrence): void =>
    void attempt(() => window.api.tasks.update({ id: task.id, patch: { recurrence } }))
  const kind = task.recurrence.kind
  const custom = task.recurrence.kind === 'custom' ? task.recurrence.weekdays : []

  if (!task.date) {
    return <span className="text-muted-foreground/70 text-sm">Set a date first</span>
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Select
        value={kind}
        onValueChange={(next) => {
          if (next === 'custom') {
            const weekday = new Date(`${task.date}T12:00`).getDay()
            save({ kind: 'custom', weekdays: [weekday] })
          } else {
            save({ kind: next as 'none' | 'daily' | 'weekly' })
          }
        }}
      >
        <SelectTrigger
          size="sm"
          aria-label="Repeat"
          className="-ml-2 border-transparent shadow-none hover:bg-accent"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Doesn’t repeat</SelectItem>
          <SelectItem value="daily">Every day</SelectItem>
          <SelectItem value="weekly">Every week</SelectItem>
          <SelectItem value="custom">On certain days…</SelectItem>
        </SelectContent>
      </Select>
      {kind === 'custom' && (
        <ToggleGroup
          type="multiple"
          size="sm"
          variant="outline"
          value={custom.map(String)}
          onValueChange={(values) => {
            // At least one day; an empty pick is ignored rather than saved.
            if (values.length) save({ kind: 'custom', weekdays: values.map(Number) })
          }}
          aria-label="Repeat on"
        >
          {WEEKDAYS.map((weekday) => (
            <ToggleGroupItem
              key={weekday.day}
              value={String(weekday.day)}
              aria-label={weekday.name}
              className="size-7 px-0 text-xs"
            >
              {weekday.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}
    </div>
  )
}

function TaskHistory({
  entries,
  today
}: {
  entries: ActivityEntry[]
  today: string
}): React.JSX.Element | null {
  if (!entries.length) return null
  return (
    <section aria-label="History" className="mt-6">
      <h3 className="text-muted-foreground mb-2 flex items-center gap-1.5 text-xs font-medium">
        <History className="size-3.5" /> History
      </h3>
      <ol className="border-border space-y-2.5 border-l pl-3.5">
        {entries.map((entry) => (
          <li key={entry.id} className="relative text-xs">
            <span className="bg-background text-muted-foreground absolute top-0 -left-[23px] grid size-[17px] place-items-center rounded-full [&_svg]:size-3">
              {ACTIVITY_ICON[entry.action] ?? <Circle />}
            </span>
            <span>{describeActivity(entry, today)}</span>
            <span className="text-muted-foreground">
              {' '}
              · {relativeTime(entry.createdAt, new Date(), today)}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}

/** A repeating task's own streak: occurrences done on time, in a row. */
function HabitStreak({ seriesId }: { seriesId: string }): React.JSX.Element | null {
  const summary = useStreakSummary()
  const streak = summary?.series.find((series) => series.seriesId === seriesId)
  if (!streak) return null
  return (
    <div className="mt-5 flex items-center gap-2 rounded-lg bg-orange-500/8 px-3 py-2 text-xs">
      <Flame className="size-3.5 fill-orange-500 text-orange-500" />
      <span className="font-medium">{streak.current} in a row</span>
      <span className="text-muted-foreground">· best {streak.longest}</span>
    </div>
  )
}
