import { useEffect, useState } from 'react'
import type { Task } from '@shared/ipc'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { useToday } from '@renderer/hooks/use-today'
import { useUi } from '@renderer/stores/ui'
import { attempt, taskActions } from './actions'
import { DateChoices } from './DateChoices'
import { DATE_KEYS, quickDate } from './date-keys'

/** Opened with D, "Pick date…", or for all overdue tasks at once. */
export function RescheduleDialog(): React.JSX.Element {
  const ids = useUi((state) => state.rescheduling)
  const today = useToday()
  const [loaded, setLoaded] = useState<Task | null>(null)
  const single = ids?.length === 1
  const task = single && loaded?.id === ids[0] ? loaded : null

  useEffect(() => {
    if (!ids || ids.length !== 1) return
    let current = true
    void attempt(() => window.api.tasks.get(ids[0])).then((found) => {
      if (current && found) setLoaded(found)
    })
    return () => {
      current = false
    }
  }, [ids])

  const close = (): void => useUi.getState().set({ rescheduling: null })

  const pick = (date: string | null): void => {
    if (!ids) return
    close()
    if (single && task) void taskActions.schedule(task, date)
    else if (date) void attempt(() => window.api.tasks.rescheduleOverdue({ date, ids }))
  }

  const canClear = single && task !== null && task.seriesId === null

  return (
    <Dialog open={ids !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent
        className="w-[300px] gap-3 p-3"
        showCloseButton={false}
        onKeyDown={(event) => {
          const key = DATE_KEYS[event.key.toLowerCase() as keyof typeof DATE_KEYS]
          if (!key || event.ctrlKey || event.metaKey || event.altKey) return
          if (key === 'none' && !canClear) return
          event.preventDefault()
          pick(quickDate(key, today))
        }}
      >
        <DialogHeader className="px-1">
          <DialogTitle className="text-sm">
            {single ? (task ? `Move “${task.title}”` : 'Move task') : `Move ${ids?.length} tasks`}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Pick a new date. T is today, M tomorrow, W next week.
          </DialogDescription>
        </DialogHeader>
        <DateChoices
          value={single ? (task?.date ?? null) : null}
          today={today}
          allowNone={canClear}
          onPick={pick}
        />
      </DialogContent>
    </Dialog>
  )
}
