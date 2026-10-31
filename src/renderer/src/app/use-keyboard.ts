import { useEffect } from 'react'
import { addDays, toLocalDate } from '@shared/dates'
import type { CalendarMode } from '@shared/schemas'
import { useApp } from '@renderer/stores/app'
import { useUi } from '@renderer/stores/ui'
import { shiftAnchor } from '../features/calendar/calendar-math'
import { attempt, taskActions } from '../features/tasks/actions'
import { INSIGHTS, NAV, SETTINGS_NAV } from './nav'

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

/** A dialog or menu is open and owns the keyboard. */
function overlayOpen(): boolean {
  return document.querySelector('[role="dialog"], [role="menu"], [role="listbox"]') !== null
}

async function withSelected(
  run: (task: Awaited<ReturnType<typeof window.api.tasks.get>>) => unknown
) {
  const id = useUi.getState().selectedId
  if (!id) return
  const task = await attempt(() => window.api.tasks.get(id))
  if (task) await run(task)
}

/**
 * The calendar's own keys, in Google Calendar's spirit: arrows move the selected day, [ and ]
 * the period, T jumps to today, M/W/D switch views. Task keys still work on a clicked task.
 */
function calendarKey(key: string, noTaskSelected: boolean): boolean {
  const ui = useUi.getState()
  const { selected } = ui.calendar
  const mode = useApp.getState().settings.calendarMode
  const setMode = (next: CalendarMode): void =>
    void attempt(() => window.api.settings.update({ calendarMode: next }))

  switch (key) {
    case 'ArrowLeft':
      ui.selectDay(addDays(selected, -1))
      return true
    case 'ArrowRight':
      ui.selectDay(addDays(selected, 1))
      return true
    case 'ArrowUp':
      ui.selectDay(addDays(selected, -7))
      return true
    case 'ArrowDown':
      ui.selectDay(addDays(selected, 7))
      return true
    case '[':
      ui.selectDay(shiftAnchor(mode, selected, -1))
      return true
    case ']':
      ui.selectDay(shiftAnchor(mode, selected, 1))
      return true
    case 't':
      ui.selectDay(toLocalDate(new Date()))
      return true
    case 'm':
      setMode('month')
      return true
    case 'w':
      setMode('week')
      return true
    case 'd':
      setMode('day')
      return true
    case 'Enter':
      if (!noTaskSelected) return false
      setMode('day')
      return true
  }
  return false
}

/** Every single-key shortcut lives here; see ShortcutsDialog for the list users see. */
export function useKeyboard(): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const ui = useUi.getState()
      const mod = event.ctrlKey || event.metaKey
      const key = event.key

      if (mod && key.toLowerCase() === 'k') {
        event.preventDefault()
        ui.set({ paletteOpen: !ui.paletteOpen })
        return
      }
      if (event.defaultPrevented || isTyping(event.target) || overlayOpen()) return

      if (mod) {
        const nav = [...NAV, ...INSIGHTS, SETTINGS_NAV].find((entry) => entry.shortcut === key)
        if (nav) {
          event.preventDefault()
          ui.setView(nav.view)
        } else if (key.toLowerCase() === 'n') {
          event.preventDefault()
          ui.focusQuickAdd()
        } else if (key.toLowerCase() === 'f') {
          event.preventDefault()
          ui.set({ paletteOpen: true })
        }
        return
      }
      if (event.altKey) return

      if (ui.view.kind === 'calendar' && calendarKey(key, ui.selectedId === null)) {
        event.preventDefault()
        return
      }

      const move = (step: number): void => {
        const ids = ui.visibleIds
        if (!ids.length) return
        const index = ui.selectedId ? ids.indexOf(ui.selectedId) : -1
        const next =
          index === -1
            ? ids[step > 0 ? 0 : ids.length - 1]
            : ids[Math.min(ids.length - 1, Math.max(0, index + step))]
        if (ui.detailId) ui.openDetail(next)
        else ui.select(next)
      }

      const handled = ((): boolean => {
        switch (key) {
          case 'n':
            ui.focusQuickAdd()
            return true
          case '/':
            ui.set({ paletteOpen: true })
            return true
          case '?':
            ui.set({ shortcutsOpen: true })
            return true
          case 'ArrowDown':
          case 'j':
            move(1)
            return true
          case 'ArrowUp':
          case 'k':
            move(-1)
            return true
          case 'Home':
            move(-Infinity)
            return true
          case 'End':
            move(Infinity)
            return true
          case 'Escape':
            if (ui.detailId) ui.closeDetail()
            else ui.select(null)
            return true
        }
        if (!ui.selectedId) return false
        switch (key) {
          case 'Enter':
            ui.openDetail(ui.selectedId)
            return true
          case 'x':
          case ' ':
            void withSelected((task) => taskActions.toggle(task))
            return true
          case 'e':
          case 'F2':
            ui.set({ renamingId: ui.selectedId })
            return true
          case 'd':
            ui.set({ rescheduling: [ui.selectedId] })
            return true
          case '1':
          case '2':
          case '3': {
            const priority = (['high', 'medium', 'low'] as const)[Number(key) - 1]
            void withSelected((task) => taskActions.setPriority(task, priority))
            return true
          }
          case 'Delete':
          case 'Backspace': {
            // Keep the keyboard flowing: select the neighbour before the row disappears.
            const ids = ui.visibleIds
            const index = ids.indexOf(ui.selectedId)
            const neighbour = ids[index + 1] ?? ids[index - 1] ?? null
            void withSelected((task) => taskActions.remove(task))
            ui.set({
              selectedId: neighbour,
              detailId: ui.detailId === ui.selectedId ? null : ui.detailId
            })
            return true
          }
        }
        return false
      })()

      if (handled) event.preventDefault()
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
