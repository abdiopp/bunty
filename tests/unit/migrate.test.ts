import { existsSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from '@main/db/connection'
import { loadMigrations, migrate, type Migration } from '@main/db/migrate'

const version = (db: Database.Database): number =>
  db.pragma('user_version', { simple: true }) as number

const tables = (db: Database.Database): string[] =>
  (
    db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`).all() as {
      name: string
    }[]
  ).map((row) => row.name)

const m1: Migration = { version: 1, name: '0001_a', sql: 'CREATE TABLE a (x TEXT)' }
const m2: Migration = { version: 2, name: '0002_b', sql: 'CREATE TABLE b (x TEXT)' }
const broken: Migration = {
  version: 2,
  name: '0002_broken',
  sql: 'CREATE TABLE c (x TEXT); INSERT INTO nope VALUES (1);'
}

describe('migrate', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
  })

  it('creates the full schema on a new database', () => {
    const real = loadMigrations()
    expect(migrate(db, real)).toEqual({ from: 0, to: real.length })
    expect(tables(db)).toEqual(
      expect.arrayContaining([
        'activity_log',
        'categories',
        'day_ledger',
        'settings',
        'task_series',
        'tasks'
      ])
    )
  })

  it('does nothing when already up to date', () => {
    migrate(db, [m1])
    expect(migrate(db, [m1])).toEqual({ from: 1, to: 1 })
  })

  it('applies only what is pending', () => {
    migrate(db, [m1])
    expect(migrate(db, [m1, m2])).toEqual({ from: 1, to: 2 })
    expect(tables(db)).toContain('b')
  })

  it('refuses a database from a newer app version', () => {
    migrate(db, [m1, m2])
    expect(() => migrate(db, [m1])).toThrow(/newer version/)
    expect(version(db)).toBe(2)
  })

  it('rolls back a failed migration completely', () => {
    migrate(db, [m1])
    expect(() => migrate(db, [m1, broken])).toThrow()
    expect(version(db)).toBe(1)
    expect(tables(db)).not.toContain('c')
  })

  it('rejects gaps in the numbering', () => {
    expect(() => loadMigrations({ './0001_a.sql': '', './0003_c.sql': '' })).toThrow(/sequence/)
  })
})

describe('backups', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'bunty-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('snapshots an existing database before migrating it', () => {
    const db = new Database(join(dir, 'a.sqlite'))
    migrate(db, [m1])
    db.prepare('CREATE TABLE keep (x TEXT)').run()

    const backup = join(dir, 'a.v1.bak')
    migrate(db, [m1, m2], { backupPath: () => backup })
    db.close()

    const copy = new Database(backup, { readonly: true })
    expect(tables(copy)).toContain('keep')
    expect(tables(copy)).not.toContain('b')
    copy.close()
  })

  it('still starts after a failed migration left a backup behind', () => {
    const db = new Database(join(dir, 'a.sqlite'))
    migrate(db, [m1])

    const backup = join(dir, 'a.v1.bak')
    expect(() => migrate(db, [m1, broken], { backupPath: () => backup })).toThrow(/nope/)
    expect(existsSync(backup)).toBe(true)

    expect(migrate(db, [m1, m2], { backupPath: () => backup })).toEqual({ from: 1, to: 2 })
    db.close()
  })

  it('takes no backup of a brand-new database', () => {
    const backup = join(dir, 'never.bak')
    const db = new Database(join(dir, 'a.sqlite'))
    migrate(db, [m1], { backupPath: () => backup })
    db.close()
    expect(existsSync(backup)).toBe(false)
  })

  it('opens with write-ahead logging and foreign keys on, and data survives a reopen', () => {
    const file = join(dir, 'real.sqlite')
    const db = openDatabase(file)
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal')
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
    db.prepare(`INSERT INTO settings VALUES ('k', '1', 'now')`).run()
    db.close()

    const again = openDatabase(file)
    expect(again.prepare('SELECT value FROM settings').get()).toEqual({ value: '1' })
    again.close()
  })
})
