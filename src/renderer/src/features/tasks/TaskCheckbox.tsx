import type { Task } from '@shared/ipc'
import { cn } from '@renderer/lib/utils'

const RING: Record<Task['priority'], string> = {
  high: 'border-priority-high',
  medium: 'border-priority-medium',
  low: 'border-priority-low'
}

const CHECK = 'M2.6 6.3 5 8.6 9.4 3.6'

/** A round checkbox whose ring shows the priority; ticking it pops and draws the check. */
export function TaskCheckbox({
  task,
  onToggle,
  className
}: {
  task: Task
  onToggle: () => void
  className?: string
}): React.JSX.Element {
  const done = task.status === 'done'
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={`Complete ${task.title}`}
      onClick={(event) => {
        event.stopPropagation()
        onToggle()
      }}
      onDoubleClick={(event) => event.stopPropagation()}
      className={cn(
        'group/check grid size-[18px] shrink-0 place-items-center rounded-full border-[1.5px] transition-colors',
        'focus-visible:ring-ring/50 outline-none focus-visible:ring-3',
        done
          ? 'border-primary bg-primary text-primary-foreground animate-[check-pop_220ms_ease-out]'
          : cn(RING[task.priority], 'text-muted-foreground hover:bg-accent'),
        className
      )}
    >
      <svg viewBox="0 0 12 12" className="size-2.5" aria-hidden>
        <path
          d={CHECK}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="16"
          className={
            done
              ? 'animate-[check-draw_260ms_ease-out_both]'
              : 'opacity-0 transition-opacity group-hover/check:opacity-60'
          }
        />
      </svg>
    </button>
  )
}
