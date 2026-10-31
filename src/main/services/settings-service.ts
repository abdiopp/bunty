import type { Database } from 'better-sqlite3'
import { DEFAULT_SETTINGS, Settings, type SettingsPatch } from '@shared/schemas'
import type { Clock } from '../clock'

interface Deps {
  db: Database
  clock: Clock
  /** Runs before saving and can refuse by throwing, e.g. a hotkey another app already owns. */
  validate?: (next: Settings, previous: Settings) => void
  onChange?: (next: Settings, previous: Settings) => void
}

type Key = keyof Settings

export function createSettingsService({
  db,
  clock,
  validate = () => {},
  onChange = () => {}
}: Deps) {
  const upsert = db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `)

  function get(): Settings {
    const rows = db.prepare('SELECT key, value FROM settings').all() as {
      key: string
      value: string
    }[]
    const settings: Settings = { ...DEFAULT_SETTINGS }
    for (const { key, value } of rows) {
      // Other keys in the table (meta.*, secret.*) aren't settings.
      // Own keys only: `in` would also accept "constructor" from a damaged backup.
      if (!Object.hasOwn(Settings.shape, key)) continue
      // A stored value that no longer fits (say, from a newer version) falls back to the default.
      const parsed = Settings.shape[key as Key].safeParse(safeJson(value))
      if (parsed.success) Object.assign(settings, { [key]: parsed.data })
    }
    return settings
  }

  return {
    get,

    update(patch: SettingsPatch): Settings {
      const previous = get()
      const next: Settings = { ...previous, ...patch }
      validate(next, previous)
      const at = clock.now().toISOString()
      db.transaction(() => {
        for (const [key, value] of Object.entries(patch)) {
          upsert.run(key, JSON.stringify(value), at)
        }
      })()
      onChange(next, previous)
      return next
    }
  }
}

/** Small internal values that aren't user settings, such as the last day closed. */
export function createMetaStore(db: Database, clock: Clock) {
  const read = db.prepare('SELECT value FROM settings WHERE key = ?')
  const write = db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `)
  return {
    get<T>(key: string): T | undefined {
      const row = read.get(`meta.${key}`) as { value: string } | undefined
      return row ? (safeJson(row.value) as T) : undefined
    },
    set(key: string, value: unknown): void {
      write.run(`meta.${key}`, JSON.stringify(value), clock.now().toISOString())
    }
  }
}

export type MetaStore = ReturnType<typeof createMetaStore>

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

export type SettingsService = ReturnType<typeof createSettingsService>
