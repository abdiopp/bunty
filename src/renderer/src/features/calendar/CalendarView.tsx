import { useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent
} from '@dnd-kit/core'
import { ChevronLeft, ChevronRight, Flag, Tag } from 'lucide-react'
import { toast } from 'sonner'
import type { Task } from '@shared/ipc'
import type { CalendarMode, Settings } from '@shared/schemas'
import { Button } from '@renderer/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@renderer/components/ui/toggle-group'
import { longDate, monthTitle, rangeTitle } from '@renderer/lib/format'
import { useApp } from '@renderer/stores/app'
import { useUi } from '@renderer/stores/ui'
import { attempt } from '../tasks/actions'
import { dropTime, shiftAnchor, visibleRange, weekDays } from './calendar-math'
import { MonthGrid } from './MonthGrid'
import { SidePanel } from './SidePanel'
import { chipColor } from './chip-color'
import { TaskChip } from './TaskChip'
import { HOUR_HEIGHT, TimeGrid, type SlotHover } from './TimeGrid'
import { useCalendarTasks, usePendingMoves, type Move } from './use-calendar-tasks'

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 }

/** Timed tasks first, by time, then the rest by priority: the order a day reads in. */
function byTimeThenPriority(a: Task, b: Task): number {
  if (a.time && b.time) return a.time.localeCompare(b.time)
  if (a.time || b.time) return a.time ? -1 : 1
  return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
}

function saveSettings(patch: Partial<Settings>): void {
  void attempt(() => window.api.settings.update(patch))
}

/** Where on the time grid the dragged task's top edge is, as a time on that day. */
function slotFor(event: DragMoveEvent | DragEndEvent): SlotHover | null {
  const id = event.over ? String(event.over.id) : ''
  const top = event.active.rect.current.translated?.top
  if (!id.startsWith('slot:') || top === undefined) return null
  const date = id.slice(5)
  const column = document.querySelector(`[data-day-column="${date}"]`)
  if (!column) return null
  return { date, time: dropTime(top - column.getBoundingClientRect().top, HOUR_HEIGHT) }
}

export function CalendarView({ today }: { today: string }): React.JSX.Element {
  const settings = useApp((state) => state.settings)
  const categories = useApp((state) => state.categories)
  const { anchor, selected } = useUi((state) => state.calendar)
  const detailOpen = useUi((state) => state.detailId !== null)
  const mode = settings.calendarMode

  const range = visibleRange(mode, anchor, settings.weekStart)
  const { ranged, undated, reload } = useCalendarTasks(
    // The side panel shows the selected day even when it's outside the period on screen.
    selected < range.from ? selected : range.from,
    selected > range.to ? selected : range.to
  )
  const pending = usePendingMoves(reload)
  const [dragged, setDragged] = useState<Task | null>(null)
  const [hover, setHover] = useState<SlotHover | null>(null)

  const { tasksByDate, undatedNow } = useMemo(() => {
    const seen = new Set<string>()
    const all = [...ranged, ...undated].filter((task) => !seen.has(task.id) && seen.add(task.id))
    const byDate = new Map<string, Task[]>()
    const none: Task[] = []
    for (const task of all.map(pending.apply)) {
      if (!task.date) none.push(task)
      else byDate.set(task.date, [...(byDate.get(task.date) ?? []), task])
    }
    for (const list of byDate.values()) list.sort(byTimeThenPriority)
    return { tasksByDate: byDate, undatedNow: none }
  }, [ranged, undated, pending.apply])

  // Movement starts after a few pixels, so a plain click still opens the task.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const move = (task: Task, target: Move, save: () => Promise<unknown>): void =>
    void pending.run(task, target, () => attempt(save))

  const onDragEnd = (event: DragEndEvent): void => {
    setDragged(null)
    setHover(null)
    const task = event.active.data.current?.task as Task | undefined
    if (!task || !event.over) return
    const [kind, date] = String(event.over.id).split(/:(.*)/)
    const api = window.api.tasks

    switch (kind) {
      case 'day':
        if (date !== task.date) move(task, { date }, () => api.reschedule({ id: task.id, date }))
        break
      case 'allday':
        if (date !== task.date || task.time) {
          move(task, { date, time: null }, () => api.reschedule({ id: task.id, date, time: null }))
        }
        break
      case 'slot': {
        const time = slotFor(event)?.time
        if (time && (date !== task.date || time !== task.time)) {
          move(task, { date, time }, () => api.reschedule({ id: task.id, date, time }))
        }
        break
      }
      case 'tray':
        if (!task.date) break
        if (task.seriesId) {
          toast.error('A repeating task needs a date. Delete it instead, or stop it repeating.')
          break
        }
        move(task, { date: null, time: null }, () =>
          api.update({ id: task.id, patch: { date: null } })
        )
        break
    }
  }

  const openDay = (date: string): void => {
    useUi.getState().selectDay(date)
    saveSettings({ calendarMode: 'day' })
  }

  const title =
    mode === 'month'
      ? monthTitle(anchor)
      : mode === 'week'
        ? rangeTitle(range.from, range.to)
        : longDate(anchor)

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={(event: DragStartEvent) =>
        setDragged((event.active.data.current?.task as Task | undefined) ?? null)
      }
      onDragMove={(event) => setHover(slotFor(event))}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setDragged(null)
        setHover(null)
      }}
    >
      <div className="flex h-full min-h-0">
        <div className="flex min-w-0 flex-1 flex-col px-6 pb-4">
          <Toolbar title={title} mode={mode} anchor={anchor} today={today} settings={settings} />
          <div className="bg-card border-border min-h-0 flex-1 overflow-hidden rounded-xl border">
            {mode === 'month' ? (
              <MonthGrid
                anchor={anchor}
                today={today}
                settings={settings}
                categories={categories}
                tasksByDate={tasksByDate}
                onOpenDay={openDay}
              />
            ) : (
              <TimeGrid
                days={mode === 'week' ? weekDays(anchor, settings.weekStart) : [anchor]}
                today={today}
                settings={settings}
                categories={categories}
                tasksByDate={tasksByDate}
                hover={hover}
              />
            )}
          </div>
        </div>

        {!detailOpen && (
          <SidePanel
            selected={selected}
            today={today}
            dayTasks={tasksByDate.get(selected) ?? []}
            undated={undatedNow}
            settings={settings}
            categories={categories}
          />
        )}
      </div>

      <DragOverlay dropAnimation={null}>
        {dragged && (
          <TaskChip
            task={dragged}
            today={today}
            shape="line"
            color={chipColor(dragged, settings.calendarColorBy, categories)}
            className="shadow-lg ring-1 ring-black/5"
          />
        )}
      </DragOverlay>
    </DndContext>
  )
}

function Toolbar({
  title,
  mode,
  anchor,
  today,
  settings
}: {
  title: string
  mode: CalendarMode
  anchor: string
  today: string
  settings: Settings
}): React.JSX.Element {
  const step = (direction: number): void =>
    useUi.getState().selectDay(shiftAnchor(mode, anchor, direction))

  return (
    <header className="flex flex-wrap items-center gap-3 pt-2 pb-4">
      <h1 className="text-[26px] font-semibold tracking-tight">{title}</h1>
      <div className="ml-auto flex items-center gap-2">
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={settings.calendarColorBy}
          aria-label="Color by"
          onValueChange={(value) =>
            value && saveSettings({ calendarColorBy: value as Settings['calendarColorBy'] })
          }
        >
          {/* Native tooltips: Radix's tooltip trigger would overwrite the item's on/off state. */}
          <ToggleGroupItem
            value="category"
            aria-label="Color by category"
            title="Color by category"
          >
            <Tag />
          </ToggleGroupItem>
          <ToggleGroupItem
            value="priority"
            aria-label="Color by priority"
            title="Color by priority"
          >
            <Flag />
          </ToggleGroupItem>
        </ToggleGroup>

        <div className="flex items-center">
          <Button variant="ghost" size="icon-sm" aria-label="Previous" onClick={() => step(-1)}>
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={anchor === today}
            onClick={() => useUi.getState().selectDay(today)}
          >
            Today
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Next" onClick={() => step(1)}>
            <ChevronRight />
          </Button>
        </div>

        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={mode}
          aria-label="Calendar view"
          onValueChange={(value) => value && saveSettings({ calendarMode: value as CalendarMode })}
        >
          <ToggleGroupItem value="month" className="px-3">
            Month
          </ToggleGroupItem>
          <ToggleGroupItem value="week" className="px-3">
            Week
          </ToggleGroupItem>
          <ToggleGroupItem value="day" className="px-3">
            Day
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
    </header>
  )
}
