import Database from 'better-sqlite3'
import { loadMigrations, migrate } from './migrate'

export function openDatabase(file: string): Database.Database {
  const db = new Database(file)
  try {
    db.pragma('journal_mode = WAL')
    db.pragma('synchronous = NORMAL')
    db.pragma('foreign_keys = ON')
    migrate(db, loadMigrations(), { backupPath: (from) => `${file}.v${from}.bak` })
    return db
  } catch (err) {
    db.close()
    throw err
  }
}
