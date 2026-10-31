import { existsSync } from 'fs'
import type { Database } from 'better-sqlite3'

export interface Migration {
  version: number
  name: string
  sql: string
}

const files = import.meta.glob<string>('./migrations/*.sql', {
  eager: true,
  query: '?raw',
  import: 'default'
})

/** Migrations are `NNNN_name.sql` files, numbered from 0001 with no gaps. */
export function loadMigrations(sources: Record<string, string> = files): Migration[] {
  const migrations = Object.entries(sources)
    .map(([path, sql]) => {
      const name = path
        .split('/')
        .pop()!
        .replace(/\.sql$/, '')
      return { version: Number(name.split('_')[0]), name, sql }
    })
    .sort((a, b) => a.version - b.version)

  migrations.forEach((migration, index) => {
    if (migration.version !== index + 1) {
      throw new Error(`Migration ${migration.name} is out of sequence, expected ${index + 1}`)
    }
  })
  return migrations
}

export interface MigrateOptions {
  /** Where to snapshot an existing database before changing it. */
  backupPath?: (fromVersion: number) => string
}

/**
 * Brings the database up to the newest migration. The version lives in `PRAGMA user_version`
 * and is written inside each migration's transaction, so a failure leaves the database at the
 * last good version rather than half-migrated.
 */
export function migrate(
  db: Database,
  migrations: Migration[],
  { backupPath }: MigrateOptions = {}
): { from: number; to: number } {
  const from = db.pragma('user_version', { simple: true }) as number
  const latest = migrations.at(-1)?.version ?? 0

  if (from > latest) {
    throw new Error(
      `This database is from a newer version of Bunty (schema v${from}, this app knows v${latest}). ` +
        'Update the app to open it.'
    )
  }

  const pending = migrations.filter((migration) => migration.version > from)
  if (pending.length === 0) return { from, to: from }

  // A snapshot may already exist if an earlier attempt failed. It's of this same version, and
  // VACUUM INTO refuses to overwrite, so keep it rather than block every later launch.
  const snapshot = from > 0 ? backupPath?.(from) : undefined
  if (snapshot && !existsSync(snapshot)) {
    db.prepare('VACUUM INTO ?').run(snapshot)
  }

  for (const migration of pending) {
    db.transaction(() => {
      db.exec(migration.sql)
      db.pragma(`user_version = ${migration.version}`)
    })()
  }
  return { from, to: latest }
}
