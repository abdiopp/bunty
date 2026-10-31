import { describe, expect, it } from 'vitest'
import type { Task } from '@shared/ipc'
import { buildSections, queriesFor } from '@renderer/features/tasks/sections'

const TODAY = '2026-11-02'

let next = 0
function task(patch: Partial<Task>): Task {
  next += 1
  return {
    id: `t${next}`,
    title: `Task ${next}`,
    notes: '',
    date: null,
    time: null,
    priority: 'medium',
    categoryId: null,
    status: 'pending',
    recurrence: { kind: 'none' },
    seriesId: null,
    occurrenceDate: null,
    originalDate: null,
    rescheduleCount: 0,
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
    completedAt: null,
    missedAt: null,
    ...patch
  }
}

const shape = (sections: ReturnType<typeof buildSections>) =>
  sections.map((section) => [section.id, section.tasks.map((t) => t.title)])

describe('view sections', () => {
  it('splits Today into overdue, due and completed, leaving empty ones out', () => {
    const tasks = [
      task({ title: 'late', date: '2026-11-01', status: 'missed' }),
      task({ title: 'due', date: TODAY }),
      task({ title: 'done', date: TODAY, status: 'done', completedAt: 'x' })
    ]
    expect(shape(buildSections({ kind: 'today' }, tasks, TODAY))).toEqual([
      ['overdue', ['late']],
      ['today', ['due']],
      ['done', ['done']]
    ])
    expect(shape(buildSections({ kind: 'today' }, [tasks[1]], TODAY))).toEqual([['today', ['due']]])
  })

  it('keeps a just-ticked task where it was until the hold ends', () => {
    const ticked = task({ title: 'ticked', date: TODAY, status: 'done', completedAt: 'x' })
    const held = new Map([[ticked.id, 'open' as const]])
    expect(shape(buildSections({ kind: 'today' }, [ticked], TODAY, held))).toEqual([
      ['today', ['ticked']]
    ])
  })

  it('groups Upcoming by day in date order', () => {
    const tasks = [
      task({ title: 'a', date: '2026-11-03' }),
      task({ title: 'b', date: '2026-11-03' }),
      task({ title: 'c', date: '2026-11-05' })
    ]
    expect(shape(buildSections({ kind: 'upcoming' }, tasks, TODAY))).toEqual([
      ['day:2026-11-03', ['a', 'b']],
      ['day:2026-11-05', ['c']]
    ])
  })

  it('shows only the next occurrence of a repeating task in a category', () => {
    const tasks = [
      task({ title: 'gym mon', date: TODAY, seriesId: 's1' }),
      task({ title: 'gym tue', date: '2026-11-03', seriesId: 's1' }),
      task({ title: 'report', date: '2026-11-04' }),
      task({ title: 'someday' })
    ]
    expect(shape(buildSections({ kind: 'category', id: 'c' }, tasks, TODAY))).toEqual([
      ['today', ['gym mon']],
      ['later', ['report']],
      ['someday', ['someday']]
    ])
  })

  it('asks each view for the right tasks', () => {
    expect(queriesFor({ kind: 'today' }, TODAY)).toEqual([
      { to: TODAY, statuses: ['pending', 'rescheduled', 'missed'] },
      { from: TODAY, to: TODAY, statuses: ['done'] }
    ])
    expect(queriesFor({ kind: 'upcoming' }, TODAY)).toEqual([
      { from: '2026-11-03', to: '2026-12-02' }
    ])
    expect(queriesFor({ kind: 'settings' }, TODAY)).toEqual([])
  })
})
