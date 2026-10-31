import { useDraggable } from '@dnd-kit/core'
import { Repeat2 } from 'lucide-react'
import type { Task } from '@shared/ipc'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger
} from '@renderer/components/ui/context-menu'
import { shortTimeLabel, timeLabel } from '@renderer/lib/format'
import { cn } from '@renderer/lib/utils'
import { useUi } from '@renderer/stores/ui'
import { taskActions } from '../tasks/actions'
import { TaskMenuItems } from '../tasks/TaskMenu'

interface ChipProps {
  task: Task
  today: string
  color: string | undefined
  /** `line` for month cells and lists, `block` for the time grid. */
  shape: 'line' | 'block'
  showTime?: boolean
  /** Drops the repeat icon, for crowded cells. */
  dense?: boolean
  className?: string
  style?: React.CSSProperties
}

/** What a task looks like on the calendar. Purely visual, so the drag preview can reuse it. */
export function TaskChip({
  task,
  today,
  color,
  shape,
  showTime = true,
  dense = false,
  className,
  style
}: ChipProps) {
  const done = task.status === 'done'
  const late = !done && task.date !== null && task.date < today

  return (
    <div
      style={{ ...(color ? { '--chip': color } : {}), ...style } as React.CSSProperties}
      className={cn(
        'group/chip @container relative flex min-w-0 items-center gap-1.5 overflow-hidden rounded-[6px] text-xs leading-tight',
        color
          ? 'bg-[color-mix(in_oklch,var(--chip)_16%,var(--background))] border-l-[3px] border-[var(--chip)]'
          : 'bg-muted border-l-[3px] border-transparent',
        shape === 'line' ? 'h-[22px] pr-1.5 pl-1' : 'items-start py-1 pr-1.5 pl-1',
        done && 'opacity-55',
        late && 'outline-overdue/60 outline-1 -outline-offset-1 outline-dashed',
        className
      )}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={`Complete ${task.title}`}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation()
          void taskActions.toggle(task)
        }}
        className={cn(
          'grid size-3 shrink-0 place-items-center rounded-full border transition-colors @max-[64px]:hidden',
          shape === 'block' && 'mt-px',
          done
            ? 'border-foreground/50 bg-foreground/50'
            : 'border-foreground/40 hover:bg-foreground/10'
        )}
      />
      {/* A line reads "9:30am Standup"; a block leads with the title, as space is tighter. */}
      {showTime && task.time && shape === 'line' && <Time time={task.time} />}
      <span className={cn('min-w-0 flex-1 truncate', done && 'line-through')}>{task.title}</span>
      {showTime && task.time && shape === 'block' && <Time time={task.time} />}
      {!dense && task.recurrence.kind !== 'none' && (
        <Repeat2
          className="text-muted-foreground size-3 shrink-0 @max-[120px]:hidden"
          aria-label="Repeats"
        />
      )}
    </div>
  )
}

/** The time gives way first when a chip is too narrow for it and a readable title. */
function Time({ time }: { time: string }): React.JSX.Element {
  return (
    <span className="text-muted-foreground shrink-0 tabular-nums @max-[96px]:hidden">
      {shortTimeLabel(time)}
    </span>
  )
}

/** A chip you can drag to another day or time, click to open, or right-click for its menu. */
export function DraggableChip(props: ChipProps): React.JSX.Element {
  const { task } = props
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `task:${task.id}`,
    data: { task },
    // Finished tasks can't be moved (reopen first), so they don't pretend they can.
    disabled: task.status === 'done'
  })
  const selected = useUi((state) => state.selectedId === task.id)

  return (
    <ContextMenu onOpenChange={(open) => open && useUi.getState().select(task.id)}>
      <ContextMenuTrigger asChild>
        <div
          ref={setNodeRef}
          {...attributes}
          {...listeners}
          role="button"
          aria-label={task.time ? `${task.title}, ${timeLabel(task.time)}` : task.title}
          data-task-id={task.id}
          onClick={(event) => {
            event.stopPropagation()
            useUi.getState().openDetail(task.id)
          }}
          onDoubleClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.stopPropagation()
              useUi.getState().openDetail(task.id)
            }
          }}
          // Positioning goes on this element, not the chip inside: it's what gets dragged and
          // measured, and the drop time on the grid is worked out from its top edge.
          style={props.style}
          className={cn(
            'rounded-[6px] outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
            task.status === 'done' ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing',
            selected && 'ring-primary/70 ring-2',
            isDragging && 'opacity-35'
          )}
        >
          <TaskChip
            {...props}
            style={undefined}
            className={cn(props.shape === 'block' && 'h-full', props.className)}
          />
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <TaskMenuItems task={task} today={props.today} kind="context" />
      </ContextMenuContent>
    </ContextMenu>
  )
}
