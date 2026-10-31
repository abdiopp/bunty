import { beforeEach, describe, expect, it } from 'vitest'
import { testApp, type TestApp } from './helpers'

// 2 November 2026 is a Monday.
const MON = '2026-11-02'
const TUE = '2026-11-03'
const WED = '2026-11-04'
const THU = '2026-11-05'
const FRI = '2026-11-06'

describe('closing finished days', () => {
  let app: TestApp

  const ledger = () =>
    app.db.prepare('SELECT * FROM day_ledger ORDER BY date').all() as {
      date: string
      due_count: number
      done_count: number
      missed_count: number
    }[]

  beforeEach(() => {
    app = testApp(MON)
  })

  it('marks open tasks missed and records how the day went', () => {
    const done = app.tasks.create({ title: 'done', date: MON })
    const open = app.tasks.create({ title: 'open', date: MON })
    app.tasks.complete(done.id)
    app.rollover.run()

    app.setToday(TUE)
    const result = app.rollover.run()

    expect(result).toEqual({ closed: [MON], missed: [open.id] })
    expect(app.tasks.get(open.id)).toMatchObject({ status: 'missed' })
    expect(app.tasks.get(open.id).missedAt).not.toBeNull()
    expect(app.tasks.get(done.id).status).toBe('done')
    expect(app.activity.list({ taskId: open.id }).map((entry) => entry.action)).toContain('missed')
    expect(ledger()).toEqual([
      expect.objectContaining({ date: MON, due_count: 2, done_count: 1, missed_count: 1 })
    ])
  })

  it('does nothing the second time', () => {
    app.tasks.create({ title: 'x', date: MON })
    app.setToday(TUE)
    app.rollover.run()
    expect(app.rollover.run()).toEqual({ closed: [], missed: [] })
    expect(app.activity.list({ actions: ['missed'] })).toHaveLength(1)
  })

  it('catches up on every day the PC was off, including empty ones', () => {
    app.tasks.create({ title: 'mon', date: MON })
    app.tasks.create({ title: 'wed', date: WED })
    app.rollover.run()

    app.setToday(FRI)
    expect(app.rollover.run().closed).toEqual([MON, TUE, WED, THU])
    expect(ledger().map((row) => [row.date, row.due_count, row.missed_count])).toEqual([
      [MON, 1, 1],
      [TUE, 0, 0],
      [WED, 1, 1],
      [THU, 0, 0]
    ])
  })

  it('judges a day by what was due when it ended, not by where tasks were before', () => {
    const moved = app.tasks.create({ title: 'moved', date: MON })
    app.tasks.reschedule({ id: moved.id, date: WED })
    // Launched on Monday, then again on Tuesday.
    app.rollover.run()
    app.setToday(TUE)
    app.rollover.run()

    expect(app.tasks.get(moved.id).status).toBe('rescheduled')
    expect(ledger()[0]).toMatchObject({ date: MON, due_count: 0 })
  })

  it('judges each occurrence of a repeating task', () => {
    app.tasks.create({ title: 'Gym', date: MON, recurrence: { kind: 'daily' } })
    app.setToday(WED)
    expect(app.rollover.run().missed).toHaveLength(2)
  })

  it('starts over, rather than failing every tick, when its bookmark is damaged', () => {
    app.tasks.create({ title: 'mon', date: MON })
    app.db.prepare(`INSERT INTO settings VALUES ('meta.lastClosedDate', '42', 'now')`).run()
    app.setToday(TUE)
    expect(app.rollover.run().closed).toEqual([MON])
  })
})

describe('streaks', () => {
  let app: TestApp

  /** Finishes everything due today, or leaves it, then moves to the next day. */
  const live = (date: string, finish: boolean): void => {
    app.setToday(date)
    app.rollover.run()
    if (finish) {
      for (const task of app.tasks.list({ from: date, to: date })) app.tasks.complete(task.id)
    }
  }

  beforeEach(() => {
    app = testApp(MON)
  })

  it('counts days in a row where everything due was done', () => {
    for (const date of [MON, TUE, WED]) app.tasks.create({ title: date, date })
    live(MON, true)
    live(TUE, true)
    live(WED, true)
    live(THU, false)

    expect(app.streaks.summary()).toMatchObject({ current: 3, longest: 3 })
  })

  it('counts today once it is all done, and does not break while it is in progress', () => {
    app.tasks.create({ title: 'mon', date: MON })
    app.tasks.create({ title: 'tue', date: TUE })
    live(MON, true)
    live(TUE, false)
    expect(app.streaks.summary()).toMatchObject({ current: 1, today: { due: 1, done: 0 } })

    const [tuesday] = app.tasks.list({ from: TUE, to: TUE })
    app.tasks.complete(tuesday.id)
    expect(app.streaks.summary()).toMatchObject({ current: 2, longest: 2 })
  })

  it('skips days with nothing due', () => {
    app.tasks.create({ title: 'mon', date: MON })
    app.tasks.create({ title: 'thu', date: THU })
    live(MON, true)
    live(TUE, false)
    live(WED, false)
    live(THU, true)
    expect(app.streaks.summary().current).toBe(2)
  })

  it('breaks on a missed day, and moving the missed task later does not repair it', () => {
    app.tasks.create({ title: 'mon', date: MON })
    const late = app.tasks.create({ title: 'tue', date: TUE })
    app.tasks.create({ title: 'wed', date: WED })
    live(MON, true)
    live(TUE, false)
    live(WED, true)

    expect(app.streaks.summary()).toMatchObject({ current: 1, longest: 1 })
    app.tasks.reschedule({ id: late.id, date: WED })
    app.tasks.complete(late.id)
    expect(app.streaks.summary()).toMatchObject({ current: 1, longest: 1 })
  })

  it('tracks each repeating task, counting only occurrences done on time', () => {
    const gym = app.tasks.create({ title: 'Gym', date: MON, recurrence: { kind: 'daily' } })
    live(MON, true)
    live(TUE, false)
    live(WED, true)
    // Tuesday's missed occurrence finished late still counts as missed.
    const [tuesday] = app.tasks.list({ from: TUE, to: TUE })
    app.tasks.complete(tuesday.id)
    live(THU, true)
    live(FRI, false)

    const [series] = app.streaks.summary().series
    expect(series).toMatchObject({
      seriesId: gym.seriesId,
      title: 'Gym',
      current: 2,
      longest: 2,
      recent: ['done', 'missed', 'done', 'done', 'pending']
    })
  })

  it('maps the year for the heatmap, ending with today', () => {
    app.tasks.create({ title: 'mon', date: MON })
    app.tasks.create({ title: 'tue', date: TUE })
    live(MON, true)
    live(TUE, false)

    expect(app.streaks.heatmap()).toEqual([
      { date: MON, due: 1, done: 1 },
      { date: TUE, due: 1, done: 0 }
    ])
  })
})

describe('reminders', () => {
  let app: TestApp

  beforeEach(() => {
    app = testApp(MON)
  })

  it('reminds once, the set number of minutes before', () => {
    const call = app.tasks.create({ title: 'Call Ali', date: MON, time: '17:00' })
    app.setTime(16, 49)
    expect(app.reminders.due(10)).toEqual([])
    app.setTime(16, 50)
    expect(app.reminders.due(10)).toEqual([{ id: call.id, title: 'Call Ali', time: '17:00' }])
    expect(app.reminders.due(10)).toEqual([])
  })

  it('reminds again after the task is moved to a new time', () => {
    const call = app.tasks.create({ title: 'Call', date: MON, time: '09:00' })
    app.setTime(9, 0)
    expect(app.reminders.due(0)).toHaveLength(1)

    app.tasks.update({ id: call.id, patch: { time: '15:00' } })
    app.setTime(15, 0)
    expect(app.reminders.due(0)).toHaveLength(1)
  })

  it('skips finished tasks and ones long past, without announcing them later', () => {
    const done = app.tasks.create({ title: 'done', date: MON, time: '09:00' })
    app.tasks.complete(done.id)
    app.tasks.create({ title: 'stale', date: MON, time: '08:00' })
    app.setTime(11, 0)
    expect(app.reminders.due(10)).toEqual([])
    expect(app.reminders.due(10)).toEqual([])
  })

  it('sums up today once, after the summary time', () => {
    app.tasks.create({ title: 'a', date: MON })
    app.tasks.create({ title: 'b', date: MON })
    app.setTime(20, 59)
    expect(app.reminders.summary('21:00')).toBeNull()
    app.setTime(21, 0)
    expect(app.reminders.summary('21:00')).toBe(2)
    expect(app.reminders.summary('21:00')).toBeNull()
  })
})
