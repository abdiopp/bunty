import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import type { Category, Task } from '@shared/ipc'
import type { Settings } from '@shared/schemas'
import { hourLabel, timeLabel, weekdayShort } from '@renderer/lib/format'
import { cn } from '@renderer/lib/utils'
import { useUi } from '@renderer/stores/ui'
import { BLOCK_MINUTES, layoutTimed, minutesOf, timeOf } from './calendar-math'
import { chipColor } from './chip-color'
import { DraggableChip } from './TaskChip'

export const HOUR_HEIGHT = 48
const HOURS = Array.from({ length: 24 }, (_, hour) => hour)

/** Where a dragged task would land, drawn as a ghost while it's over the grid. */
export interface SlotHover {
  date: string
  time: string
}

interface Props {
  days: string[]
  today: string
  settings: Settings
  categories: Category[]
  tasksByDate: ReadonlyMap<string, Task[]>
  hover: SlotHover | null
}

function useMinuteOfDay(): number {
  const read = (): number => {
    const now = new Date()
    return now.getHours() * 60 + now.getMinutes()
  }
  const [minute, setMinute] = useState(read)
  useEffect(() => {
    const timer = setInterval(() => setMinute(read()), 60_000)
    return () => clearInterval(timer)
  }, [])
  return minute
}

/** Week and day views: an all-day row for untimed tasks, then the hours. */
export function TimeGrid({ days, today, settings, categories, tasksByDate, hover }: Props) {
  const scroller = useRef<HTMLDivElement>(null)
  const now = useMinuteOfDay()
  const showsToday = days.includes(today)

  // Open on the useful part of the day: just before now, or the morning.
  const firstDay = days[0]
  useLayoutEffect(() => {
    const hour = showsToday ? Math.max(0, Math.floor(now / 60) - 2) : 7
    scroller.current?.scrollTo({ top: hour * HOUR_HEIGHT })
    // Only when the days shown change, not every minute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstDay, days.length])

  const columns = `56px repeat(${days.length}, minmax(0, 1fr))`

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className="border-border grid border-b pr-[10px]"
        style={{ gridTemplateColumns: columns }}
      >
        <div />
        {days.map((date) => (
          <button
            key={date}
            onClick={() => useUi.getState().selectDay(date)}
            className="flex items-baseline gap-1.5 px-2 pb-1.5 text-left"
          >
            <span className="text-muted-foreground text-xs font-medium">{weekdayShort(date)}</span>
            <span
              className={cn(
                'grid h-6 min-w-6 place-items-center rounded-full px-1 text-sm tabular-nums',
                date === today ? 'bg-primary text-primary-foreground font-semibold' : 'font-medium'
              )}
            >
              {Number(date.slice(8))}
            </span>
          </button>
        ))}
      </div>

      <div
        className="border-border grid border-b pr-[10px]"
        style={{ gridTemplateColumns: columns }}
      >
        <div className="text-muted-foreground self-center pr-2 text-right text-[11px]">All day</div>
        {days.map((date) => (
          <AllDayCell
            key={date}
            date={date}
            today={today}
            tasks={(tasksByDate.get(date) ?? []).filter((task) => !task.time)}
            settings={settings}
            categories={categories}
          />
        ))}
      </div>

      {/* Always reserves the scrollbar's 10px (see main.css), matching the rows above. */}
      <div
        ref={scroller}
        className="relative min-h-0 flex-1 overflow-y-scroll [scrollbar-gutter:stable]"
      >
        <div className="grid" style={{ gridTemplateColumns: columns, height: 24 * HOUR_HEIGHT }}>
          <div className="relative">
            {HOURS.slice(1).map((hour) => (
              <span
                key={hour}
                className="text-muted-foreground absolute right-2 -translate-y-1/2 text-[11px] tabular-nums"
                style={{ top: hour * HOUR_HEIGHT }}
              >
                {hourLabel(hour)}
              </span>
            ))}
          </div>
          {days.map((date) => (
            <DayColumn
              key={date}
              date={date}
              today={today}
              now={date === today ? now : null}
              tasks={(tasksByDate.get(date) ?? []).filter((task) => task.time)}
              settings={settings}
              categories={categories}
              hover={hover?.date === date ? hover.time : null}
              wide={days.length === 1}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function AllDayCell({
  date,
  today,
  tasks,
  settings,
  categories
}: {
  date: string
  today: string
  tasks: Task[]
  settings: Settings
  categories: Category[]
}): React.JSX.Element {
  const past = date < today
  // Dropping here keeps the day but takes away the time.
  const { setNodeRef, isOver } = useDroppable({ id: `allday:${date}`, disabled: past })
  return (
    <div
      ref={setNodeRef}
      onClick={() => useUi.getState().selectDay(date)}
      className={cn(
        'border-border flex max-h-24 min-h-9 flex-col gap-[3px] overflow-y-auto border-l p-1 transition-colors',
        isOver && 'bg-primary/10 ring-primary/50 ring-2 ring-inset'
      )}
    >
      {tasks.map((task) => (
        <DraggableChip
          key={task.id}
          task={task}
          today={today}
          shape="line"
          dense
          color={chipColor(task, settings.calendarColorBy, categories)}
        />
      ))}
    </div>
  )
}

function DayColumn({
  date,
  today,
  now,
  tasks,
  settings,
  categories,
  hover,
  wide
}: {
  date: string
  today: string
  now: number | null
  tasks: Task[]
  settings: Settings
  categories: Category[]
  hover: string | null
  wide: boolean
}): React.JSX.Element {
  const past = date < today
  // The time comes from where the task is dropped, worked out in CalendarView.
  const { setNodeRef, isOver } = useDroppable({ id: `slot:${date}`, disabled: past })
  const blockHeight = (BLOCK_MINUTES / 60) * HOUR_HEIGHT - 2

  return (
    <div
      ref={setNodeRef}
      data-day-column={date}
      onClick={() => useUi.getState().selectDay(date)}
      className={cn(
        'border-border relative border-l',
        past && 'bg-muted/25',
        isOver && 'bg-primary/[0.04]'
      )}
      style={{
        backgroundImage: `repeating-linear-gradient(to bottom, var(--border) 0 1px, transparent 1px ${HOUR_HEIGHT}px)`
      }}
    >
      {layoutTimed(tasks).map(({ item, start, column, columns }) => (
        <DraggableChip
          key={item.id}
          task={item}
          today={today}
          shape="block"
          showTime={!wide}
          color={chipColor(item, settings.calendarColorBy, categories)}
          style={{
            position: 'absolute',
            top: (start / 60) * HOUR_HEIGHT + 1,
            height: blockHeight,
            left: `calc(${(column / columns) * 100}% + 2px)`,
            width: `calc(${100 / columns}% - 4px)`
          }}
          className={wide ? 'gap-2' : undefined}
        />
      ))}

      {hover && (
        <div
          aria-hidden
          className="border-primary bg-primary/10 text-primary pointer-events-none absolute right-0.5 left-0.5 rounded-md border-2 border-dashed px-1.5 text-[11px] font-medium tabular-nums"
          style={{ top: (minutesOf(hover) / 60) * HOUR_HEIGHT, height: blockHeight }}
        >
          {timeLabel(hover)}
        </div>
      )}

      {now !== null && (
        <div
          aria-label={`Now, ${timeLabel(timeOf(now))}`}
          className="pointer-events-none absolute right-0 left-0 z-10 h-0.5 bg-red-500"
          style={{ top: (now / 60) * HOUR_HEIGHT }}
        >
          <span className="absolute -top-[3px] -left-[4px] size-2 rounded-full bg-red-500" />
        </div>
      )}
    </div>
  )
}
