import { useEffect, useState } from 'react'
import type { Task } from '@shared/ipc'
import { queriesFor } from '@renderer/features/tasks/sections'
import type { View } from '@renderer/stores/ui'

/** The tasks a view shows, reloaded whenever anything changes in any window. */
export function useViewTasks(view: View, today: string): { tasks: Task[]; loaded: boolean } {
  const [state, setState] = useState<{ key: string; tasks: Task[] } | null>(null)
  const key = `${JSON.stringify(view)}@${today}`

  useEffect(() => {
    let current = true
    const load = async (): Promise<void> => {
      const results = await Promise.all(queriesFor(view, today).map(window.api.tasks.list))
      if (current) setState({ key, tasks: results.flat() })
    }
    void load()
    const stops = [
      window.api.on('tasks:changed', () => void load()),
      window.api.on('categories:changed', () => void load())
    ]
    return () => {
      current = false
      stops.forEach((stop) => stop())
    }
    // `key` captures everything `view` and `today` contribute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  // While a new view loads, show nothing rather than the previous view's tasks.
  return state?.key === key ? { tasks: state.tasks, loaded: true } : { tasks: [], loaded: false }
}
