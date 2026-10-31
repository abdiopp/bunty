import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/schemas'
import { testApp, type TestApp } from './helpers'

describe('settings', () => {
  let app: TestApp

  beforeEach(() => {
    app = testApp()
  })

  it('starts from the defaults', () => {
    expect(app.settings.get()).toEqual(DEFAULT_SETTINGS)
  })

  it('saves a change and keeps it', () => {
    expect(app.settings.update({ theme: 'dark' }).theme).toBe('dark')
    expect(app.settings.get().theme).toBe('dark')
  })

  it('falls back to the default when a stored value is unreadable', () => {
    app.db.prepare(`INSERT INTO settings VALUES ('theme', '"neon"', 'now')`).run()
    app.db.prepare(`INSERT INTO settings VALUES ('legacy', 'not json', 'now')`).run()
    expect(app.settings.get()).toEqual(DEFAULT_SETTINGS)
  })

  it('ignores stored keys that only look like settings', () => {
    for (const key of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      app.db.prepare(`INSERT INTO settings VALUES (?, '1', 'now')`).run(key)
    }
    expect(app.settings.get()).toEqual(DEFAULT_SETTINGS)
  })
})
