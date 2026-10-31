import { useCallback, useMemo, useState } from 'react'
import type { Task } from '@shared/ipc'
import { parseQuickAdd, type QuickAdd, type TokenKind } from '@shared/quick-add'
import { findCategory, nextCategoryColor } from '@renderer/lib/categories'
import { useApp } from '@renderer/stores/app'
import { attempt } from '../tasks/actions'

/** What the surrounding view implies when the text doesn't say: Today view means today. */
export interface QuickAddDefaults {
  date?: string | null
  categoryId?: string | null
}

export type QuickAddProblem = 'empty' | 'past' | null

export interface QuickAddDraft {
  text: string
  parsed: QuickAdd
  date: string | null
  /** True when the date comes from the view rather than the text. */
  dateIsDefault: boolean
  categoryId: string | null
  categoryIsDefault: boolean
  /** A #tag that matches no category yet; it's created on save. */
  newCategory: string | null
  problem: QuickAddProblem
}

export function useQuickAdd(defaults: QuickAddDefaults, today: string) {
  const info = useApp((state) => state.info)
  const categories = useApp((state) => state.categories)
  const [text, setText] = useState('')
  const [ignore, setIgnore] = useState<ReadonlySet<TokenKind>>(new Set())
  const [dropped, setDropped] = useState<{ date: boolean; category: boolean }>({
    date: false,
    category: false
  })

  const draft = useMemo<QuickAddDraft>(() => {
    const parsed = parseQuickAdd(text, { now: new Date(), dayFirst: info?.dayFirst, ignore })
    const fallbackDate = dropped.date ? null : (defaults.date ?? null)
    const date = parsed.date ?? fallbackDate
    const match = parsed.category ? findCategory(categories, parsed.category) : undefined
    const fallbackCategory = dropped.category ? null : (defaults.categoryId ?? null)
    const categoryId = match?.id ?? (parsed.category ? null : fallbackCategory)
    return {
      text,
      parsed,
      date,
      dateIsDefault: parsed.date === null && date !== null,
      categoryId,
      categoryIsDefault: !parsed.category && categoryId !== null,
      newCategory: parsed.category && !match ? parsed.category : null,
      problem: !parsed.title ? 'empty' : date && date < today ? 'past' : null
    }
    // `today` changing re-runs this; `new Date()` inside is for relative words like "tonight".
  }, [text, ignore, dropped, defaults.date, defaults.categoryId, categories, info?.dayFirst, today])

  const reset = useCallback((): void => {
    setText('')
    setIgnore(new Set())
    setDropped({ date: false, category: false })
  }, [])

  return {
    draft,
    setText,
    /** Removes a recognised part; its words go back into the title. */
    dismiss(kind: TokenKind | 'defaultDate' | 'defaultCategory'): void {
      if (kind === 'defaultDate') setDropped((value) => ({ ...value, date: true }))
      else if (kind === 'defaultCategory') setDropped((value) => ({ ...value, category: true }))
      else setIgnore((current) => new Set(current).add(kind))
    },
    reset,
    async submit(): Promise<Task | undefined> {
      if (draft.problem) return undefined
      let categoryId = draft.categoryId
      if (draft.newCategory) {
        const created = await attempt(() =>
          window.api.categories.create({
            name: draft.newCategory!,
            color: nextCategoryColor(categories)
          })
        )
        if (!created) return undefined
        categoryId = created.id
      }
      const { parsed } = draft
      const task = await attempt(() =>
        window.api.tasks.create({
          title: parsed.title,
          date: draft.date,
          time: parsed.time,
          priority: parsed.priority ?? undefined,
          categoryId,
          recurrence: parsed.recurrence ?? undefined
        })
      )
      if (task) reset()
      return task
    }
  }
}

export type QuickAddController = ReturnType<typeof useQuickAdd>
