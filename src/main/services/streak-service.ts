import type { Database } from 'better-sqlite3'
import { addDays, toLocalDate } from '@shared/dates'
import type { HeatmapDay, SeriesStreak, StreakSummary } from '@shared/ipc'
import type { Clock } from '../clock'
import { maskToWeekdays } from '../recurrence'

interface LedgerRow {
  date: string
  due_count: number
  done_count: number
  missed_count: number
}

/** About a year, rounded up to whole weeks plus the current one. */
const HEATMAP_DAYS = 371
const RECENT_OCCURRENCES = 14

type Outcome = 'done' | 'missed' | 'pending'

/**
 * Streaks come from the day ledger, which is written once per finished day, so moving or
 * finishing a missed task later can't repair a broken day. Today counts as soon as everything
 * due today is done, and never breaks a streak while it's still in progress.
 */
export function createStreakService({ db, clock }: { db: Database; clock: Clock }) {
  const ledger = db.prepare('SELECT * FROM day_ledger WHERE date >= ? ORDER BY date')
  const todayTotals = db.prepare(`
    SELECT COUNT(*) AS due, COALESCE(SUM(status = 'done'), 0) AS done
    FROM tasks WHERE deleted_at IS NULL AND date = ?
  `)
  const allSeries = db.prepare(
    'SELECT id, title, recurrence, weekdays, category_id, end_date FROM task_series ORDER BY title'
  )
  const occurrences = db.prepare(`
    SELECT date, occurrence_date, status, missed_at FROM tasks
    WHERE series_id = ? AND deleted_at IS NULL AND occurrence_date <= ?
    ORDER BY occurrence_date
  `)

  const today = (): string => toLocalDate(clock.now())

  function dailyStreaks(): { current: number; longest: number; due: number; done: number } {
    const day = today()
    const rows = ledger.all('0000-00-00') as LedgerRow[]
    const { due, done } = todayTotals.get(day) as { due: number; done: number }
    const perfect = (row: { due: number; done: number }): boolean =>
      row.due > 0 && row.done === row.due

    let run = 0
    let longest = 0
    for (const row of rows) {
      // A day with nothing due neither extends nor breaks a streak.
      if (row.due_count === 0) continue
      run = perfect({ due: row.due_count, done: row.done_count }) ? run + 1 : 0
      longest = Math.max(longest, run)
    }
    const todayPerfect = perfect({ due, done })
    if (todayPerfect) longest = Math.max(longest, run + 1)

    let current = todayPerfect ? 1 : 0
    for (const row of [...rows].reverse()) {
      if (row.due_count === 0) continue
      if (!perfect({ due: row.due_count, done: row.done_count })) break
      current += 1
    }
    return { current, longest, due, done }
  }

  function seriesStreaks(): SeriesStreak[] {
    const day = today()
    const list = allSeries.all() as {
      id: string
      title: string
      recurrence: 'daily' | 'weekly' | 'custom'
      weekdays: number
      category_id: string | null
      end_date: string | null
    }[]

    return list
      .map((series) => {
        const rows = occurrences.all(series.id, day) as {
          date: string
          status: string
          missed_at: string | null
        }[]
        const outcomes: Outcome[] = rows.map((row) => {
          if (row.status === 'done') return row.missed_at ? 'missed' : 'done'
          // Still open on or after today: not judged yet.
          return row.date >= day ? 'pending' : 'missed'
        })
        let run = 0
        let longest = 0
        for (const outcome of outcomes) {
          if (outcome === 'pending') continue
          run = outcome === 'done' ? run + 1 : 0
          longest = Math.max(longest, run)
        }
        let current = 0
        for (const outcome of [...outcomes].reverse()) {
          if (outcome === 'pending') continue
          if (outcome === 'missed') break
          current += 1
        }
        return {
          seriesId: series.id,
          title: series.title,
          categoryId: series.category_id,
          recurrence:
            series.recurrence === 'custom'
              ? { kind: 'custom' as const, weekdays: maskToWeekdays(series.weekdays) }
              : { kind: series.recurrence },
          active: series.end_date === null,
          current,
          longest,
          recent: outcomes.slice(-RECENT_OCCURRENCES)
        }
      })
      .filter((streak) => streak.recent.length > 0)
      .sort((a, b) => Number(b.active) - Number(a.active) || b.current - a.current)
  }

  return {
    summary(): StreakSummary {
      const { current, longest, due, done } = dailyStreaks()
      return { current, longest, today: { due, done }, series: seriesStreaks() }
    },

    /** Each day of the last year with its totals; today is live, the rest from the ledger. */
    heatmap(): HeatmapDay[] {
      const day = today()
      const rows = ledger.all(addDays(day, -HEATMAP_DAYS)) as LedgerRow[]
      const { due, done } = todayTotals.get(day) as { due: number; done: number }
      return [
        ...rows.map((row) => ({ date: row.date, due: row.due_count, done: row.done_count })),
        { date: day, due, done }
      ]
    }
  }
}

export type StreakService = ReturnType<typeof createStreakService>
