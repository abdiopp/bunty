import { create } from 'zustand'
import type { AppInfo, Category, TaskCounts } from '@shared/ipc'
import { DEFAULT_SETTINGS, type Settings } from '@shared/schemas'
import { setFormatLocale } from '@renderer/lib/format'

interface AppState {
  info: AppInfo | null
  settings: Settings
  categories: Category[]
  counts: TaskCounts
  /** Loads everything and keeps it current. Returns the unsubscribe function. */
  start: () => () => void
}

const NO_COUNTS: TaskCounts = { today: 0, doneToday: 0, overdue: 0, inbox: 0 }

export const useApp = create<AppState>((set) => {
  const loadCounts = async (): Promise<void> => set({ counts: await window.api.tasks.counts() })
  const loadCategories = async (): Promise<void> =>
    set({ categories: await window.api.categories.list() })

  return {
    info: null,
    settings: DEFAULT_SETTINGS,
    categories: [],
    counts: NO_COUNTS,

    start: () => {
      // Each piece loads on its own, so one failing leaves the rest of the app working.
      const report = (what: string) => (err: unknown) =>
        console.error(`Couldn't load ${what}:`, JSON.stringify(err))
      window.api.app
        .info()
        .then((info) => {
          setFormatLocale(info.locale)
          set({ info })
        })
        .catch(report('app info'))
      window.api.settings
        .get()
        .then((settings) => set({ settings }))
        .catch(report('settings'))
      loadCounts().catch(report('counts'))
      loadCategories().catch(report('categories'))

      const stops = [
        window.api.on('tasks:changed', () => void loadCounts().catch(report('counts'))),
        window.api.on(
          'categories:changed',
          () => void loadCategories().catch(report('categories'))
        ),
        window.api.on('settings:changed', (settings) => set({ settings }))
      ]
      // The day can turn over while the app is open.
      const onFocus = (): void => void loadCounts().catch(report('counts'))
      window.addEventListener('focus', onFocus)
      return () => {
        stops.forEach((stop) => stop())
        window.removeEventListener('focus', onFocus)
      }
    }
  }
})
