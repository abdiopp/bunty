import { addDays, weekdayOf } from '@shared/dates'
import type { Recurrence } from '@shared/schemas'

export type Repeating = Exclude<Recurrence, { kind: 'none' }>

const EVERY_DAY = 0b1111111

export function weekdayMask(recurrence: Repeating, anchor: string): number {
  switch (recurrence.kind) {
    case 'daily':
      return EVERY_DAY
    case 'weekly':
      return 1 << weekdayOf(anchor)
    case 'custom':
      return recurrence.weekdays.reduce((mask, day) => mask | (1 << day), 0)
  }
}

export function maskToWeekdays(mask: number): number[] {
  return [0, 1, 2, 3, 4, 5, 6].filter((day) => mask & (1 << day))
}

export function matches(mask: number, date: string): boolean {
  return (mask & (1 << weekdayOf(date))) !== 0
}

/** The first date on or after `from` that the mask includes. */
export function firstOccurrence(mask: number, from: string): string {
  let date = from
  while (!matches(mask, date)) date = addDays(date, 1)
  return date
}

/** Every matching date from `from` to `to`, inclusive. */
export function occurrencesBetween(mask: number, from: string, to: string): string[] {
  const dates: string[] = []
  for (let date = from; date <= to; date = addDays(date, 1)) {
    if (matches(mask, date)) dates.push(date)
  }
  return dates
}
