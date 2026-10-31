import type { Database } from 'better-sqlite3'
import { addDays, isLocalDate, toLocalDate } from '@shared/dates'
import type { Clock } from '../clock'
import { createActivityRepo } from '../db/activity-repo'
import type { MetaStore } from './settings-service'
import type { TaskService } from './task-service'

/** How far back a first run, or a long time switched off, will close days. */
const MAX_CATCH_UP_DAYS = 400

interface Deps {
  db: Database
  clock: Clock
  meta: MetaStore
  tasks: TaskService
}

export interface RolloverResult {
  /** Days that were closed, oldest first. */
  closed: string[]
  /** Tasks that became missed. */
  missed: string[]
}

/**
 * Closes every finished day since the last run: open tasks become missed, and each day's
 * result is written to the ledger once. Runs at midnight and on launch, so days the PC was
 * off are caught up. Safe to run any number of times.
 */
export function createRollover({ db, clock, meta, tasks }: Deps) {
  const activity = createActivityRepo(db)
  const dayTasks = db.prepare(
    'SELECT id, title, status, missed_at FROM tasks WHERE date = ? AND deleted_at IS NULL'
  )
  const markMissed = db.prepare(`
    UPDATE tasks SET status = 'missed', missed_at = COALESCE(missed_at, @at), updated_at = @at
    WHERE id = @id
  `)
  const writeLedger = db.prepare(`
    INSERT OR IGNORE INTO day_ledger (date, due_count, done_count, missed_count, closed_at)
    VALUES (?, ?, ?, ?, ?)
  `)
  const earliestOpenDay = db.prepare(
    'SELECT MIN(date) AS first FROM tasks WHERE deleted_at IS NULL AND date < ?'
  )

  return {
    run(): RolloverResult {
      // Repeating tasks need their occurrences in place before their days are judged.
      tasks.ensureOccurrences()
      const now = clock.now()
      const at = now.toISOString()
      const yesterday = addDays(toLocalDate(now), -1)

      return db.transaction((): RolloverResult => {
        const stored = meta.get<unknown>('lastClosedDate')
        let last: string
        // Missing, or damaged (say, by a hand-edited backup): start over as on a first run.
        if (typeof stored === 'string' && isLocalDate(stored)) last = stored
        else {
          // First run: start from the earliest dated task, so older open tasks are judged too.
          const { first } = earliestOpenDay.get(toLocalDate(now)) as { first: string | null }
          last = first ? addDays(first, -1) : yesterday
        }
        if (last >= yesterday) {
          // Remember the starting point even when there's nothing to close yet, so the next
          // run picks up from here rather than guessing again.
          meta.set('lastClosedDate', last)
          return { closed: [], missed: [] }
        }

        const floor = addDays(yesterday, -MAX_CATCH_UP_DAYS)
        const closed: string[] = []
        const missed: string[] = []
        for (
          let day = addDays(last, 1) < floor ? floor : addDays(last, 1);
          day <= yesterday;
          day = addDays(day, 1)
        ) {
          const rows = dayTasks.all(day) as {
            id: string
            title: string
            status: string
            missed_at: string | null
          }[]
          const open = rows.filter((row) => row.status !== 'done')
          for (const row of open) {
            if (row.status !== 'missed') {
              activity.add({ taskId: row.id, taskTitle: row.title, action: 'missed', at })
            }
            markMissed.run({ id: row.id, at })
            missed.push(row.id)
          }
          writeLedger.run(day, rows.length, rows.length - open.length, open.length, at)
          closed.push(day)
        }
        meta.set('lastClosedDate', yesterday)
        return { closed, missed }
      })()
    }
  }
}

export type Rollover = ReturnType<typeof createRollover>
