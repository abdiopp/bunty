import { useDroppable } from '@dnd-kit/core'
import { CalendarX2, X } from 'lucide-react'
import type { Category, Task } from '@shared/ipc'
import type { Settings } from '@shared/schemas'
import { dayLabel, longDate } from '@renderer/lib/format'
import { cn } from '@renderer/lib/utils'
import { useUi } from '@renderer/stores/ui'
import { QuickAddBar } from '../quick-add/QuickAddBar'
import { taskActions } from '../tasks/actions'
import { TaskRow } from '../tasks/TaskRow'
import { chipColor } from './chip-color'
import { DraggableChip } from './TaskChip'

interface Props {
  selected: string
  today: string
  dayTasks: Task[]
  undated: Task[]
  settings: Settings
  categories: Category[]
}

/** The selected day in full, with a box to add to it, and the tasks that still need a date. */
export function SidePanel({ selected, today, dayTasks, undated, settings, categories }: Props) {
  const heading = dayLabel(selected, today)
  const full = longDate(selected)

  return (
    <aside
      aria-label="Selected day"
      className="border-border flex w-[300px] shrink-0 flex-col border-l"
    >
      <div className="flex min-h-0 flex-1 flex-col px-4 pt-1">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">{heading}</h2>
            {heading !== full && <p className="text-muted-foreground text-xs">{full}</p>}
          </div>
          {selected !== today && (
            <button
              aria-label="Back to today"
              title="Back to today"
              onClick={() => useUi.getState().selectDay(today)}
              className="text-muted-foreground hover:bg-accent hover:text-foreground grid size-6 place-items-center rounded-md"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {selected >= today ? (
          <QuickAddBar
            view={{ kind: 'calendar' }}
            today={today}
            defaults={{ date: selected }}
            isVisible={(task) => task.date === selected}
            placeholder={`Add to ${heading.toLowerCase() === 'today' ? 'today' : heading}…`}
          />
        ) : (
          <p className="text-muted-foreground bg-muted/50 rounded-lg px-3 py-2 text-xs">
            Past days are a record; new tasks can only go on today or later.
          </p>
        )}

        <ul
          aria-label="Tasks"
          className="mt-3 min-h-0 flex-1 overflow-x-hidden overflow-y-auto pr-1 pl-2.5"
        >
          {dayTasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              today={today}
              category={undefined}
              showDate={false}
              onToggle={(target) => void taskActions.toggle(target)}
            />
          ))}
          {dayTasks.length === 0 && (
            <li className="text-muted-foreground py-6 text-center text-xs">Nothing on this day.</li>
          )}
        </ul>
      </div>

      <NoDateList undated={undated} today={today} settings={settings} categories={categories} />
    </aside>
  )
}

/** Undated tasks, ready to drag onto a day. Dropping a dated task here takes its date away. */
function NoDateList({
  undated,
  today,
  settings,
  categories
}: {
  undated: Task[]
  today: string
  settings: Settings
  categories: Category[]
}): React.JSX.Element {
  const { setNodeRef, isOver, active } = useDroppable({ id: 'tray' })
  const dragging = active !== null

  return (
    <section
      ref={setNodeRef}
      aria-label="No date"
      className={cn(
        'border-border flex max-h-[40%] min-h-[96px] shrink-0 flex-col border-t px-4 pt-3 pb-3 transition-colors',
        isOver && 'bg-primary/10'
      )}
    >
      <h3 className="text-muted-foreground mb-2 flex items-center gap-1.5 text-xs font-medium">
        <CalendarX2 className="size-3.5" />
        No date
        <span className="tabular-nums">{undated.length || ''}</span>
      </h3>
      <div className="flex min-h-0 flex-col gap-1 overflow-y-auto">
        {undated.map((task) => (
          <DraggableChip
            key={task.id}
            task={task}
            today={today}
            shape="line"
            color={chipColor(task, settings.calendarColorBy, categories)}
          />
        ))}
        {undated.length === 0 && (
          <p className="text-muted-foreground/80 text-xs leading-relaxed">
            {dragging
              ? 'Drop here to remove the date.'
              : 'Tasks without a date show up here. Drag one onto a day to schedule it.'}
          </p>
        )}
      </div>
    </section>
  )
}
