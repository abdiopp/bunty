import { useDroppable } from '@dnd-kit/core'
import type { Category, Task } from '@shared/ipc'
import type { Settings } from '@shared/schemas'
import { weekdayShort } from '@renderer/lib/format'
import { cn } from '@renderer/lib/utils'
import { useUi } from '@renderer/stores/ui'
import { monthWeeks } from './calendar-math'
import { chipColor } from './chip-color'
import { DraggableChip } from './TaskChip'

/** Beyond this, a day shows "+N more" and the full list is one click away in the side panel. */
const VISIBLE_PER_DAY = 3

interface Props {
  anchor: string
  today: string
  settings: Settings
  categories: Category[]
  tasksByDate: ReadonlyMap<string, Task[]>
  onOpenDay: (date: string) => void
}

export function MonthGrid({ anchor, today, settings, categories, tasksByDate, onOpenDay }: Props) {
  const weeks = monthWeeks(anchor, settings.weekStart)
  const month = anchor.slice(0, 7)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-border grid grid-cols-7 border-b">
        {weeks[0].map((date) => (
          <div key={date} className="text-muted-foreground px-2 pb-1.5 text-xs font-medium">
            {weekdayShort(date)}
          </div>
        ))}
      </div>
      <div
        role="grid"
        aria-label="Month"
        className="grid min-h-0 flex-1 grid-cols-7"
        style={{ gridTemplateRows: `repeat(${weeks.length}, minmax(0, 1fr))` }}
      >
        {weeks.flat().map((date) => (
          <DayCell
            key={date}
            date={date}
            today={today}
            outside={date.slice(0, 7) !== month}
            tasks={tasksByDate.get(date) ?? []}
            settings={settings}
            categories={categories}
            onOpenDay={onOpenDay}
          />
        ))}
      </div>
    </div>
  )
}

function DayCell({
  date,
  today,
  outside,
  tasks,
  settings,
  categories,
  onOpenDay
}: {
  date: string
  today: string
  outside: boolean
  tasks: Task[]
  settings: Settings
  categories: Category[]
  onOpenDay: (date: string) => void
}): React.JSX.Element {
  const past = date < today
  const selected = useUi((state) => state.calendar.selected === date)
  // Past days don't accept drops: tasks can't be scheduled into the past.
  const { setNodeRef, isOver, active } = useDroppable({ id: `day:${date}`, disabled: past })
  const hidden = tasks.length - VISIBLE_PER_DAY

  return (
    <div
      ref={setNodeRef}
      role="gridcell"
      aria-label={date}
      aria-selected={selected}
      onClick={() => useUi.getState().selectDay(date)}
      onDoubleClick={() => onOpenDay(date)}
      className={cn(
        'border-border relative flex min-h-0 flex-col gap-[3px] overflow-hidden border-r border-b p-1.5 transition-colors [&:nth-child(7n)]:border-r-0',
        outside && 'bg-muted/35',
        past && active && 'bg-muted/60 cursor-not-allowed',
        isOver && 'bg-primary/10 ring-primary/50 ring-2 ring-inset',
        selected && !isOver && 'ring-primary/40 ring-1 ring-inset'
      )}
    >
      <div className="flex shrink-0 items-center justify-between">
        <span
          className={cn(
            'grid h-6 min-w-6 place-items-center rounded-full px-1 text-xs tabular-nums',
            date === today
              ? 'bg-primary text-primary-foreground font-semibold'
              : outside
                ? 'text-muted-foreground/70'
                : 'text-foreground/80'
          )}
        >
          {Number(date.slice(8))}
        </span>
      </div>
      {tasks.slice(0, VISIBLE_PER_DAY).map((task) => (
        <DraggableChip
          key={task.id}
          task={task}
          today={today}
          shape="line"
          dense
          color={chipColor(task, settings.calendarColorBy, categories)}
        />
      ))}
      {hidden > 0 && (
        <button
          onClick={(event) => {
            event.stopPropagation()
            useUi.getState().selectDay(date)
          }}
          className="text-muted-foreground hover:text-foreground self-start px-1 text-[11px] font-medium"
        >
          +{hidden} more
        </button>
      )}
    </div>
  )
}
