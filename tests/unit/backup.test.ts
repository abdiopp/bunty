import { mkdtempSync, rmSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createBackupService } from '@main/services/backup-service'
import { testApp, type TestApp } from './helpers'

describe('backup and restore', () => {
  let dir: string
  let source: TestApp

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'bunty-backup-'))
    source = testApp('2026-11-02')
    const work = source.categories.create({ name: 'Work', color: '#5b6cf0' })
    source.tasks.create({ title: 'Gym', date: '2026-11-02', recurrence: { kind: 'daily' } })
    const task = source.tasks.create({ title: 'Report', date: '2026-11-03', categoryId: work.id })
    source.tasks.reschedule({ id: task.id, date: '2026-11-04' })
    source.settings.update({ theme: 'dark' })
    source.db.prepare(`INSERT INTO settings VALUES ('secret.openaiKey', '"sealed"', 'now')`).run()
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  const service = (app: TestApp) =>
    createBackupService({ db: app.db, clock: { now: () => new Date() } })

  it('restores everything into another install, exactly', () => {
    const file = JSON.parse(JSON.stringify(service(source).export()))
    const target = testApp('2026-11-02')
    target.tasks.create({ title: 'Will be replaced' })

    const result = service(target).restore(file, join(dir, 'safety.bak'))

    const titles = (app: TestApp) =>
      app.tasks
        .list({})
        .map((task) => task.title)
        .sort()
    expect(titles(target)).toEqual(titles(source))
    expect(result.tasks).toBeGreaterThan(2)
    expect(target.categories.list().map((category) => category.name)).toEqual(['Work'])
    expect(target.settings.get().theme).toBe('dark')
    expect(target.activity.list({ actions: ['rescheduled'] })).toHaveLength(1)
    expect(existsSync(join(dir, 'safety.bak'))).toBe(true)
  })

  it('never exports secrets, and keeps this machine’s own on restore', () => {
    const file = service(source).export()
    expect(file.tables.settings.some((row) => String(row.key).startsWith('secret.'))).toBe(false)

    const target = testApp('2026-11-02')
    target.db.prepare(`INSERT INTO settings VALUES ('secret.openaiKey', '"mine"', 'now')`).run()
    service(target).restore(file, join(dir, 'safety.bak'))
    const key = target.db.prepare(`SELECT value FROM settings WHERE key = 'secret.openaiKey'`).get()
    expect(key).toEqual({ value: '"mine"' })
  })

  it.each([
    ['something else entirely', { hello: 'world' }, /isn't a Bunty backup/],
    ['a newer schema', { format: 'bunty-backup', schemaVersion: 99, tables: {} }, /newer version/],
    ['a missing table', { format: 'bunty-backup', schemaVersion: 1, tables: {} }, /missing/]
  ])('refuses %s before touching anything', (_name, data, message) => {
    const target = testApp('2026-11-02')
    target.tasks.create({ title: 'Keep me' })
    expect(() => service(target).restore(data, join(dir, 'x.bak'))).toThrowError(
      expect.objectContaining({ code: 'BACKUP_INVALID', message: expect.stringMatching(message) })
    )
    expect(target.tasks.list({}).map((task) => task.title)).toEqual(['Keep me'])
  })

  it('refuses columns it does not know', () => {
    const file = service(source).export()
    file.tables.tasks[0] = { ...file.tables.tasks[0], 'evil); DROP TABLE tasks; --': 1 }
    expect(() => service(testApp()).restore(file, join(dir, 'x.bak'))).toThrowError(
      expect.objectContaining({
        code: 'BACKUP_INVALID',
        message: expect.stringMatching(/unexpected/)
      })
    )
  })

  it('refuses settings that could not be read back', () => {
    const file = service(source).export()
    file.tables.settings.push({ key: 'theme', value: 'not json', updated_at: 'now' })
    expect(() => service(testApp()).validate(file)).toThrowError(
      expect.objectContaining({ code: 'BACKUP_INVALID' })
    )
  })

  it('changes nothing when the data does not fit together', () => {
    const file = service(source).export()
    file.tables.categories = []
    const target = testApp('2026-11-02')
    target.tasks.create({ title: 'Keep me' })
    expect(() => service(target).restore(file, join(dir, 'x.bak'))).toThrowError(
      expect.objectContaining({ code: 'BACKUP_INVALID' })
    )
    expect(target.tasks.list({}).map((task) => task.title)).toEqual(['Keep me'])
  })
})
