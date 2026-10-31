import type { Database } from 'better-sqlite3'
import type { ActivityEntry } from '@shared/ipc'
import type { ActivityAction, ActivityQuery } from '@shared/schemas'

interface ActivityRow {
  id: number
  task_id: string | null
  task_title: string
  action: ActivityAction
  from_date: string | null
  to_date: string | null
  changes: string | null
  created_at: string
}

export interface NewActivity {
  taskId: string
  taskTitle: string
  action: ActivityAction
  fromDate?: string | null
  toDate?: string | null
  changes?: Record<string, [unknown, unknown]>
  at: string
}

const DEFAULT_LIMIT = 100

export function createActivityRepo(db: Database) {
  const insert = db.prepare(`
    INSERT INTO activity_log (task_id, task_title, action, from_date, to_date, changes, created_at)
    VALUES (@taskId, @taskTitle, @action, @fromDate, @toDate, @changes, @at)
  `)

  return {
    add(entry: NewActivity): void {
      insert.run({
        ...entry,
        fromDate: entry.fromDate ?? null,
        toDate: entry.toDate ?? null,
        changes: entry.changes ? JSON.stringify(entry.changes) : null
      })
    },

    list(query: ActivityQuery): ActivityEntry[] {
      const where: string[] = []
      const params: Record<string, unknown> = { limit: query.limit ?? DEFAULT_LIMIT }

      if (query.taskId) {
        where.push('task_id = @taskId')
        params.taskId = query.taskId
      }
      if (query.before) {
        where.push('id < @before')
        params.before = query.before
      }
      if (query.actions?.length) {
        const names = query.actions.map((_, i) => `@action${i}`)
        where.push(`action IN (${names.join(', ')})`)
        query.actions.forEach((action, i) => (params[`action${i}`] = action))
      }

      const rows = db
        .prepare(
          `SELECT * FROM activity_log
           ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
           ORDER BY id DESC LIMIT @limit`
        )
        .all(params) as ActivityRow[]

      return rows.map((row) => ({
        id: row.id,
        taskId: row.task_id,
        taskTitle: row.task_title,
        action: row.action,
        fromDate: row.from_date,
        toDate: row.to_date,
        changes: row.changes ? JSON.parse(row.changes) : null,
        createdAt: row.created_at
      }))
    }
  }
}

export type ActivityRepo = ReturnType<typeof createActivityRepo>
