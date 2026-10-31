import type { Database } from 'better-sqlite3'
import {
  addDays,
  endOfMonth,
  startOfMonth,
  startOfWeek,
  toLocalDate,
  weekdayOf
} from '@shared/dates'
import type { DayTotals, Report } from '@shared/ipc'
import type { ReportQuery, WeekStart } from '@shared/schemas'
import type { Clock } from '../clock'

const TOP_RESCHEDULED = 10

export function periodRange(
  query: ReportQuery,
  weekStart: WeekStart
): { from: string; to: string } {
  switch (query.period) {
    case 'day':
      return { from: query.anchor, to: query.anchor }
    case 'week': {
      const from = startOfWeek(query.anchor, weekStart)
      return { from, to: addDays(from, 6) }
    }
    case 'month':
      return { from: startOfMonth(query.anchor), to: endOfMonth(query.anchor) }
  }
}

/** UTC timestamps to local midnight-to-midnight bounds, so "completed on Monday" is local. */
function localBounds(from: string, to: string): [string, string] {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  return [new Date(fy, fm - 1, fd).toISOString(), new Date(ty, tm - 1, td + 1).toISOString()]
}

export interface ReportTask {
  title: string
  date: string | null
  time: string | null
  status: string
  priority: string
  category: string | null
  completed_at: string | null
  original_date: string | null
  reschedule_count: number
  notes: string
}

/**
 * The numbers behind the Reports page. Finished days come from the day ledger (what was due and
 * done when each day ended), today is live, and days still ahead count as nothing yet.
 */
export function createReportService({
  db,
  clock,
  weekStart
}: {
  db: Database
  clock: Clock
  weekStart: () => WeekStart
}) {
  const ledger = db.prepare('SELECT * FROM day_ledger WHERE date BETWEEN ? AND ?')
  const todayTotals = db.prepare(`
    SELECT COUNT(*) AS due,
           COALESCE(SUM(status = 'done'), 0) AS done
    FROM tasks WHERE deleted_at IS NULL AND date = ?
  `)
  const completions = db.prepare(`
    SELECT completed_at FROM tasks
    WHERE deleted_at IS NULL AND status = 'done' AND completed_at >= ? AND completed_at < ?
  `)
  const countActivity = db.prepare(
    'SELECT COUNT(*) AS count FROM activity_log WHERE action = ? AND created_at >= ? AND created_at < ?'
  )
  const byCategory = db.prepare(`
    SELECT c.id, COALESCE(c.name, 'No category') AS name, c.color,
           COUNT(*) AS due, COALESCE(SUM(t.status = 'done'), 0) AS done
    FROM tasks t LEFT JOIN categories c ON c.id = t.category_id
    WHERE t.deleted_at IS NULL AND t.date BETWEEN ? AND ?
    GROUP BY c.id ORDER BY due DESC, name
  `)
  const rescheduled = db.prepare(`
    SELECT task_id AS taskId, task_title AS title, COUNT(*) AS moves
    FROM activity_log
    WHERE action = 'rescheduled' AND created_at >= ? AND created_at < ?
    GROUP BY task_id ORDER BY moves DESC, title LIMIT ${TOP_RESCHEDULED}
  `)
  const tasksInPeriod = db.prepare(`
    SELECT t.title, t.date, t.time, t.status, t.priority, c.name AS category, t.completed_at,
           t.original_date, t.reschedule_count, t.notes
    FROM tasks t LEFT JOIN categories c ON c.id = t.category_id
    WHERE t.deleted_at IS NULL AND t.date BETWEEN ? AND ?
    ORDER BY t.date, t.time IS NULL, t.time, t.title
  `)

  return {
    summary(query: ReportQuery): Report {
      const today = toLocalDate(clock.now())
      const { from, to } = periodRange(query, weekStart())
      const until = to < today ? to : today
      const [start, end] = localBounds(from, to)

      const closed = new Map(
        (
          ledger.all(from, until) as {
            date: string
            due_count: number
            done_count: number
            missed_count: number
          }[]
        ).map((row) => [row.date, row])
      )
      const live = todayTotals.get(today) as { due: number; done: number }

      const days: DayTotals[] = []
      for (let date = from; date <= to; date = addDays(date, 1)) {
        const row = closed.get(date)
        if (date === today) days.push({ date, due: live.due, done: live.done, missed: 0 })
        else if (row) {
          days.push({ date, due: row.due_count, done: row.done_count, missed: row.missed_count })
        } else days.push({ date, due: 0, done: 0, missed: 0 })
      }
      const due = days.reduce((sum, day) => sum + day.due, 0)
      const done = days.reduce((sum, day) => sum + day.done, 0)
      const missed = days.reduce((sum, day) => sum + day.missed, 0)

      // Completions by the local weekday they happened on, in the user's week order.
      const first = weekStart() === 'monday' ? 1 : 0
      const counts = new Array(7).fill(0)
      const finished = completions.all(start, end) as { completed_at: string }[]
      for (const { completed_at } of finished) {
        counts[weekdayOf(toLocalDate(new Date(completed_at)))] += 1
      }
      const byWeekday = Array.from({ length: 7 }, (_, i) => {
        const weekday = (first + i) % 7
        return { weekday, completed: counts[weekday] }
      })

      const count = (action: string): number =>
        (countActivity.get(action, start, end) as { count: number }).count

      return {
        from,
        to,
        totals: {
          due,
          done,
          missed,
          rate: due ? done / due : null,
          completed: finished.length,
          rescheduled: count('rescheduled'),
          created: count('created')
        },
        days,
        byWeekday,
        categories: byCategory.all(from, until) as Report['categories'],
        mostRescheduled: rescheduled.all(start, end) as Report['mostRescheduled']
      }
    },

    /** Every task dated in the period, for export. */
    tasks(query: ReportQuery): ReportTask[] {
      const { from, to } = periodRange(query, weekStart())
      return tasksInPeriod.all(from, to) as ReportTask[]
    }
  }
}

export type ReportService = ReturnType<typeof createReportService>
