import { describe, expect, it } from 'vitest'
import { toCsv } from '@main/reports/export'
import type { ReportTask } from '@main/services/report-service'
import { testApp } from './helpers'

// 2 November 2026 is a Monday.
const MON = '2026-11-02'
const TUE = '2026-11-03'
const WED = '2026-11-04'

describe('reports', () => {
  it('sums up a week from the days that have ended, plus today', () => {
    const app = testApp(MON)
    const work = app.categories.create({ name: 'Work', color: '#5b6cf0' })
    const mon = app.tasks.create({ title: 'mon', date: MON, categoryId: work.id })
    app.tasks.create({ title: 'tue', date: TUE })
    const wed = app.tasks.create({ title: 'wed', date: WED, categoryId: work.id })
    const moved = app.tasks.create({ title: 'moved a lot', date: WED })
    app.tasks.reschedule({ id: moved.id, date: '2026-11-05' })
    app.tasks.reschedule({ id: moved.id, date: '2026-11-06' })

    app.rollover.run()
    app.tasks.complete(mon.id)
    app.setToday(TUE)
    app.rollover.run()
    app.setToday(WED)
    app.rollover.run()
    app.tasks.complete(wed.id)

    const report = app.reports.summary({ period: 'week', anchor: WED })

    expect(report).toMatchObject({ from: MON, to: '2026-11-08' })
    expect(report.totals).toMatchObject({
      due: 3,
      done: 2,
      missed: 1,
      completed: 2,
      rescheduled: 2
    })
    expect(report.totals.rate).toBeCloseTo(2 / 3)
    expect(report.days.map((day) => [day.date, day.done, day.missed])).toEqual([
      [MON, 1, 0],
      [TUE, 0, 1],
      [WED, 1, 0],
      ['2026-11-05', 0, 0],
      ['2026-11-06', 0, 0],
      ['2026-11-07', 0, 0],
      ['2026-11-08', 0, 0]
    ])
    // Completed on Monday and Wednesday; the week starts on Monday.
    expect(report.byWeekday.map((day) => day.completed)).toEqual([1, 0, 1, 0, 0, 0, 0])
    expect(report.byWeekday[0].weekday).toBe(1)
    expect(report.categories).toEqual([
      { id: work.id, name: 'Work', color: '#5b6cf0', due: 2, done: 2 },
      { id: null, name: 'No category', color: null, due: 1, done: 0 }
    ])
    expect(report.mostRescheduled).toEqual([{ taskId: moved.id, title: 'moved a lot', moves: 2 }])
  })

  it('covers the whole month and says nothing when nothing was due', () => {
    const app = testApp(MON)
    const report = app.reports.summary({ period: 'month', anchor: MON })
    expect(report).toMatchObject({ from: '2026-11-01', to: '2026-11-30' })
    expect(report.days).toHaveLength(30)
    expect(report.totals.rate).toBeNull()
  })

  it('exports every task in the period', () => {
    const app = testApp(MON)
    app.tasks.create({ title: 'in', date: TUE, time: '09:00' })
    app.tasks.create({ title: 'out', date: '2026-12-01' })
    expect(app.reports.tasks({ period: 'week', anchor: MON }).map((task) => task.title)).toEqual([
      'in'
    ])
  })
})

describe('CSV export', () => {
  const task = (title: string, notes = ''): ReportTask => ({
    title,
    date: '2026-11-02',
    time: null,
    status: 'done',
    priority: 'high',
    category: null,
    completed_at: null,
    original_date: '2026-11-02',
    reschedule_count: 0,
    notes
  })

  it('quotes commas, quotes and line breaks', () => {
    const csv = toCsv([task('Buy milk, eggs', 'Say "hi"\nthen go')])
    expect(csv.startsWith('﻿Title,Date,')).toBe(true)
    expect(csv).toContain(
      '"Buy milk, eggs",2026-11-02,,done,high,,,2026-11-02,0,"Say ""hi""\nthen go"'
    )
  })

  it('stops spreadsheet formulas from running', () => {
    const csv = toCsv([task('=HYPERLINK("http://evil")'), task('+1'), task('-2'), task('@SUM(A1)')])
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"")"`)
    expect(csv).toContain("'+1,")
    expect(csv).toContain("'-2,")
    expect(csv).toContain("'@SUM(A1),")
  })
})
