import { randomUUID } from 'crypto'
import type { Database } from 'better-sqlite3'
import type { Category } from '@shared/ipc'
import type { NewCategory, UpdateCategory } from '@shared/schemas'
import type { Clock } from '../clock'
import { AppError } from '../errors'

interface CategoryRow {
  id: string
  name: string
  color: string
  created_at: string
}

interface Deps {
  db: Database
  clock: Clock
  onChange?: () => void
}

function toCategory(row: CategoryRow): Category {
  return { id: row.id, name: row.name, color: row.color, createdAt: row.created_at }
}

function rethrowDuplicate(err: unknown, name: string | undefined): never {
  if ((err as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') {
    throw new AppError('NAME_TAKEN', `There's already a category called "${name}".`)
  }
  throw err
}

export function createCategoryService({ db, clock, onChange = () => {} }: Deps) {
  function find(id: string): CategoryRow {
    const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as
      CategoryRow | undefined
    if (!row) throw new AppError('NOT_FOUND', 'That category no longer exists.')
    return row
  }

  return {
    list(): Category[] {
      const rows = db
        .prepare('SELECT * FROM categories ORDER BY name COLLATE NOCASE')
        .all() as CategoryRow[]
      return rows.map(toCategory)
    },

    create({ name, color }: NewCategory): Category {
      const id = randomUUID()
      try {
        db.prepare('INSERT INTO categories (id, name, color, created_at) VALUES (?, ?, ?, ?)').run(
          id,
          name,
          color,
          clock.now().toISOString()
        )
      } catch (err) {
        rethrowDuplicate(err, name)
      }
      onChange()
      return toCategory(find(id))
    },

    update({ id, patch }: UpdateCategory): Category {
      const current = find(id)
      try {
        db.prepare('UPDATE categories SET name = ?, color = ? WHERE id = ?').run(
          patch.name ?? current.name,
          patch.color ?? current.color,
          id
        )
      } catch (err) {
        rethrowDuplicate(err, patch.name)
      }
      onChange()
      return toCategory(find(id))
    },

    /** Tasks in the category are kept and become uncategorised. */
    remove(id: string): void {
      find(id)
      db.prepare('DELETE FROM categories WHERE id = ?').run(id)
      onChange()
    }
  }
}

export type CategoryService = ReturnType<typeof createCategoryService>
