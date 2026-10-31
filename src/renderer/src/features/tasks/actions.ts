// Every task change in the UI goes through here, so failures always surface the same way.
import { toast } from 'sonner'
import type { ApiFailure, Task } from '@shared/ipc'
import type { Priority, SeriesScope } from '@shared/schemas'
import { useUi } from '@renderer/stores/ui'

/** Runs a call and shows its error, if any, as a toast. */
export async function attempt<T>(call: () => Promise<T>): Promise<T | undefined> {
  try {
    return await call()
  } catch (err) {
    toast.error((err as ApiFailure).message ?? 'Something went wrong.')
    return undefined
  }
}

const api = (): typeof window.api.tasks => window.api.tasks

export const taskActions = {
  /** Ticks or unticks, holding the row in place briefly however it was triggered. */
  toggle: (task: Task) => {
    useUi.getState().hold(task.id, task.status === 'done' ? 'done' : 'open')
    return attempt(() => (task.status === 'done' ? api().reopen(task.id) : api().complete(task.id)))
  },

  /** A date moves the task; null takes it off the calendar. */
  schedule: (task: Task, date: string | null) =>
    attempt(() =>
      date === null
        ? api().update({ id: task.id, patch: { date: null } })
        : api().reschedule({ id: task.id, date })
    ),

  rename: (task: Task, title: string, scope?: SeriesScope) => {
    const trimmed = title.trim()
    if (!trimmed || trimmed === task.title) return Promise.resolve(undefined)
    return attempt(() => api().update({ id: task.id, patch: { title: trimmed }, scope }))
  },

  setPriority: (task: Task, priority: Priority, scope?: SeriesScope) =>
    attempt(() => api().update({ id: task.id, patch: { priority }, scope })),

  setCategory: (task: Task, categoryId: string | null, scope?: SeriesScope) =>
    attempt(() => api().update({ id: task.id, patch: { categoryId }, scope })),

  async remove(task: Task, scope: SeriesScope = 'this'): Promise<void> {
    const removed = await attempt(() => api().remove({ id: task.id, scope }))
    if (removed === undefined && scope === 'this') {
      // Undo brings back exactly one task, so it's only offered for a single delete.
      toast(`Deleted “${task.title}”`, {
        action: { label: 'Undo', onClick: () => void attempt(() => api().restore(task.id)) }
      })
    } else if (scope === 'following') {
      toast(`Stopped repeating “${task.title}”`)
    }
  }
}
