import type { Database } from 'better-sqlite3'
import type { Clock } from '../clock'
import { AppError } from '../errors'

export const BACKUP_FORMAT = 'bunty-backup'

/** Parents before children, so inserts satisfy foreign keys; deletes run in reverse. */
const TABLES = [
  'categories',
  'task_series',
  'tasks',
  'activity_log',
  'day_ledger',
  'settings'
] as const
type Table = (typeof TABLES)[number]

export interface BackupFile {
  format: typeof BACKUP_FORMAT
  /** The database schema the rows match (PRAGMA user_version). */
  schemaVersion: number
  exportedAt: string
  tables: Record<Table, Record<string, unknown>[]>
}

/** Secrets are encrypted for this machine and user; they'd be useless, and risky, anywhere else. */
const isSecret = (row: Record<string, unknown>): boolean =>
  typeof row.key === 'string' && row.key.startsWith('secret.')

function isSettingRow(row: Record<string, unknown>): boolean {
  if (typeof row.key !== 'string' || typeof row.value !== 'string') return false
  try {
    JSON.parse(row.value)
    return true
  } catch {
    return false
  }
}

export function createBackupService({ db, clock }: { db: Database; clock: Clock }) {
  const schemaVersion = (): number => db.pragma('user_version', { simple: true }) as number
  const columns = (table: Table): Set<string> =>
    new Set((db.pragma(`table_info(${table})`) as { name: string }[]).map((column) => column.name))

  function validate(data: unknown): BackupFile {
    const file = data as Partial<BackupFile> | null
    if (!file || typeof file !== 'object' || file.format !== BACKUP_FORMAT) {
      throw new AppError('BACKUP_INVALID', "That file isn't a Bunty backup.")
    }
    if (file.schemaVersion !== schemaVersion()) {
      throw new AppError(
        'BACKUP_INVALID',
        file.schemaVersion! > schemaVersion()
          ? 'That backup is from a newer version of Bunty. Update the app to restore it.'
          : 'That backup is from an older version of Bunty and can’t be restored here.'
      )
    }
    for (const table of TABLES) {
      const rows = file.tables?.[table]
      if (!Array.isArray(rows)) {
        throw new AppError('BACKUP_INVALID', `The backup is missing its ${table} data.`)
      }
      const known = columns(table)
      for (const row of rows) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) {
          throw new AppError('BACKUP_INVALID', `The backup's ${table} data is damaged.`)
        }
        const unknown = Object.keys(row).find((key) => !known.has(key))
        if (unknown) {
          throw new AppError('BACKUP_INVALID', `The backup has an unexpected ${table}.${unknown}.`)
        }
        // Settings are read back as JSON on every launch, so each must be a key and JSON text.
        if (table === 'settings' && !isSettingRow(row)) {
          throw new AppError('BACKUP_INVALID', "The backup's settings are damaged.")
        }
      }
    }
    return file as BackupFile
  }

  return {
    export(): BackupFile {
      const tables = Object.fromEntries(
        TABLES.map((table) => {
          const rows = db.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[]
          return [table, table === 'settings' ? rows.filter((row) => !isSecret(row)) : rows]
        })
      ) as BackupFile['tables']
      return {
        format: BACKUP_FORMAT,
        schemaVersion: schemaVersion(),
        exportedAt: clock.now().toISOString(),
        tables
      }
    },

    /** Checks the file before touching anything; then replaces everything, or nothing. */
    validate,

    restore(data: unknown, safetyCopy: string): { tasks: number } {
      const file = validate(data)
      // A copy of what's about to be replaced, in case the backup wasn't the one you meant.
      db.prepare('VACUUM INTO ?').run(safetyCopy)

      try {
        db.transaction(() => {
          for (const table of [...TABLES].reverse()) {
            // Keys stay: they belong to this machine, not to the data being restored.
            db.prepare(
              table === 'settings'
                ? "DELETE FROM settings WHERE key NOT LIKE 'secret.%'"
                : `DELETE FROM ${table}`
            ).run()
          }
          for (const table of TABLES) {
            for (const row of file.tables[table]) {
              if (table === 'settings' && isSecret(row)) continue
              const keys = Object.keys(row)
              db.prepare(
                `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map((key) => `@${key}`).join(', ')})`
              ).run(row)
            }
          }
        })()
      } catch (err) {
        if (err instanceof AppError) throw err
        // A foreign key, type or check constraint refused a row; the transaction rolled back.
        throw new AppError(
          'BACKUP_INVALID',
          'The backup’s data doesn’t fit together, so nothing was changed.'
        )
      }
      return { tasks: file.tables.tasks.length }
    }
  }
}

export type BackupService = ReturnType<typeof createBackupService>
