import { useEffect, useMemo, useRef } from 'react'
import { useAutoAnimate } from '@formkit/auto-animate/react'
import { EyeOff, Lock, MoreHorizontal, PanelTop, Pin, Plus, Sparkles } from 'lucide-react'
import type { Task } from '@shared/ipc'
import type { PageSettingsPatch } from '@shared/schemas'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { useToday } from '@renderer/hooks/use-today'
import { useViewTasks } from '@renderer/hooks/use-view-tasks'
import { dayLabel, longDate, shortTimeLabel } from '@renderer/lib/format'
import { cn } from '@renderer/lib/utils'
import { useApp } from '@renderer/stores/app'
import { useUi } from '@renderer/stores/ui'
import { attempt, taskActions } from '../tasks/actions'
import { buildSections } from '../tasks/sections'
import { TaskCheckbox } from '../tasks/TaskCheckbox'
import { StreakBadge } from '../streaks/StreakBadge'

const OPACITIES = [1, 0.92, 0.8, 0.65, 0.5]

const save = (patch: PageSettingsPatch): void =>
  void attempt(() => window.api.settings.update(patch))

/** The desktop widget: today's open and overdue tasks, tickable without opening the app. */
export function WidgetWindow(): React.JSX.Element {
  const today = useToday()
  const settings = useApp((state) => state.settings)
  const held = useUi((state) => state.held)
  const { tasks, loaded } = useViewTasks({ kind: 'today' }, today)
  const [list] = useAutoAnimate({ duration: 180 })

  useEffect(() => useApp.getState().start(), [])

  const { overdue, due } = useMemo(() => {
    const sections = buildSections({ kind: 'today' }, tasks, today, held)
    const pick = (id: string): Task[] => sections.find((s) => s.id === id)?.tasks ?? []
    return { overdue: pick('overdue'), due: pick('today') }
  }, [tasks, today, held])

  const locked = settings.widgetLocked
  const open = overdue.length + due.length

  return (
    <div className="h-full p-1.5">
      <div
        className="border-border/70 relative flex h-full flex-col overflow-hidden rounded-2xl border shadow-[0_10px_30px_-12px_rgb(0_0_0/0.35)]"
        style={{
          backgroundColor: `color-mix(in oklch, var(--background) ${Math.round(settings.widgetOpacity * 100)}%, transparent)`
        }}
      >
        <header className={cn('flex items-start gap-2 px-4 pt-3 pb-2', !locked && 'drag')}>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm font-semibold">
              Today
              <StreakBadge compact />
            </div>
            <div className="text-muted-foreground truncate text-xs">{longDate(today)}</div>
          </div>
          <div className="no-drag flex items-center gap-0.5">
            <button
              aria-label="Add a task"
              title="Add a task"
              onClick={() => void window.api.quickAdd.open()}
              className="text-muted-foreground hover:bg-accent hover:text-foreground grid size-7 place-items-center rounded-md"
            >
              <Plus className="size-4" />
            </button>
            <WidgetMenu />
          </div>
        </header>

        <ul ref={list} aria-label="Tasks" className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {overdue.map((task) => (
            <WidgetRow key={task.id} task={task} today={today} />
          ))}
          {due.map((task) => (
            <WidgetRow key={task.id} task={task} today={today} />
          ))}
          {loaded && open === 0 && (
            <li className="text-muted-foreground flex flex-col items-center gap-2 py-8 text-center text-xs">
              <Sparkles className="text-success size-5" />
              All clear for today.
            </li>
          )}
        </ul>

        {!locked && <ResizeGrip />}
      </div>
    </div>
  )
}

function WidgetRow({ task, today }: { task: Task; today: string }): React.JSX.Element {
  const late = task.status !== 'done' && task.date !== null && task.date < today
  return (
    <li
      aria-label={task.title}
      className="hover:bg-accent/70 flex items-center gap-2.5 rounded-lg px-2 py-1.5"
    >
      <TaskCheckbox task={task} onToggle={() => void taskActions.toggle(task)} />
      <button
        onClick={() => void window.api.app.openTask(task.id)}
        title="Open in Bunty"
        className={cn(
          'min-w-0 flex-1 truncate text-left text-sm',
          task.status === 'done' && 'text-muted-foreground line-through'
        )}
      >
        {task.title}
      </button>
      {late ? (
        <span className="text-overdue shrink-0 text-xs font-medium">
          {dayLabel(task.date!, today)}
        </span>
      ) : (
        task.time && (
          <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
            {shortTimeLabel(task.time)}
          </span>
        )
      )}
    </li>
  )
}

function WidgetMenu(): React.JSX.Element {
  const settings = useApp((state) => state.settings)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Widget options"
        className="text-muted-foreground hover:bg-accent hover:text-foreground grid size-7 place-items-center rounded-md"
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onSelect={() => void window.api.app.show()}>
          <PanelTop />
          Open Bunty
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={settings.widgetLocked}
          onCheckedChange={(checked) => save({ widgetLocked: checked === true })}
        >
          <Lock />
          Lock position
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={settings.widgetAlwaysOnTop}
          onCheckedChange={(checked) => save({ widgetAlwaysOnTop: checked === true })}
        >
          <Pin />
          Always on top
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
          Background
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={String(settings.widgetOpacity)}
          onValueChange={(value) => save({ widgetOpacity: Number(value) })}
        >
          {OPACITIES.map((opacity) => (
            <DropdownMenuRadioItem key={opacity} value={String(opacity)}>
              {opacity === 1 ? 'Solid' : `${Math.round(opacity * 100)}%`}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => save({ widgetVisible: false })}>
          <EyeOff />
          Hide widget
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Transparent windows have no native resize border on Windows, so the corner does it. */
function ResizeGrip(): React.JSX.Element {
  const start = useRef<{ x: number; y: number; width: number; height: number } | null>(null)
  const frame = useRef(0)

  return (
    <div
      role="separator"
      aria-label="Resize widget"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        start.current = {
          x: event.screenX,
          y: event.screenY,
          width: window.outerWidth,
          height: window.outerHeight
        }
      }}
      onPointerMove={(event) => {
        const origin = start.current
        if (!origin) return
        const size = {
          width: Math.round(origin.width + event.screenX - origin.x),
          height: Math.round(origin.height + event.screenY - origin.y)
        }
        cancelAnimationFrame(frame.current)
        frame.current = requestAnimationFrame(() => void window.api.widget.resize(size))
      }}
      onPointerUp={() => {
        start.current = null
      }}
      className="text-muted-foreground/60 hover:text-muted-foreground absolute right-1 bottom-1 grid size-4 cursor-nwse-resize place-items-center"
    >
      <svg viewBox="0 0 10 10" className="size-2.5" aria-hidden>
        <path d="M9 1 1 9M9 5 5 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    </div>
  )
}
