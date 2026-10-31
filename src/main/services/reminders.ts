import type { Database } from 'better-sqlite3'
import { minutesOfTime, toLocalDate } from '@shared/dates'
import type { Clock } from '../clock'
import type { MetaStore } from './settings-service'

/** A reminder this late after the task's time would only be noise, e.g. after a restart. */
const STALE_AFTER_MINUTES = 60

export interface Reminder {
  id: string
  title: string
  time: string
}

export function createReminders({
  db,
  clock,
  meta
}: {
  db: Database
  clock: Clock
  meta: MetaStore
}) {
  const pending = db.prepare(`
    SELECT id, title, time FROM tasks
    WHERE deleted_at IS NULL AND status <> 'done' AND date = ? AND time IS NOT NULL
      AND reminded_at IS NULL
  `)
  const markReminded = db.prepare('UPDATE tasks SET reminded_at = ? WHERE id = ?')
  const openToday = db.prepare(`
    SELECT COUNT(*) AS count FROM tasks
    WHERE deleted_at IS NULL AND status <> 'done' AND date = ?
  `)

  const nowParts = (): { today: string; minute: number; at: string } => {
    const now = clock.now()
    return {
      today: toLocalDate(now),
      minute: now.getHours() * 60 + now.getMinutes(),
      at: now.toISOString()
    }
  }

  return {
    /**
     * Timed tasks whose reminder is due, each returned once. Ones missed by a wide margin
     * (Bunty was closed) are marked as handled without being announced.
     */
    due(minutesBefore: number): Reminder[] {
      const { today, minute, at } = nowParts()
      const reached = (pending.all(today) as Reminder[]).filter(
        (task) => minutesOfTime(task.time) - minutesBefore <= minute
      )
      db.transaction(() => reached.forEach((task) => markReminded.run(at, task.id)))()
      return reached.filter((task) => minute - minutesOfTime(task.time) <= STALE_AFTER_MINUTES)
    },

    /** Today's still-open tasks, once a day after the summary time; otherwise null. */
    summary(time: string): number | null {
      const { today, minute } = nowParts()
      if (minute < minutesOfTime(time) || meta.get<string>('lastSummaryDate') === today) {
        return null
      }
      meta.set('lastSummaryDate', today)
      return (openToday.get(today) as { count: number }).count
    }
  }
}

export type Reminders = ReturnType<typeof createReminders>
