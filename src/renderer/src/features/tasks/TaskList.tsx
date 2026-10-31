import { useEffect, useMemo, useState } from 'react'
import { useAutoAnimate } from '@formkit/auto-animate/react'
import { AlertCircle, ChevronRight, MoreHorizontal } from 'lucide-react'
import { addDays, nextMonday } from '@shared/dates'
import type { Task } from '@shared/ipc'
import { Button } from '@renderer/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { dayLabel, longDate } from '@renderer/lib/format'
import { cn } from '@renderer/lib/utils'
import { useApp } from '@renderer/stores/app'
import { useUi, type View } from '@renderer/stores/ui'
import { attempt, taskActions } from './actions'
import { buildSections, type Section } from './sections'
import { TaskRow } from './TaskRow'

export function TaskList({
  view,
  tasks,
  today
}: {
  view: View
  tasks: Task[]
  today: string
}): React.JSX.Element {
  const held = useUi((state) => state.held)
  const [showDone, setShowDone] = useState(false)

  const sections = useMemo(
    () => buildSections(view, tasks, today, held),
    [view, tasks, today, held]
  )
  const toggle = (task: Task): void => void taskActions.toggle(task)

  const collapsed = (section: Section): boolean => section.kind === 'done' && !showDone

  // Tell the keyboard handler what's on screen, in order.
  useEffect(() => {
    const ids = sections.filter((s) => !collapsed(s)).flatMap((s) => s.tasks.map((t) => t.id))
    useUi.getState().setVisible(ids)
    // `collapsed` only reads showDone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections, showDone])

  const [parent] = useAutoAnimate({ duration: 180 })

  return (
    <div ref={parent} className="space-y-6">
      {sections.map((section) => (
        <section key={section.id} aria-label={sectionLabel(view, section, today)}>
          <SectionHeader
            view={view}
            section={section}
            today={today}
            collapsed={collapsed(section)}
            onToggleCollapsed={() => setShowDone((value) => !value)}
          />
          {!collapsed(section) && (
            <Rows view={view} section={section} today={today} onToggle={toggle} />
          )}
        </section>
      ))}
    </div>
  )
}

function Rows({
  view,
  section,
  today,
  onToggle
}: {
  view: View
  section: Section
  today: string
  onToggle: (task: Task) => void
}): React.JSX.Element {
  const categories = useApp((state) => state.categories)
  const [list] = useAutoAnimate({ duration: 180 })
  const showDate =
    section.kind === 'overdue' ||
    (section.kind === 'plain' && view.kind === 'category') ||
    view.kind === 'logbook'

  return (
    <ul ref={list} aria-label="Tasks">
      {section.tasks.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          today={today}
          category={
            view.kind === 'category'
              ? undefined
              : categories.find((category) => category.id === task.categoryId)
          }
          showDate={showDate}
          onToggle={onToggle}
        />
      ))}
    </ul>
  )
}

function sectionLabel(view: View, section: Section, today: string): string {
  switch (section.kind) {
    case 'overdue':
      return 'Overdue'
    case 'today':
      return 'Today'
    case 'done':
      return 'Completed'
    case 'day':
      return dayLabel(section.date!, today)
    case 'plain':
      if (view.kind === 'inbox') return 'Inbox'
      return section.id === 'later' ? 'Upcoming' : 'No date'
  }
}

function SectionHeader({
  view,
  section,
  today,
  collapsed,
  onToggleCollapsed
}: {
  view: View
  section: Section
  today: string
  collapsed: boolean
  onToggleCollapsed: () => void
}): React.JSX.Element | null {
  const label = sectionLabel(view, section, today)
  const count = section.tasks.length

  // Inbox and today's own list need no heading: the page title says it.
  if (view.kind === 'inbox' || (view.kind === 'today' && section.kind === 'today')) return null

  if (section.kind === 'done') {
    return (
      <button
        onClick={onToggleCollapsed}
        aria-expanded={!collapsed}
        className="text-muted-foreground hover:text-foreground mb-1 flex items-center gap-1 text-xs font-medium"
      >
        <ChevronRight className={cn('size-3.5 transition-transform', !collapsed && 'rotate-90')} />
        {collapsed ? `Show ${count} completed` : `Completed · ${count}`}
      </button>
    )
  }

  if (section.kind === 'overdue') {
    return <OverdueHeader tasks={section.tasks} today={today} />
  }

  if (section.kind === 'day') {
    const sub = view.kind === 'logbook' ? null : longDate(section.date!)
    return (
      <h2 className="border-border mb-1.5 flex items-baseline gap-2 border-b pb-1.5">
        <span className="text-[15px] font-semibold">{label}</span>
        {sub && sub !== label && (
          <span className="text-muted-foreground text-xs">{sub.replace(`${label}, `, '')}</span>
        )}
      </h2>
    )
  }

  return (
    <h2 className="text-muted-foreground border-border mb-1.5 border-b pb-1.5 text-xs font-medium tracking-wide uppercase">
      {label}
    </h2>
  )
}

/** Overdue tasks can all be moved at once, the bulk reschedule from the brief. */
function OverdueHeader({ tasks, today }: { tasks: Task[]; today: string }): React.JSX.Element {
  const ids = tasks.map((task) => task.id)
  const moveAll = (date: string): void =>
    void attempt(() => window.api.tasks.rescheduleOverdue({ date, ids }))

  return (
    <div className="border-border mb-1.5 flex items-center gap-2 border-b pb-1.5">
      <AlertCircle className="text-overdue size-3.5" />
      <span className="text-overdue text-xs font-medium tracking-wide uppercase">Overdue</span>
      <span className="text-muted-foreground text-xs">{tasks.length}</span>
      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="xs" onClick={() => moveAll(today)}>
          Move all to today
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-xs" aria-label="More ways to move overdue tasks">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => moveAll(addDays(today, 1))}>
              Move all to tomorrow
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => moveAll(nextMonday(today))}>
              Move all to next week
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => useUi.getState().set({ rescheduling: ids })}>
              Pick a date…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
