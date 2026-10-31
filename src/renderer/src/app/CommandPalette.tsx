import { useEffect, useState } from 'react'
import { CalendarCheck, Keyboard, Monitor, Moon, Plus, Sun } from 'lucide-react'
import type { Task } from '@shared/ipc'
import type { Theme } from '@shared/schemas'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut
} from '@renderer/components/ui/command'
import { useToday } from '@renderer/hooks/use-today'
import { dayLabel } from '@renderer/lib/format'
import { useApp } from '@renderer/stores/app'
import { useUi, type View } from '@renderer/stores/ui'
import { attempt } from '../features/tasks/actions'
import { INSIGHTS, modKey, NAV, SETTINGS_NAV } from './nav'

/** Ctrl+K: find any task, jump anywhere, or run an action, without the mouse. */
export function CommandPalette(): React.JSX.Element {
  const open = useUi((state) => state.paletteOpen)
  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => useUi.getState().set({ paletteOpen: next })}
      title="Search"
      description="Find a task, go to a list, or run a command."
    >
      {/* Mounted only while open, so every visit starts with an empty search. */}
      {open && <PaletteBody />}
    </CommandDialog>
  )
}

function PaletteBody(): React.JSX.Element {
  const categories = useApp((state) => state.categories)
  const counts = useApp((state) => state.counts)
  const platform = useApp((state) => state.info?.platform)
  const today = useToday()
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<{ query: string; tasks: Task[] }>({ query: '', tasks: [] })
  const search = query.trim()
  // Results for an older query aren't shown, so clearing the box clears them too.
  const results = search && found.query === search ? found.tasks : []

  useEffect(() => {
    if (!search) return
    let current = true
    const timer = setTimeout(async () => {
      const tasks = await attempt(() => window.api.tasks.list({ search, limit: 20 }))
      if (current) setFound({ query: search, tasks: tasks ?? [] })
    }, 80)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [search])

  const close = (): void => useUi.getState().set({ paletteOpen: false })
  const run = (action: () => void) => () => {
    close()
    action()
  }
  const go = (view: View) => run(() => useUi.getState().setView(view))
  const theme = (value: Theme) =>
    run(() => void attempt(() => window.api.settings.update({ theme: value })))
  const mod = modKey(platform)

  return (
    <Command>
      <CommandInput
        placeholder="Search tasks, lists and commands…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>Nothing matches “{query}”.</CommandEmpty>

        {results.length > 0 && (
          <CommandGroup heading="Tasks">
            {results.map((task) => (
              <CommandItem
                key={task.id}
                value={`task:${task.id} ${task.title}`}
                onSelect={run(() => useUi.getState().openDetail(task.id))}
              >
                <span
                  className={task.status === 'done' ? 'text-muted-foreground line-through' : ''}
                >
                  {task.title}
                </span>
                <CommandShortcut>
                  {task.date ? dayLabel(task.date, today) : 'No date'}
                </CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandGroup heading="Go to">
          {[...NAV, ...INSIGHTS, SETTINGS_NAV].map((entry) => (
            <CommandItem key={entry.label} onSelect={go(entry.view)}>
              {entry.icon}
              {entry.label}
              <CommandShortcut>
                {mod} {entry.shortcut}
              </CommandShortcut>
            </CommandItem>
          ))}
          {categories.map((category) => (
            <CommandItem
              key={category.id}
              value={`category ${category.name}`}
              onSelect={go({ kind: 'category', id: category.id })}
            >
              <span className="m-1 size-2 rounded-full" style={{ background: category.color }} />
              {category.name}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem onSelect={run(() => useUi.getState().focusQuickAdd())}>
            <Plus />
            New task
            <CommandShortcut>N</CommandShortcut>
          </CommandItem>
          {counts.overdue > 0 && (
            <CommandItem
              onSelect={run(
                () => void attempt(() => window.api.tasks.rescheduleOverdue({ date: today }))
              )}
            >
              <CalendarCheck />
              Move {counts.overdue} overdue {counts.overdue === 1 ? 'task' : 'tasks'} to today
            </CommandItem>
          )}
          <CommandItem onSelect={theme('light')}>
            <Sun />
            Light theme
          </CommandItem>
          <CommandItem onSelect={theme('dark')}>
            <Moon />
            Dark theme
          </CommandItem>
          <CommandItem onSelect={theme('system')}>
            <Monitor />
            Match system theme
          </CommandItem>
          <CommandItem onSelect={run(() => useUi.getState().set({ shortcutsOpen: true }))}>
            <Keyboard />
            Keyboard shortcuts
            <CommandShortcut>?</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  )
}
