import { describe, expect, it } from 'vitest'
import {
  addDays,
  daysBetween,
  isLocalDate,
  isLocalTime,
  nextMonday,
  toLocalDate,
  weekdayOf
} from '@shared/dates'

describe('local dates', () => {
  it('uses the local calendar day, not the UTC one', () => {
    expect(toLocalDate(new Date(2026, 10, 1, 0, 30))).toBe('2026-11-01')
    expect(toLocalDate(new Date(2026, 10, 1, 23, 30))).toBe('2026-11-01')
  })

  it('adds days across month, year and leap-day boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('walks one day at a time through daylight-saving changes', () => {
    // Covers the US, EU and southern-hemisphere transition dates.
    let date = '2026-01-01'
    for (let i = 0; i < 364; i++) date = addDays(date, 1)
    expect(date).toBe('2026-12-31')
  })

  it('knows the weekday of a date', () => {
    expect(weekdayOf('2026-11-01')).toBe(0)
    expect(weekdayOf('2026-11-02')).toBe(1)
  })

  it('accepts only real dates and times', () => {
    expect(isLocalDate('2026-02-28')).toBe(true)
    expect(isLocalDate('2026-02-30')).toBe(false)
    expect(isLocalDate('2026-13-01')).toBe(false)
    expect(isLocalDate('26-1-1')).toBe(false)
    expect(isLocalTime('23:59')).toBe(true)
    expect(isLocalTime('24:00')).toBe(false)
    expect(isLocalTime('9:00')).toBe(false)
  })

  it('counts days across a daylight-saving change', () => {
    expect(daysBetween('2026-03-01', '2026-04-01')).toBe(31)
    expect(daysBetween('2026-11-02', '2026-11-01')).toBe(-1)
  })

  it('finds next Monday from every day of the week', () => {
    // 2026-11-02 is a Monday.
    expect(nextMonday('2026-11-02')).toBe('2026-11-09')
    expect(nextMonday('2026-11-04')).toBe('2026-11-09')
    expect(nextMonday('2026-11-08')).toBe('2026-11-09')
  })
})
