import { beforeEach, describe, expect, it } from 'vitest'
import { testApp, type TestApp } from './helpers'

const TODAY = '2026-11-02'
const TOMORROW = '2026-11-03'
const NEXT_WEEK = '2026-11-09'
const YESTERDAY = '2026-11-01'

describe('tasks', () => {
  let app: TestApp

  const actions = (taskId: string): string[] =>
    app.activity
      .list({ taskId })
      .map((entry) => entry.action)
      .reverse()

  beforeEach(() => {
    app = testApp(TODAY)
  })

  describe('create', () => {
    it('fills in defaults and logs the creation', () => {
      const task = app.tasks.create({ title: 'Call Ali', date: TODAY, time: '17:00' })

      expect(task).toMatchObject({
        title: 'Call Ali',
        date: TODAY,
        time: '17:00',
        notes: '',
        priority: 'medium',
        status: 'pending',
        categoryId: null,
        recurrence: { kind: 'none' },
        originalDate: TODAY,
        rescheduleCount: 0,
        completedAt: null
      })
      expect(actions(task.id)).toEqual(['created'])
    })

    it('allows a task with no date', () => {
      const task = app.tasks.create({ title: 'Someday' })
      expect(task.date).toBeNull()
      expect(task.originalDate).toBeNull()
    })

    it('rejects a past date, a time with no date and an unknown category', () => {
      expect(() => app.tasks.create({ title: 'x', date: YESTERDAY })).toThrowError(
        expect.objectContaining({ code: 'PAST_DATE' })
      )
      expect(() => app.tasks.create({ title: 'x', time: '09:00' })).toThrowError(
        expect.objectContaining({ code: 'DATE_REQUIRED' })
      )
      expect(() =>
        app.tasks.create({ title: 'x', categoryId: '00000000-0000-4000-8000-000000000000' })
      ).toThrowError(expect.objectContaining({ code: 'NOT_FOUND' }))
    })

    it('announces the change once, after it is saved', () => {
      const task = app.tasks.create({ title: 'x' })
      expect(app.changes).toEqual([[task.id]])
    })
  })

  describe('list', () => {
    it('sorts by date, then time, then priority, with unscheduled tasks last', () => {
      app.tasks.create({ title: 'no date' })
      app.tasks.create({ title: 'tomorrow', date: TOMORROW })
      app.tasks.create({ title: 'today, no time', date: TODAY })
      app.tasks.create({ title: 'today 9am', date: TODAY, time: '09:00' })
      app.tasks.create({ title: 'today 8am low', date: TODAY, time: '08:00', priority: 'low' })
      app.tasks.create({ title: 'today 8am high', date: TODAY, time: '08:00', priority: 'high' })

      expect(app.tasks.list({}).map((task) => task.title)).toEqual([
        'today 8am high',
        'today 8am low',
        'today 9am',
        'today, no time',
        'tomorrow',
        'no date'
      ])
    })

    it('filters by range, status and unscheduled', () => {
      const today = app.tasks.create({ title: 'a', date: TODAY })
      app.tasks.create({ title: 'b', date: NEXT_WEEK })
      const undated = app.tasks.create({ title: 'c' })
      app.tasks.complete(today.id)

      expect(app.tasks.list({ from: TODAY, to: TOMORROW }).map((t) => t.title)).toEqual(['a'])
      expect(app.tasks.list({ statuses: ['done'] }).map((t) => t.id)).toEqual([today.id])
      expect(app.tasks.list({ unscheduled: true }).map((t) => t.id)).toEqual([undated.id])
    })

    it('treats search wildcards as plain text', () => {
      app.tasks.create({ title: '100% done' })
      app.tasks.create({ title: 'nothing' })
      expect(app.tasks.list({ search: '%' }).map((t) => t.title)).toEqual(['100% done'])
      expect(app.tasks.list({ search: '_' })).toEqual([])
    })
  })

  describe('complete and reopen', () => {
    it('records when a task was completed', () => {
      const { id } = app.tasks.create({ title: 'x', date: TODAY })
      const done = app.tasks.complete(id)
      expect(done.status).toBe('done')
      expect(done.completedAt).not.toBeNull()
    })

    it('ignores a second completion, as when two windows tick the same task', () => {
      const { id } = app.tasks.create({ title: 'x', date: TODAY })
      app.tasks.complete(id)
      app.tasks.complete(id)
      expect(actions(id)).toEqual(['created', 'completed'])
    })

    it('goes back to pending, or rescheduled if it had been moved', () => {
      const plain = app.tasks.create({ title: 'a', date: TODAY })
      app.tasks.complete(plain.id)
      expect(app.tasks.reopen(plain.id).status).toBe('pending')

      const moved = app.tasks.create({ title: 'b', date: TODAY })
      app.tasks.reschedule({ id: moved.id, date: TOMORROW })
      app.tasks.complete(moved.id)
      const reopened = app.tasks.reopen(moved.id)
      expect(reopened.status).toBe('rescheduled')
      expect(reopened.completedAt).toBeNull()
    })

    it('becomes missed if its date has since passed', () => {
      const { id } = app.tasks.create({ title: 'x', date: TODAY })
      app.tasks.complete(id)
      app.setToday(TOMORROW)

      const reopened = app.tasks.reopen(id)
      expect(reopened.status).toBe('missed')
      expect(reopened.missedAt).not.toBeNull()
    })
  })

  describe('reschedule', () => {
    it('logs from and to, and keeps the original date', () => {
      const { id } = app.tasks.create({ title: 'x', date: TODAY })

      app.tasks.reschedule({ id, date: TOMORROW })
      const task = app.tasks.reschedule({ id, date: NEXT_WEEK })

      expect(task).toMatchObject({
        date: NEXT_WEEK,
        status: 'rescheduled',
        originalDate: TODAY,
        rescheduleCount: 2
      })
      const moves = app.activity.list({ taskId: id, actions: ['rescheduled'] }).reverse()
      expect(moves.map((m) => [m.fromDate, m.toDate])).toEqual([
        [TODAY, TOMORROW],
        [TOMORROW, NEXT_WEEK]
      ])
    })

    it('does not count giving an unscheduled task its first date', () => {
      const { id } = app.tasks.create({ title: 'x' })
      const task = app.tasks.reschedule({ id, date: TOMORROW })

      expect(task).toMatchObject({
        date: TOMORROW,
        status: 'pending',
        originalDate: TOMORROW,
        rescheduleCount: 0
      })
      expect(actions(id)).toEqual(['created', 'edited'])
    })

    it('treats a new time on the same day as an edit', () => {
      const { id } = app.tasks.create({ title: 'x', date: TODAY, time: '09:00' })
      const task = app.tasks.reschedule({ id, date: TODAY, time: '10:00' })

      expect(task).toMatchObject({ time: '10:00', status: 'pending', rescheduleCount: 0 })
      expect(actions(id)).toEqual(['created', 'edited'])
    })

    it('does nothing when nothing changes', () => {
      const { id } = app.tasks.create({ title: 'x', date: TODAY })
      app.tasks.reschedule({ id, date: TODAY })
      expect(actions(id)).toEqual(['created'])
    })

    it('rejects a past date and a finished task', () => {
      const { id } = app.tasks.create({ title: 'x', date: TODAY })
      expect(() => app.tasks.reschedule({ id, date: YESTERDAY })).toThrowError(
        expect.objectContaining({ code: 'PAST_DATE' })
      )
      app.tasks.complete(id)
      expect(() => app.tasks.reschedule({ id, date: TOMORROW })).toThrowError(
        expect.objectContaining({ code: 'TASK_CLOSED' })
      )
    })

    it('reopens a missed task but keeps the record that it was missed', () => {
      const { id } = app.tasks.create({ title: 'x', date: TODAY })
      app.tasks.complete(id)
      app.setToday(TOMORROW)
      const missed = app.tasks.reopen(id)

      const moved = app.tasks.reschedule({ id, date: TOMORROW })
      expect(moved.status).toBe('rescheduled')
      expect(moved.missedAt).toBe(missed.missedAt)
    })

    it('moves every overdue task, or only the chosen ones', () => {
      const late1 = app.tasks.create({ title: 'a', date: TODAY })
      const late2 = app.tasks.create({ title: 'b', date: TODAY })
      const finished = app.tasks.create({ title: 'c', date: TODAY })
      app.tasks.complete(finished.id)
      const future = app.tasks.create({ title: 'd', date: NEXT_WEEK })
      app.setToday(TOMORROW)

      const some = app.tasks.rescheduleOverdue({ date: TOMORROW, ids: [late1.id] })
      expect(some.map((task) => task.id)).toEqual([late1.id])
      expect(app.tasks.get(late2.id).date).toBe(TODAY)

      const rest = app.tasks.rescheduleOverdue({ date: TOMORROW })
      expect(rest.map((task) => task.id)).toEqual([late2.id])
      expect(app.tasks.get(finished.id).date).toBe(TODAY)
      expect(app.tasks.get(future.id).date).toBe(NEXT_WEEK)
    })
  })

  describe('update', () => {
    it('logs exactly what changed', () => {
      const { id } = app.tasks.create({ title: 'old', priority: 'low' })
      app.tasks.update({ id, patch: { title: 'new', priority: 'low' } })

      const [entry] = app.activity.list({ taskId: id, actions: ['edited'] })
      expect(entry.changes).toEqual({ title: ['old', 'new'] })
    })

    it('logs nothing when the values are unchanged', () => {
      const { id } = app.tasks.create({ title: 'same' })
      app.tasks.update({ id, patch: { title: 'same' } })
      expect(actions(id)).toEqual(['created'])
    })

    it('counts a date change as a reschedule, whichever screen it came from', () => {
      const { id } = app.tasks.create({ title: 'x', date: TODAY })
      const task = app.tasks.update({ id, patch: { date: TOMORROW, title: 'y' } })

      expect(task).toMatchObject({ date: TOMORROW, title: 'y', rescheduleCount: 1 })
      expect(actions(id)).toEqual(['created', 'rescheduled', 'edited'])
    })

    it('clears the time when the date is removed', () => {
      const { id } = app.tasks.create({ title: 'x', date: TODAY, time: '09:00' })
      const task = app.tasks.update({ id, patch: { date: null } })
      expect(task).toMatchObject({ date: null, time: null })
    })

    it('refuses a time on a task with no date', () => {
      const { id } = app.tasks.create({ title: 'x' })
      expect(() => app.tasks.update({ id, patch: { time: '09:00' } })).toThrowError(
        expect.objectContaining({ code: 'DATE_REQUIRED' })
      )
    })

    it('saves all of an edit or none of it', () => {
      // The title is written before the repeat setting fails, so this needs a real rollback.
      const { id } = app.tasks.create({ title: 'before' })
      const changesBefore = app.changes.length

      expect(() =>
        app.tasks.update({ id, patch: { title: 'after', recurrence: { kind: 'daily' } } })
      ).toThrowError(expect.objectContaining({ code: 'DATE_REQUIRED' }))

      expect(app.tasks.get(id).title).toBe('before')
      expect(actions(id)).toEqual(['created'])
      expect(app.changes).toHaveLength(changesBefore)
    })
  })

  describe('remove and restore', () => {
    it('hides a deleted task but keeps its history', () => {
      const { id } = app.tasks.create({ title: 'x', date: TODAY })
      app.tasks.remove({ id })

      expect(app.tasks.list({})).toEqual([])
      expect(() => app.tasks.get(id)).toThrowError(expect.objectContaining({ code: 'NOT_FOUND' }))
      expect(actions(id)).toEqual(['created', 'deleted'])
    })

    it('brings a task back', () => {
      const { id } = app.tasks.create({ title: 'x', date: TODAY })
      app.tasks.remove({ id })
      expect(app.tasks.restore(id).status).toBe('pending')
      expect(actions(id)).toEqual(['created', 'deleted', 'restored'])
    })

    it('marks a restored task missed if its day has passed', () => {
      const { id } = app.tasks.create({ title: 'x', date: TODAY })
      app.tasks.remove({ id })
      app.setToday(TOMORROW)
      expect(app.tasks.restore(id).status).toBe('missed')
    })
  })
})

describe('counts and the logbook', () => {
  it('counts what the sidebar shows', () => {
    const app = testApp('2026-11-02')
    app.tasks.create({ title: 'today 1', date: '2026-11-02' })
    const done = app.tasks.create({ title: 'today 2', date: '2026-11-02' })
    app.tasks.complete(done.id)
    app.tasks.create({ title: 'late', date: '2026-11-02' })
    app.tasks.create({ title: 'inbox' })
    app.tasks.create({ title: 'later', date: '2026-11-20' })
    const deleted = app.tasks.create({ title: 'gone' })
    app.tasks.remove({ id: deleted.id })

    app.setToday('2026-11-02')
    expect(app.tasks.counts()).toEqual({ today: 2, doneToday: 1, overdue: 0, inbox: 1 })

    app.setToday('2026-11-03')
    expect(app.tasks.counts()).toEqual({ today: 0, doneToday: 0, overdue: 2, inbox: 1 })
  })

  it('counts on an empty database', () => {
    expect(testApp().tasks.counts()).toEqual({ today: 0, doneToday: 0, overdue: 0, inbox: 0 })
  })

  it('lists finished tasks newest first, up to a limit', () => {
    const app = testApp('2026-11-02')
    const ids = ['a', 'b', 'c'].map((title) => app.tasks.create({ title }).id)
    for (const id of ids) app.tasks.complete(id)
    // Same clock, so make the order unambiguous.
    app.db.prepare(`UPDATE tasks SET completed_at = '2026-11-02T0' || rowid || ':00:00Z'`).run()

    const logbook = app.tasks.list({ statuses: ['done'], orderBy: 'completed', limit: 2 })
    expect(logbook.map((task) => task.title)).toEqual(['c', 'b'])
  })
})
