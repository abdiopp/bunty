import { beforeEach, describe, expect, it } from 'vitest'
import { testApp, type TestApp } from './helpers'

const MONDAY = '2026-11-02'
const TUESDAY = '2026-11-03'
const WEDNESDAY = '2026-11-04'
const THURSDAY = '2026-11-05'
const NEXT_MONDAY = '2026-11-09'

describe('recurring tasks', () => {
  let app: TestApp

  const occurrences = (seriesId: string | null, to = NEXT_MONDAY) =>
    app.tasks.list({ to }).filter((task) => task.seriesId === seriesId)

  const dates = (seriesId: string | null, to = NEXT_MONDAY): (string | null)[] =>
    occurrences(seriesId, to).map((task) => task.date)

  beforeEach(() => {
    app = testApp(MONDAY)
  })

  it('creates one real task per day for a daily series', () => {
    const first = app.tasks.create({ title: 'Gym', date: MONDAY, recurrence: { kind: 'daily' } })

    expect(first.recurrence).toEqual({ kind: 'daily' })
    expect(first.occurrenceDate).toBe(MONDAY)
    expect(dates(first.seriesId, THURSDAY)).toEqual([MONDAY, TUESDAY, WEDNESDAY, THURSDAY])
  })

  it('repeats weekly on the weekday of the start date', () => {
    const first = app.tasks.create({ title: 'x', date: TUESDAY, recurrence: { kind: 'weekly' } })
    expect(dates(first.seriesId, '2026-11-17')).toEqual([TUESDAY, '2026-11-10', '2026-11-17'])
  })

  it('moves the start to the first matching day for custom days', () => {
    const first = app.tasks.create({
      title: 'x',
      date: MONDAY,
      recurrence: { kind: 'custom', weekdays: [3, 5] }
    })
    expect(first.date).toBe(WEDNESDAY)
    expect(first.recurrence).toEqual({ kind: 'custom', weekdays: [3, 5] })
    expect(dates(first.seriesId)).toEqual([WEDNESDAY, '2026-11-06'])
  })

  it('starts today when no date is given', () => {
    const first = app.tasks.create({ title: 'x', recurrence: { kind: 'daily' } })
    expect(first.date).toBe(MONDAY)
  })

  it('logs only the first occurrence as created', () => {
    app.tasks.create({ title: 'x', date: MONDAY, recurrence: { kind: 'daily' } })
    app.tasks.list({ to: NEXT_MONDAY })
    expect(app.activity.list({ actions: ['created'] })).toHaveLength(1)
  })

  it('generates further ahead when the calendar asks, up to a year out', () => {
    const first = app.tasks.create({ title: 'x', date: MONDAY, recurrence: { kind: 'weekly' } })

    const farOut = dates(first.seriesId, '2026-12-28')
    expect(farOut.at(-1)).toBe('2026-12-28')

    const capped = app.tasks.list({ to: '2030-01-01' })
    expect(capped.at(-1)!.date! <= '2027-11-02').toBe(true)
  })

  it('never generates the same slot twice', () => {
    const first = app.tasks.create({ title: 'x', date: MONDAY, recurrence: { kind: 'daily' } })
    app.tasks.list({ to: NEXT_MONDAY })
    app.tasks.list({ to: NEXT_MONDAY })
    app.tasks.ensureOccurrences()
    expect(new Set(dates(first.seriesId)).size).toBe(dates(first.seriesId).length)
  })

  it('catches up on the days the PC was off', () => {
    const first = app.tasks.create({ title: 'x', date: MONDAY, recurrence: { kind: 'daily' } })
    app.setToday('2027-03-01')
    app.tasks.ensureOccurrences()

    const all = app.tasks.list({ from: '2026-12-01', to: '2027-03-01' })
    expect(all.filter((task) => task.seriesId === first.seriesId)).toHaveLength(91)
  })

  it('does not bring back a deleted occurrence', () => {
    const first = app.tasks.create({ title: 'x', date: MONDAY, recurrence: { kind: 'daily' } })
    const tuesday = occurrences(first.seriesId).find((task) => task.date === TUESDAY)!

    app.tasks.remove({ id: tuesday.id })
    app.tasks.ensureOccurrences()
    app.tasks.list({ to: NEXT_MONDAY })

    expect(dates(first.seriesId, WEDNESDAY)).toEqual([MONDAY, WEDNESDAY])
  })

  it('moves one occurrence without leaving a gap or a duplicate', () => {
    const first = app.tasks.create({ title: 'x', date: MONDAY, recurrence: { kind: 'daily' } })
    const moved = app.tasks.reschedule({ id: first.id, date: WEDNESDAY })

    expect(moved.occurrenceDate).toBe(MONDAY)
    expect(dates(first.seriesId, WEDNESDAY)).toEqual([TUESDAY, WEDNESDAY, WEDNESDAY])
    app.tasks.ensureOccurrences()
    expect(dates(first.seriesId, WEDNESDAY)).toHaveLength(3)
  })

  describe('editing', () => {
    it('changes only the one occurrence by default', () => {
      const first = app.tasks.create({ title: 'Gym', date: MONDAY, recurrence: { kind: 'daily' } })
      app.tasks.update({ id: first.id, patch: { title: 'Run' } })

      const titles = occurrences(first.seriesId, TUESDAY).map((task) => task.title)
      expect(titles).toEqual(['Run', 'Gym'])
    })

    it('changes this and later occurrences, leaving earlier and finished ones', () => {
      const first = app.tasks.create({ title: 'Gym', date: MONDAY, recurrence: { kind: 'daily' } })
      const list = occurrences(first.seriesId, THURSDAY)
      const [, tue, wed] = list
      app.tasks.complete(wed.id)

      app.tasks.update({ id: tue.id, patch: { title: 'Run', time: '07:00' }, scope: 'following' })

      expect(occurrences(first.seriesId, THURSDAY).map((task) => task.title)).toEqual([
        'Gym',
        'Run',
        'Gym',
        'Run'
      ])
    })

    it('uses the new details for occurrences generated later', () => {
      const first = app.tasks.create({ title: 'Gym', date: MONDAY, recurrence: { kind: 'daily' } })
      app.tasks.update({ id: first.id, patch: { title: 'Run' }, scope: 'following' })

      const later = occurrences(first.seriesId, '2026-12-20').at(-1)!
      expect(later).toMatchObject({ date: '2026-12-20', title: 'Run' })
    })

    it('refuses a series-wide edit on a one-off task, and a series-wide move', () => {
      const single = app.tasks.create({ title: 'x' })
      expect(() =>
        app.tasks.update({ id: single.id, patch: { title: 'y' }, scope: 'following' })
      ).toThrowError(expect.objectContaining({ code: 'NOT_RECURRING' }))

      const first = app.tasks.create({ title: 'x', date: MONDAY, recurrence: { kind: 'daily' } })
      expect(() =>
        app.tasks.update({ id: first.id, patch: { date: TUESDAY }, scope: 'following' })
      ).toThrowError(expect.objectContaining({ code: 'VALIDATION' }))
    })

    it('does not let an occurrence lose its date', () => {
      const first = app.tasks.create({ title: 'x', date: MONDAY, recurrence: { kind: 'daily' } })
      expect(() => app.tasks.update({ id: first.id, patch: { date: null } })).toThrowError(
        expect.objectContaining({ code: 'DATE_REQUIRED' })
      )
    })
  })

  describe('changing the repeat setting', () => {
    it('turns a one-off task into a series', () => {
      const task = app.tasks.create({ title: 'x', date: MONDAY })
      const updated = app.tasks.update({
        id: task.id,
        patch: { recurrence: { kind: 'daily' } }
      })

      expect(updated.recurrence).toEqual({ kind: 'daily' })
      expect(dates(updated.seriesId, WEDNESDAY)).toEqual([MONDAY, TUESDAY, WEDNESDAY])
    })

    it('needs a date to repeat', () => {
      const task = app.tasks.create({ title: 'x' })
      expect(() =>
        app.tasks.update({ id: task.id, patch: { recurrence: { kind: 'daily' } } })
      ).toThrowError(expect.objectContaining({ code: 'DATE_REQUIRED' }))
    })

    it('stops repeating after this occurrence', () => {
      const first = app.tasks.create({ title: 'x', date: MONDAY, recurrence: { kind: 'daily' } })
      const [, tue] = occurrences(first.seriesId)

      const updated = app.tasks.update({ id: tue.id, patch: { recurrence: { kind: 'none' } } })

      expect(updated.recurrence).toEqual({ kind: 'none' })
      expect(dates(first.seriesId)).toEqual([MONDAY, TUESDAY])
      app.tasks.ensureOccurrences()
      expect(dates(first.seriesId, '2026-12-31')).toEqual([MONDAY, TUESDAY])
    })

    it('switches pattern, keeping occurrences the user already acted on', () => {
      const first = app.tasks.create({ title: 'x', date: MONDAY, recurrence: { kind: 'daily' } })
      const [mon, , wed] = occurrences(first.seriesId)
      app.tasks.complete(wed.id)

      app.tasks.update({
        id: mon.id,
        patch: { recurrence: { kind: 'custom', weekdays: [1, 2] } }
      })

      // Tuesday still matches and regenerates; Wednesday stays because it was completed.
      expect(dates(first.seriesId, NEXT_MONDAY)).toEqual([MONDAY, TUESDAY, WEDNESDAY, NEXT_MONDAY])
    })

    it('does not duplicate a finished occurrence the new pattern also covers', () => {
      const first = app.tasks.create({ title: 'x', date: MONDAY, recurrence: { kind: 'daily' } })
      const [mon, tue] = occurrences(first.seriesId)
      app.tasks.complete(tue.id)

      app.tasks.update({
        id: mon.id,
        patch: { recurrence: { kind: 'custom', weekdays: [1, 2] } }
      })

      expect(dates(first.seriesId, TUESDAY)).toEqual([MONDAY, TUESDAY])
      expect(app.tasks.get(tue.id).status).toBe('done')
    })

    it('accepts an unchanged repeat setting on a finished occurrence', () => {
      const first = app.tasks.create({ title: 'x', date: MONDAY, recurrence: { kind: 'daily' } })
      app.tasks.complete(first.id)

      const updated = app.tasks.update({
        id: first.id,
        patch: { title: 'y', recurrence: { kind: 'daily' } }
      })
      expect(updated.title).toBe('y')
    })

    it('does not log a change when a series is already stopped', () => {
      const first = app.tasks.create({ title: 'x', date: MONDAY, recurrence: { kind: 'daily' } })
      app.tasks.update({ id: first.id, patch: { recurrence: { kind: 'none' } } })
      app.tasks.update({ id: first.id, patch: { recurrence: { kind: 'none' } } })
      expect(app.activity.list({ taskId: first.id, actions: ['edited'] })).toHaveLength(1)
    })
  })

  describe('deleting', () => {
    it('removes one occurrence by default', () => {
      const first = app.tasks.create({ title: 'x', date: MONDAY, recurrence: { kind: 'daily' } })
      app.tasks.remove({ id: first.id })
      expect(dates(first.seriesId, TUESDAY)).toEqual([TUESDAY])
    })

    it('ends the series from this occurrence on, keeping finished ones', () => {
      const first = app.tasks.create({ title: 'x', date: MONDAY, recurrence: { kind: 'daily' } })
      const [, , wed, thu] = occurrences(first.seriesId)
      app.tasks.complete(thu.id)

      app.tasks.remove({ id: wed.id, scope: 'following' })

      expect(dates(first.seriesId)).toEqual([MONDAY, TUESDAY, THURSDAY])
      app.tasks.ensureOccurrences()
      expect(dates(first.seriesId, '2026-12-31')).toEqual([MONDAY, TUESDAY, THURSDAY])
    })
  })
})
