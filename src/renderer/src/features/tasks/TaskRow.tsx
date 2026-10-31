import { useEffect, useRef } from 'react'
import { AlignLeft, CalendarClock, MoreHorizontal, Repeat2 } from 'lucide-react'
import type { Category, Task } from '@shared/ipc'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger
} from '@renderer/components/ui/context-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { dayLabel, timeLabel } from '@renderer/lib/format'
import { cn } from '@renderer/lib/utils'
import { useUi } from '@renderer/stores/ui'
import { taskActions } from './actions'
import { TaskCheckbox } from './TaskCheckbox'
import { TaskMenuItems } from './TaskMenu'

interface Props {
  task: Task
  today: string
  category: Category | undefined
  /** Show the date; off where the section heading already says it. */
  showDate: boolean
  onToggle: (task: Task) => void
}

export function TaskRow({ task, today, category, showDate, onToggle }: Props): React.JSX.Element {
  const selected = useUi((state) => state.selectedId === task.id)
  const renaming = useUi((state) => state.renamingId === task.id)
  const ref = useRef<HTMLLIElement>(null)
  const done = task.status === 'done'
  const overdue = !done && task.date !== null && task.date < today

  // Keyboard selection keeps the row in view.
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  return (
    <ContextMenu
      onOpenChange={(open) => {
        if (open) useUi.getState().select(task.id)
      }}
    >
      <ContextMenuTrigger asChild>
        <li
          ref={ref}
          data-task-id={task.id}
          aria-selected={selected}
          aria-label={task.title}
          onClick={() => useUi.getState().openDetail(task.id)}
          onDoubleClick={() => useUi.getState().set({ renamingId: task.id })}
          className={cn(
            'group/row relative -mx-2.5 flex h-9 items-center gap-3 rounded-md px-2.5',
            'transition-colors duration-100',
            selected ? 'bg-accent' : 'hover:bg-accent/60'
          )}
        >
          <TaskCheckbox task={task} onToggle={() => onToggle(task)} />

          {renaming ? (
            <RenameInput task={task} />
          ) : (
            <span
              className={cn(
                'min-w-0 flex-1 truncate',
                done && 'text-muted-foreground line-through decoration-muted-foreground/50'
              )}
            >
              {task.title}
            </span>
          )}

          <span className="text-muted-foreground flex shrink-0 items-center gap-2.5 text-xs">
            {task.notes && <AlignLeft className="size-3.5" aria-label="Has notes" />}
            {task.recurrence.kind !== 'none' && (
              <Repeat2 className="size-3.5" aria-label="Repeats" />
            )}
            {!done && task.rescheduleCount > 0 && (
              <span
                className="flex items-center gap-1"
                title={`Rescheduled ${task.rescheduleCount}×`}
              >
                <CalendarClock className="size-3.5" />
                {task.rescheduleCount}
              </span>
            )}
            {category && (
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ background: category.color }} />
                {category.name}
              </span>
            )}
            {task.date && (showDate || overdue) && (
              <span className={cn(overdue && 'text-overdue font-medium')}>
                {dayLabel(task.date, today)}
              </span>
            )}
            {task.time && <span className="tabular-nums">{timeLabel(task.time)}</span>}
          </span>

          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`More actions for ${task.title}`}
              onClick={(event) => event.stopPropagation()}
              className={cn(
                'text-muted-foreground hover:text-foreground hover:bg-background -mr-1 grid size-6 place-items-center rounded-md',
                'opacity-0 transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100',
                selected && 'opacity-100'
              )}
            >
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <TaskMenuItems task={task} today={today} kind="dropdown" />
            </DropdownMenuContent>
          </DropdownMenu>
        </li>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <TaskMenuItems task={task} today={today} kind="context" />
      </ContextMenuContent>
    </ContextMenu>
  )
}

function RenameInput({ task }: { task: Task }): React.JSX.Element {
  const finish = (save: boolean, value: string): void => {
    useUi.getState().set({ renamingId: null })
    if (save) void taskActions.rename(task, value)
  }
  return (
    <input
      aria-label="Task title"
      defaultValue={task.title}
      autoFocus
      onFocus={(event) => event.currentTarget.select()}
      onClick={(event) => event.stopPropagation()}
      onBlur={(event) => finish(true, event.currentTarget.value)}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === 'Enter') finish(true, event.currentTarget.value)
        if (event.key === 'Escape') finish(false, '')
      }}
      className="bg-background ring-ring/40 -my-1 min-w-0 flex-1 rounded px-1.5 py-1 outline-none ring-2"
    />
  )
}
