import type { Database } from 'better-sqlite3'
import type { Task, TaskCounts } from '@shared/ipc'
import type { Priority, Recurrence, TaskQuery, TaskStatus } from '@shared/schemas'
import { maskToWeekdays } from '../recurrence'

export interface TaskRow {
  id: string
  title: string
  notes: string
  date: string | null
  time: string | null
  priority: Priority
  category_id: string | null
  status: TaskStatus
  series_id: string | null
  occurrence_date: string | null
  original_date: string | null
  reschedule_count: number
  created_at: string
  updated_at: string
  completed_at: string | null
  missed_at: string | null
  reminded_at: string | null
  deleted_at: string | null
}

export interface SeriesRow {
  id: string
  title: string
  notes: string
  time: string | null
  priority: Priority
  category_id: string | null
  recurrence: 'daily' | 'weekly' | 'custom'
  weekdays: number
  start_date: string
  end_date: string | null
  materialized_through: string
  created_at: string
  updated_at: string
}

type JoinedRow = TaskRow & {
  series_recurrence: SeriesRow['recurrence'] | null
  series_weekdays: number | null
  series_end_date: string | null
}

export type TaskColumns = Partial<Omit<TaskRow, 'id' | 'created_at'>>
export type SeriesColumns = Partial<Omit<SeriesRow, 'id' | 'created_at'>>

const SELECT_TASK = `
  SELECT t.*,
         s.recurrence AS series_recurrence,
         s.weekdays   AS series_weekdays,
         s.end_date   AS series_end_date
  FROM tasks t
  LEFT JOIN task_series s ON s.id = t.series_id
`

const PRIORITY_RANK = `CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END`

function recurrenceOf(row: JoinedRow): Recurrence {
  const { series_recurrence: kind, series_weekdays: mask, series_end_date: end } = row
  // The last occurrence of a stopped series no longer repeats.
  if (!kind || mask === null || (end && row.occurrence_date! >= end)) return { kind: 'none' }
  return kind === 'custom' ? { kind, weekdays: maskToWeekdays(mask) } : { kind }
}

export function toTask(row: JoinedRow): Task {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    date: row.date,
    time: row.time,
    priority: row.priority,
    categoryId: row.category_id,
    status: row.status,
    recurrence: recurrenceOf(row),
    seriesId: row.series_id,
    occurrenceDate: row.occurrence_date,
    originalDate: row.original_date,
    rescheduleCount: row.reschedule_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    missedAt: row.missed_at
  }
}

// Column names only ever come from TaskColumns / SeriesColumns, never from user input.
function assignments(columns: object): string {
  return Object.keys(columns)
    .map((key) => `${key} = @${key}`)
    .join(', ')
}

export function createTasksRepo(db: Database) {
  const findTask = db.prepare(`${SELECT_TASK} WHERE t.id = ?`)
  const findSeries = db.prepare('SELECT * FROM task_series WHERE id = ?')
  const insertTask = db.prepare(`
    INSERT INTO tasks (id, title, notes, date, time, priority, category_id, status, series_id,
                       occurrence_date, original_date, created_at, updated_at)
    VALUES (@id, @title, @notes, @date, @time, @priority, @category_id, 'pending', @series_id,
            @occurrence_date, @original_date, @created_at, @updated_at)
  `)
  const insertOccurrence = db.prepare(`
    INSERT INTO tasks (id, title, notes, date, time, priority, category_id, status, series_id,
                       occurrence_date, original_date, created_at, updated_at)
    VALUES (@id, @title, @notes, @date, @time, @priority, @category_id, 'pending', @series_id,
            @date, @date, @at, @at)
    ON CONFLICT DO NOTHING
  `)
  const insertSeries = db.prepare(`
    INSERT INTO task_series (id, title, notes, time, priority, category_id, recurrence, weekdays,
                             start_date, end_date, materialized_through, created_at, updated_at)
    VALUES (@id, @title, @notes, @time, @priority, @category_id, @recurrence, @weekdays,
            @start_date, @end_date, @materialized_through, @created_at, @updated_at)
  `)

  return {
    /** Finds a task unless it's deleted. */
    find(id: string): JoinedRow | undefined {
      const row = findTask.get(id) as JoinedRow | undefined
      return row?.deleted_at ? undefined : row
    },

    findIncludingDeleted(id: string): JoinedRow | undefined {
      return findTask.get(id) as JoinedRow | undefined
    },

    list(query: TaskQuery): Task[] {
      const where = ['t.deleted_at IS NULL']
      const params: Record<string, unknown> = {}

      if (query.from) {
        where.push('t.date >= @from')
        params.from = query.from
      }
      if (query.to) {
        where.push('t.date <= @to')
        params.to = query.to
      }
      if (query.unscheduled) where.push('t.date IS NULL')
      if (query.categoryId) {
        where.push('t.category_id = @categoryId')
        params.categoryId = query.categoryId
      }
      if (query.statuses?.length) {
        const names = query.statuses.map((_, i) => `@status${i}`)
        where.push(`t.status IN (${names.join(', ')})`)
        query.statuses.forEach((status, i) => (params[`status${i}`] = status))
      }
      if (query.search) {
        where.push(`t.title LIKE @search ESCAPE '\\'`)
        params.search = `%${query.search.replace(/[\\%_]/g, '\\$&')}%`
      }

      const order =
        query.orderBy === 'completed'
          ? 't.completed_at DESC'
          : `t.date IS NULL, t.date, t.time IS NULL, t.time, ${PRIORITY_RANK}, t.created_at`
      if (query.limit) params.limit = query.limit

      const rows = db
        .prepare(
          `${SELECT_TASK}
           WHERE ${where.join(' AND ')}
           ORDER BY ${order}
           ${query.limit ? 'LIMIT @limit' : ''}`
        )
        .all(params) as JoinedRow[]
      return rows.map(toTask)
    },

    counts(today: string): TaskCounts {
      const row = db
        .prepare(
          `SELECT
             COALESCE(SUM(date = @today AND status <> 'done'), 0) AS today,
             COALESCE(SUM(date = @today AND status = 'done'), 0)  AS doneToday,
             COALESCE(SUM(date < @today AND status <> 'done'), 0) AS overdue,
             COALESCE(SUM(date IS NULL AND status <> 'done'), 0)  AS inbox
           FROM tasks
           WHERE deleted_at IS NULL`
        )
        .get({ today }) as TaskCounts
      return row
    },

    /** Open tasks whose date has passed, oldest first. */
    overdue(today: string): JoinedRow[] {
      return db
        .prepare(
          `${SELECT_TASK}
           WHERE t.deleted_at IS NULL AND t.status <> 'done' AND t.date < ?
           ORDER BY t.date, t.created_at`
        )
        .all(today) as JoinedRow[]
    },

    insert(row: Omit<TaskRow, TaskOnlyDefaults>): void {
      insertTask.run(row)
    },

    patch(id: string, columns: TaskColumns): void {
      db.prepare(`UPDATE tasks SET ${assignments(columns)} WHERE id = @id`).run({ ...columns, id })
    },

    findSeries(id: string): SeriesRow | undefined {
      return findSeries.get(id) as SeriesRow | undefined
    },

    insertSeries(row: SeriesRow): void {
      insertSeries.run(row)
    },

    patchSeries(id: string, columns: SeriesColumns): void {
      db.prepare(`UPDATE task_series SET ${assignments(columns)} WHERE id = @id`).run({
        ...columns,
        id
      })
    },

    /** Running series that haven't generated occurrences as far as `until`. */
    seriesBehind(until: string): SeriesRow[] {
      return db
        .prepare(
          `SELECT * FROM task_series
           WHERE end_date IS NULL AND materialized_through < @until`
        )
        .all({ until }) as SeriesRow[]
    },

    /** Inserts an occurrence, unless a finished or moved one already holds that slot. */
    insertOccurrence(series: SeriesRow, id: string, date: string, at: string): void {
      insertOccurrence.run({
        id,
        date,
        at,
        title: series.title,
        notes: series.notes,
        time: series.time,
        priority: series.priority,
        category_id: series.category_id,
        series_id: series.id
      })
    },

    /** Applies the same columns to open occurrences from `from` onward. Returns their ids. */
    patchOpenOccurrences(seriesId: string, from: string, columns: TaskColumns): string[] {
      const rows = db
        .prepare(
          `UPDATE tasks SET ${assignments(columns)}
           WHERE series_id = @seriesId AND occurrence_date >= @from
             AND status <> 'done' AND deleted_at IS NULL
           RETURNING id`
        )
        .all({ ...columns, seriesId, from }) as { id: string }[]
      return rows.map((row) => row.id)
    },

    /**
     * Clears the way for a new pattern: removes occurrences after `after` that nobody has
     * touched, along with deleted ones, so the new pattern can use those dates.
     */
    clearGeneratedOccurrences(seriesId: string, after: string): string[] {
      const rows = db
        .prepare(
          `DELETE FROM tasks
           WHERE series_id = @seriesId AND occurrence_date > @after
             AND (deleted_at IS NOT NULL OR (status = 'pending' AND reschedule_count = 0))
           RETURNING id`
        )
        .all({ seriesId, after }) as { id: string }[]
      return rows.map((row) => row.id)
    }
  }
}

type TaskOnlyDefaults =
  'status' | 'reschedule_count' | 'completed_at' | 'missed_at' | 'reminded_at' | 'deleted_at'

export type TasksRepo = ReturnType<typeof createTasksRepo>
