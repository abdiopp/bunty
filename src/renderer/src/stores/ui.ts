import { create } from 'zustand'
import { toLocalDate } from '@shared/dates'

export type View =
  | { kind: 'today' }
  | { kind: 'upcoming' }
  | { kind: 'calendar' }
  | { kind: 'inbox' }
  | { kind: 'logbook' }
  | { kind: 'category'; id: string }
  | { kind: 'streaks' }
  | { kind: 'reports' }
  | { kind: 'settings' }

export function sameView(a: View, b: View): boolean {
  return a.kind === b.kind && (a.kind !== 'category' || a.id === (b as typeof a).id)
}

interface UiState {
  view: View
  /** The highlighted row, moved with the arrow keys. */
  selectedId: string | null
  /** The task shown in the side panel. */
  detailId: string | null
  /** The row whose title is being renamed in place. */
  renamingId: string | null
  /** Rows in on-screen order, so the keyboard can move through them. */
  visibleIds: string[]
  paletteOpen: boolean
  shortcutsOpen: boolean
  /** Tasks the date dialog will move. */
  rescheduling: string[] | null
  categoryDialog: { id?: string } | null
  /** Bumped to ask the quick-add bar to take focus. */
  quickAddFocus: number
  /** The calendar's place: the period shown is the one containing `anchor`. */
  calendar: { anchor: string; selected: string }
  /**
   * Just-ticked tasks and the state they had, so lists keep them in place for a moment rather
   * than moving them out from under the cursor (or the keyboard selection).
   */
  held: ReadonlyMap<string, 'open' | 'done'>

  setView: (view: View) => void
  select: (id: string | null) => void
  openDetail: (id: string) => void
  closeDetail: () => void
  setVisible: (ids: string[]) => void
  /** Moves to a view with a quick-add bar if needed, then focuses it. */
  focusQuickAdd: () => void
  hold: (id: string, was: 'open' | 'done') => void
  /** Selects a day; the period shown follows it. */
  selectDay: (date: string) => void
  setAnchor: (anchor: string) => void
  set: (patch: Partial<UiState>) => void
}

/** How long a just-ticked task stays put before moving to its new section. */
const HOLD_MS = 700
const holdTimers = new Map<string, ReturnType<typeof setTimeout>>()

export const useUi = create<UiState>((set) => ({
  view: { kind: 'today' },
  selectedId: null,
  detailId: null,
  renamingId: null,
  visibleIds: [],
  paletteOpen: false,
  shortcutsOpen: false,
  rescheduling: null,
  categoryDialog: null,
  quickAddFocus: 0,
  held: new Map(),
  calendar: { anchor: toLocalDate(new Date()), selected: toLocalDate(new Date()) },

  setView: (view) =>
    set({ view, selectedId: null, detailId: null, renamingId: null, visibleIds: [] }),
  select: (id) => set({ selectedId: id }),
  openDetail: (id) => set({ detailId: id, selectedId: id }),
  closeDetail: () => set({ detailId: null }),
  setVisible: (ids) => set({ visibleIds: ids }),
  focusQuickAdd: () =>
    set((state) => {
      const today = toLocalDate(new Date())
      return {
        ...(state.view.kind === 'settings' || state.view.kind === 'logbook'
          ? { view: { kind: 'today' as const }, selectedId: null, detailId: null }
          : {}),
        // The calendar's add box is for the selected day, and past days can't take new tasks.
        ...(state.view.kind === 'calendar' && state.calendar.selected < today
          ? { calendar: { anchor: today, selected: today } }
          : {}),
        quickAddFocus: state.quickAddFocus + 1
      }
    }),
  selectDay: (date) => set({ calendar: { anchor: date, selected: date } }),
  setAnchor: (anchor) => set((state) => ({ calendar: { ...state.calendar, anchor } })),
  hold: (id, was) => {
    clearTimeout(holdTimers.get(id))
    set((state) => ({ held: new Map(state.held).set(id, was) }))
    holdTimers.set(
      id,
      setTimeout(() => {
        holdTimers.delete(id)
        set((state) => {
          const held = new Map(state.held)
          held.delete(id)
          return { held }
        })
      }, HOLD_MS)
    )
  },
  set: (patch) => set(patch)
}))
