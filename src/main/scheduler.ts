import { app, powerMonitor } from 'electron'
import { normalizeLocale } from '@shared/quick-add'
import type { Settings } from '@shared/schemas'
import type { Reminders } from './services/reminders'
import type { Rollover, RolloverResult } from './services/rollover'

interface Deps {
  rollover: Rollover
  reminders: Reminders
  settings: () => Settings
  notify: (title: string, body: string, onClick?: () => void) => void
  showTask: (id: string) => void
  showMain: () => void
  onRolledOver: (result: RolloverResult) => void
}

/** How often reminders and the date are checked; timers alone drift during sleep. */
const TICK_MS = 30_000

function timeText(time: string): string {
  const [hours, minutes] = time.split(':').map(Number)
  return new Intl.DateTimeFormat(normalizeLocale(app.getSystemLocale()), {
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(2026, 0, 1, hours, minutes))
}

/**
 * The clock-driven work: closing finished days, task reminders and the end-of-day summary.
 * It runs on launch, every half minute, at midnight, and when the PC wakes or unlocks.
 */
export function startScheduler(deps: Deps): () => void {
  // Each job fails on its own: a problem closing days mustn't silence reminders, and none of
  // them should take the app down. The next tick tries again.
  const attempt = (job: string, run: () => void): void => {
    try {
      run()
    } catch (err) {
      console.error(`Scheduler: ${job} failed:`, err)
    }
  }

  const tick = (): void => {
    attempt('rollover', () => {
      const result = deps.rollover.run()
      if (result.closed.length) deps.onRolledOver(result)
    })
    attempt('reminders', () => {
      const { reminderMinutes } = deps.settings()
      if (reminderMinutes === null) return
      for (const task of deps.reminders.due(reminderMinutes)) {
        deps.notify(task.title, `Due at ${timeText(task.time)}`, () => deps.showTask(task.id))
      }
    })
    attempt('daily summary', () => {
      const { dailySummaryTime } = deps.settings()
      if (!dailySummaryTime) return
      const open = deps.reminders.summary(dailySummaryTime)
      if (open) {
        deps.notify(
          open === 1 ? '1 task still pending today' : `${open} tasks still pending today`,
          'Finish them, or move them to tomorrow.',
          deps.showMain
        )
      }
    })
  }

  let midnight: ReturnType<typeof setTimeout> | undefined
  const scheduleMidnight = (): void => {
    const now = new Date()
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 2)
    midnight = setTimeout(() => {
      tick()
      scheduleMidnight()
    }, next.getTime() - now.getTime())
  }

  tick()
  scheduleMidnight()
  const interval = setInterval(tick, TICK_MS)
  powerMonitor.on('resume', tick)
  powerMonitor.on('unlock-screen', tick)

  return () => {
    clearInterval(interval)
    clearTimeout(midnight)
    powerMonitor.off('resume', tick)
    powerMonitor.off('unlock-screen', tick)
  }
}
