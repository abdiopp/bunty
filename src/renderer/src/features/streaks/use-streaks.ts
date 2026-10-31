import { useEffect, useState } from 'react'
import type { HeatmapDay, StreakSummary } from '@shared/ipc'

/** Reloads whenever tasks change or a new day begins, in any window. */
function useLive<T>(load: () => Promise<T>): T | null {
  const [value, setValue] = useState<T | null>(null)
  useEffect(() => {
    let current = true
    const refresh = (): void =>
      void load()
        .then((next) => current && setValue(next))
        .catch((err) => console.error('Streaks failed to load:', JSON.stringify(err)))
    refresh()
    const stops = [
      window.api.on('tasks:changed', refresh),
      window.api.on('day:rolledOver', refresh)
    ]
    return () => {
      current = false
      stops.forEach((stop) => stop())
    }
    // `load` is a stable module-level function at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return value
}

const loadSummary = (): Promise<StreakSummary> => window.api.streaks.summary()
const loadHeatmap = (): Promise<HeatmapDay[]> => window.api.streaks.heatmap()

export const useStreakSummary = (): StreakSummary | null => useLive(loadSummary)
export const useHeatmap = (): HeatmapDay[] | null => useLive(loadHeatmap)
