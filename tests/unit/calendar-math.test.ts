import { describe, expect, it } from 'vitest'
import {
  addMonths,
  dropTime,
  layoutTimed,
  monthWeeks,
  shiftAnchor,
  startOfWeek,
  visibleRange,
  weekDays
} from '@renderer/features/calendar/calendar-math'

// 1 November 2026 is a Sunday.
describe('calendar dates', () => {
  it('finds the start of the week for either first day', () => {
    expect(startOfWeek('2026-11-01', 'monday')).toBe('2026-10-26')
    expect(startOfWeek('2026-11-02', 'monday')).toBe('2026-11-02')
    expect(startOfWeek('2026-11-01', 'sunday')).toBe('2026-11-01')
    expect(startOfWeek('2026-11-07', 'sunday')).toBe('2026-11-01')
  })

  it('clamps the day when adding months', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29')
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28')
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15')
  })

  it('builds whole weeks covering the month', () => {
    const monday = monthWeeks('2026-11-17', 'monday')
    expect(monday).toHaveLength(6)
    expect(monday[0][0]).toBe('2026-10-26')
    expect(monday.at(-1)!.at(-1)).toBe('2026-12-06')

    const sunday = monthWeeks('2026-11-17', 'sunday')
    expect(sunday).toHaveLength(5)
    expect(sunday[0][0]).toBe('2026-11-01')
    expect(sunday.every((week) => week.length === 7)).toBe(true)
  })

  it('gives each mode its range and its step', () => {
    expect(visibleRange('day', '2026-11-04', 'monday')).toEqual({
      from: '2026-11-04',
      to: '2026-11-04'
    })
    expect(visibleRange('week', '2026-11-04', 'monday')).toEqual({
      from: '2026-11-02',
      to: '2026-11-08'
    })
    expect(visibleRange('month', '2026-11-04', 'monday')).toEqual({
      from: '2026-10-26',
      to: '2026-12-06'
    })
    expect(weekDays('2026-11-04', 'sunday')[0]).toBe('2026-11-01')

    expect(shiftAnchor('day', '2026-11-30', 1)).toBe('2026-12-01')
    expect(shiftAnchor('week', '2026-11-04', -1)).toBe('2026-10-28')
    expect(shiftAnchor('month', '2026-10-31', 1)).toBe('2026-11-30')
  })
})

describe('time grid', () => {
  it('snaps a drop to the nearest quarter hour, inside the day', () => {
    // 48px per hour.
    expect(dropTime(0, 48)).toBe('00:00')
    expect(dropTime(48 * 9 + 10, 48)).toBe('09:15')
    expect(dropTime(48 * 9 + 5, 48)).toBe('09:00')
    expect(dropTime(-40, 48)).toBe('00:00')
    expect(dropTime(48 * 30, 48)).toBe('23:45')
  })

  it('puts overlapping tasks side by side and leaves the rest full width', () => {
    const at = (id: string, time: string) => ({ id, time })
    const placed = layoutTimed([
      at('a', '09:00'),
      at('b', '09:15'),
      at('c', '09:30'),
      at('d', '10:00'),
      at('e', '14:00'),
      { id: 'untimed', time: null }
    ])
    const lanes = Object.fromEntries(placed.map((p) => [p.item.id, [p.column, p.columns]]))

    // b overlaps a and c; c fits back in a's lane once a has ended.
    expect(lanes).toEqual({
      a: [0, 2],
      b: [1, 2],
      c: [0, 2],
      d: [0, 1],
      e: [0, 1]
    })
  })

  it('stacks three tasks at the same time into three lanes', () => {
    const placed = layoutTimed(['x', 'y', 'z'].map((id) => ({ id, time: '08:00' })))
    expect(placed.map((p) => [p.column, p.columns])).toEqual([
      [0, 3],
      [1, 3],
      [2, 3]
    ])
  })
})
