import type { Database } from 'better-sqlite3'
import { safeStorage } from 'electron'
import type { Clock } from './clock'
import { AppError } from './errors'

/**
 * Secrets such as the OpenAI key, encrypted with the OS keystore (DPAPI on Windows, Keychain on
 * macOS) before they touch the database. They're never sent to a page and never exported.
 */
export function createSecrets(db: Database, clock: Clock) {
  const read = db.prepare('SELECT value FROM settings WHERE key = ?')
  const write = db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `)
  const remove = db.prepare('DELETE FROM settings WHERE key = ?')

  return {
    get(name: string): string | null {
      const row = read.get(`secret.${name}`) as { value: string } | undefined
      if (!row || !safeStorage.isEncryptionAvailable()) return null
      try {
        return safeStorage.decryptString(Buffer.from(JSON.parse(row.value) as string, 'base64'))
      } catch {
        // Encrypted by another user account or machine: as good as not set.
        return null
      }
    },

    set(name: string, value: string | null): void {
      if (value === null) {
        remove.run(`secret.${name}`)
        return
      }
      if (!safeStorage.isEncryptionAvailable()) {
        throw new AppError(
          'SECURE_STORAGE',
          "This computer can't store the key securely, so it wasn't saved."
        )
      }
      const sealed = safeStorage.encryptString(value).toString('base64')
      write.run(`secret.${name}`, JSON.stringify(sealed), clock.now().toISOString())
    }
  }
}

export type Secrets = ReturnType<typeof createSecrets>
