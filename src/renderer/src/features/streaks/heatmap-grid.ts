import { addDays } from '@shared/dates'
import type { HeatmapDay } from '@shared/ipc'
import type { WeekStart } from '@shared/schemas'
import { startOfWeek } from '../calendar/calendar-math'

export const WEEKS = 53

export interface HeatCell {
  date: string
  due: number
  done: number
  /** 0 nothing due, 1–4 share done, -1 tasks due and none done. */
  level: number
  future: boolean
}

export function level(due: number, done: number): number {
  if (due === 0) return 0
  if (done === 0) return -1
  const share = done / due
  if (share >= 1) return 4
  if (share >= 0.75) return 3
  if (share >= 0.5) return 2
  return 1
}

/** 53 week-columns ending with this week, days running down each column from the week start. */
export function heatmapGrid(days: HeatmapDay[], today: string, weekStart: WeekStart): HeatCell[][] {
  const byDate = new Map(days.map((day) => [day.date, day]))
  const first = addDays(startOfWeek(today, weekStart), -7 * (WEEKS - 1))
  return Array.from({ length: WEEKS }, (_, week) =>
    Array.from({ length: 7 }, (_, offset) => {
      const date = addDays(first, week * 7 + offset)
      const day = byDate.get(date)
      const due = day?.due ?? 0
      const done = day?.done ?? 0
      return { date, due, done, level: level(due, done), future: date > today }
    })
  )
}
