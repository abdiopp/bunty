import Database from 'better-sqlite3'
import { createActivityRepo } from '@main/db/activity-repo'
import { loadMigrations, migrate } from '@main/db/migrate'
import { createCategoryService } from '@main/services/category-service'
import { createReminders } from '@main/services/reminders'
import { createReportService } from '@main/services/report-service'
import { createRollover } from '@main/services/rollover'
import { createMetaStore, createSettingsService } from '@main/services/settings-service'
import { createStreakService } from '@main/services/streak-service'
import { createTaskService } from '@main/services/task-service'

/** Local noon on a date, so tests read the same in every timezone. */
export function at(date: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d, 12)
}

export function testApp(today = '2026-11-02') {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  migrate(db, loadMigrations())

  let now = at(today)
  const clock = { now: () => now }
  const changes: string[][] = []

  const meta = createMetaStore(db, clock)
  const tasks = createTaskService({ db, clock, onChange: (ids) => changes.push(ids) })

  return {
    db,
    changes,
    meta,
    /** Moves the clock, as if the app had been left running or reopened later. */
    setToday(date: string) {
      now = at(date)
    },
    tasks,
    rollover: createRollover({ db, clock, meta, tasks }),
    reminders: createReminders({ db, clock, meta }),
    streaks: createStreakService({ db, clock }),
    reports: createReportService({ db, clock, weekStart: () => 'monday' }),
    /** Sets the time of day, keeping the date. */
    setTime(hours: number, minutes = 0) {
      now = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes)
    },
    categories: createCategoryService({ db, clock }),
    settings: createSettingsService({ db, clock }),
    activity: createActivityRepo(db)
  }
}

export type TestApp = ReturnType<typeof testApp>
