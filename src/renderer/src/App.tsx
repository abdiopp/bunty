import { useEffect } from 'react'
import { Search } from 'lucide-react'
import { Toaster } from '@renderer/components/ui/sonner'
import { TooltipProvider } from '@renderer/components/ui/tooltip'
import { useToday } from '@renderer/hooks/use-today'
import { cn } from '@renderer/lib/utils'
import { useApp } from '@renderer/stores/app'
import { useUi } from '@renderer/stores/ui'
import { CommandPalette } from './app/CommandPalette'
import { SettingsView } from './app/SettingsView'
import { ShortcutsDialog } from './app/ShortcutsDialog'
import { Sidebar } from './app/Sidebar'
import { TaskView } from './app/TaskView'
import { useKeyboard } from './app/use-keyboard'
import { CalendarView } from './features/calendar/CalendarView'
import { ReportsView } from './features/reports/ReportsView'
import { StreaksView } from './features/streaks/StreaksView'
import { CategoryDialog } from './features/categories/CategoryDialog'
import { RescheduleDialog } from './features/tasks/RescheduleDialog'
import { TaskDetail } from './features/tasks/TaskDetail'

export default function App(): React.JSX.Element {
  const view = useUi((state) => state.view)
  const detailId = useUi((state) => state.detailId)
  const platform = useApp((state) => state.info?.platform)
  const today = useToday()

  useEffect(() => useApp.getState().start(), [])
  // Clicking a task in the widget or a reminder brings it up here.
  useEffect(
    () =>
      window.api.on('app:showTask', (id) => {
        const ui = useUi.getState()
        if (['settings', 'streaks', 'reports'].includes(ui.view.kind)) ui.setView({ kind: 'today' })
        ui.openDetail(id)
      }),
    []
  )
  useKeyboard()

  return (
    <TooltipProvider delayDuration={500}>
      <div className={cn('flex h-full', platform && `platform-${platform}`)}>
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          {/* The window's title bar: draggable, and clear of Windows' own buttons. */}
          <div className="drag clear-window-controls flex h-11 shrink-0 items-center justify-end px-3">
            <button
              onClick={() => useUi.getState().set({ paletteOpen: true })}
              aria-label="Search"
              className="no-drag text-muted-foreground hover:bg-accent hover:text-foreground grid size-7 place-items-center rounded-md"
            >
              <Search className="size-4" />
            </button>
          </div>
          <div className="flex min-h-0 flex-1">
            <main className="min-w-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
              {view.kind === 'settings' ? (
                <SettingsView />
              ) : view.kind === 'calendar' ? (
                <CalendarView today={today} />
              ) : view.kind === 'streaks' ? (
                <StreaksView today={today} />
              ) : view.kind === 'reports' ? (
                <ReportsView today={today} />
              ) : (
                <TaskView key={JSON.stringify(view)} view={view} today={today} />
              )}
            </main>
            {detailId && !['settings', 'streaks', 'reports'].includes(view.kind) && (
              <TaskDetail key={detailId} id={detailId} />
            )}
          </div>
        </div>
      </div>
      <CommandPalette />
      <ShortcutsDialog />
      <RescheduleDialog />
      <CategoryDialog />
      <Toaster position="bottom-center" />
    </TooltipProvider>
  )
}
