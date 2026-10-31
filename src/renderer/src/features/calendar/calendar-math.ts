// Date arithmetic and time-grid layout for the calendar. Pure, so it's unit-tested.
import { addDays, addMonths, startOfMonth, startOfWeek } from '@shared/dates'
import type { CalendarMode, WeekStart } from '@shared/schemas'

// Shared with the main process (report periods); re-exported for the calendar's own use.
export { addMonths, startOfMonth, startOfWeek }

/** The weeks a month grid shows: whole weeks covering the month, five or six rows. */
export function monthWeeks(anchor: string, weekStart: WeekStart): string[][] {
  const end = startOfMonth(addMonths(startOfMonth(anchor), 1))
  const weeks: string[][] = []
  for (
    let start = startOfWeek(startOfMonth(anchor), weekStart);
    start < end;
    start = addDays(start, 7)
  ) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(start, i)))
  }
  return weeks
}

export function weekDays(anchor: string, weekStart: WeekStart): string[] {
  const start = startOfWeek(anchor, weekStart)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

/** First and last day on screen, which is what gets loaded. */
export function visibleRange(
  mode: CalendarMode,
  anchor: string,
  weekStart: WeekStart
): { from: string; to: string } {
  if (mode === 'day') return { from: anchor, to: anchor }
  const days = mode === 'week' ? weekDays(anchor, weekStart) : monthWeeks(anchor, weekStart).flat()
  return { from: days[0], to: days[days.length - 1] }
}

/** The next or previous month, week or day. */
export function shiftAnchor(mode: CalendarMode, anchor: string, step: number): string {
  if (mode === 'month') return addMonths(anchor, step)
  return addDays(anchor, step * (mode === 'week' ? 7 : 1))
}

// --- Time grid -------------------------------------------------------------------------------

/** Tasks have a time but no duration, so each takes up this much of the grid. */
export const BLOCK_MINUTES = 30
export const SNAP_MINUTES = 15
const LAST_SLOT = 24 * 60 - SNAP_MINUTES

export function minutesOf(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

export function timeOf(minutes: number): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`
}

/** Where a drop lands: offset in pixels from the top of the day column, to a snapped time. */
export function dropTime(offsetPx: number, hourHeight: number): string {
  const raw = (offsetPx / hourHeight) * 60
  const snapped = Math.round(raw / SNAP_MINUTES) * SNAP_MINUTES
  return timeOf(Math.min(LAST_SLOT, Math.max(0, snapped)))
}

export interface Placed<T> {
  item: T
  start: number
  /** Which side-by-side lane it sits in, and how many lanes its group needs. */
  column: number
  columns: number
}

/**
 * Lays out timed tasks so overlapping ones sit side by side, like any calendar. Tasks that
 * overlap each other, directly or through a chain, share a set of lanes.
 */
export function layoutTimed<T extends { id: string; time: string | null }>(
  items: T[]
): Placed<T>[] {
  const sorted = items
    .filter((item): item is T & { time: string } => item.time !== null)
    .map((item) => ({ item, start: minutesOf(item.time) }))
    .sort((a, b) => a.start - b.start || a.item.id.localeCompare(b.item.id))

  const placed: Placed<T>[] = []
  let group: Placed<T>[] = []
  let laneEnds: number[] = []
  let groupEnd = -1

  const closeGroup = (): void => {
    for (const entry of group) entry.columns = laneEnds.length
    placed.push(...group)
    group = []
    laneEnds = []
  }

  for (const { item, start } of sorted) {
    if (start >= groupEnd) closeGroup()
    let lane = laneEnds.findIndex((end) => end <= start)
    if (lane === -1) lane = laneEnds.push(0) - 1
    laneEnds[lane] = start + BLOCK_MINUTES
    groupEnd = Math.max(groupEnd, start + BLOCK_MINUTES)
    group.push({ item, start, column: lane, columns: 0 })
  }
  closeGroup()
  return placed
}
