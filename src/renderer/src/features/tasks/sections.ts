// Which tasks each view asks for, and how it groups them. Pure, so it's unit-tested.
import { addDays } from '@shared/dates'
import type { Task } from '@shared/ipc'
import type { TaskQuery, TaskStatus } from '@shared/schemas'
import type { View } from '@renderer/stores/ui'

export const OPEN: TaskStatus[] = ['pending', 'rescheduled', 'missed']

/** How far the Upcoming view looks ahead. */
export const UPCOMING_DAYS = 30

export interface Section {
  id: string
  kind: 'overdue' | 'today' | 'day' | 'done' | 'plain'
  /** Set for sections that are a single day. */
  date?: string
  tasks: Task[]
}

export function queriesFor(view: View, today: string): TaskQuery[] {
  switch (view.kind) {
    case 'today':
      return [
        { to: today, statuses: OPEN },
        { from: today, to: today, statuses: ['done'] }
      ]
    case 'upcoming':
      return [{ from: addDays(today, 1), to: addDays(today, UPCOMING_DAYS) }]
    case 'inbox':
      return [{ unscheduled: true, statuses: OPEN }]
    case 'logbook':
      return [{ statuses: ['done'], orderBy: 'completed', limit: 300 }]
    case 'category':
      return [{ categoryId: view.id, statuses: OPEN }]
    case 'calendar':
    case 'streaks':
    case 'reports':
    case 'settings':
      return []
  }
}

const isOpen = (task: Task): boolean => task.status !== 'done'

function byDay(tasks: Task[], dayOf: (task: Task) => string | null, kind: Section['kind']) {
  const groups = new Map<string, Task[]>()
  for (const task of tasks) {
    const day = dayOf(task) ?? 'none'
    groups.set(day, [...(groups.get(day) ?? []), task])
  }
  return [...groups].map(([date, tasks]) => ({ id: `day:${date}`, kind, date, tasks }))
}

/** Later occurrences of a repeating task would crowd a category view, so keep the next one. */
function nextOccurrenceOnly(tasks: Task[]): Task[] {
  const seen = new Set<string>()
  return tasks.filter((task) => {
    if (!task.seriesId) return true
    if (seen.has(task.seriesId)) return false
    seen.add(task.seriesId)
    return true
  })
}

/**
 * Groups a view's tasks into sections. `held` keeps a just-ticked task in the section it was
 * in for a moment, so it doesn't jump away from under the cursor.
 */
export function buildSections(
  view: View,
  tasks: Task[],
  today: string,
  held: ReadonlyMap<string, 'open' | 'done'> = new Map()
): Section[] {
  const open = (task: Task): boolean => {
    const heldAs = held.get(task.id)
    return heldAs ? heldAs === 'open' : isOpen(task)
  }
  const nonEmpty = (sections: Section[]): Section[] => sections.filter((s) => s.tasks.length)

  switch (view.kind) {
    case 'today': {
      const overdue = tasks.filter((task) => open(task) && task.date! < today)
      const due = tasks.filter((task) => open(task) && task.date === today)
      const done = tasks.filter((task) => !open(task))
      return nonEmpty([
        { id: 'overdue', kind: 'overdue', tasks: overdue },
        { id: 'today', kind: 'today', date: today, tasks: due },
        { id: 'done', kind: 'done', tasks: done }
      ])
    }
    case 'upcoming':
      return byDay(tasks, (task) => task.date, 'day')
    case 'logbook':
      return byDay(tasks, (task) => task.completedAt && localDay(task.completedAt), 'day')
    case 'category': {
      const visible = nextOccurrenceOnly(tasks)
      return nonEmpty([
        {
          id: 'overdue',
          kind: 'overdue',
          tasks: visible.filter((task) => task.date && task.date < today)
        },
        { id: 'today', kind: 'today', date: today, tasks: visible.filter((t) => t.date === today) },
        {
          id: 'later',
          kind: 'plain',
          tasks: visible.filter((task) => task.date && task.date > today)
        },
        { id: 'someday', kind: 'plain', tasks: visible.filter((task) => !task.date) }
      ])
    }
    case 'inbox':
      return nonEmpty([{ id: 'inbox', kind: 'plain', tasks }])
    case 'calendar':
    case 'streaks':
    case 'reports':
    case 'settings':
      return []
  }
}

function localDay(iso: string): string {
  const value = new Date(iso)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
}
