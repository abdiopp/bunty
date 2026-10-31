import { describe, expect, it } from 'vitest'
import {
  normalizeLocale,
  parseQuickAdd,
  prefersDayFirst,
  type QuickAddOptions
} from '@shared/quick-add'

// Monday 2 November 2026.
const at = (hour: number, minute = 0): Date => new Date(2026, 10, 2, hour, minute)
const MORNING = at(6)
const EVENING = at(18, 30)

const parse = (text: string, options: Partial<QuickAddOptions> = {}) =>
  parseQuickAdd(text, { now: EVENING, ...options })

describe('quick add', () => {
  describe('dates and times', () => {
    it('reads the example from the brief', () => {
      expect(parse('Call Ali tomorrow at 5pm')).toMatchObject({
        title: 'Call Ali',
        date: '2026-11-03',
        time: '17:00'
      })
    })

    it('reads a bare hour from 1 to 6 as the afternoon', () => {
      expect(parse('Call Ali at 5', { now: at(10) })).toMatchObject({
        date: '2026-11-02',
        time: '17:00'
      })
    })

    it('reads a bare hour from 7 to 11 as the morning', () => {
      expect(parse('Gym at 7', { now: MORNING })).toMatchObject({
        date: '2026-11-02',
        time: '07:00'
      })
      expect(parse('standup at 9:30', { now: MORNING }).time).toBe('09:30')
    })

    it('moves a time that has already passed today to tomorrow', () => {
      expect(parse('Gym at 7')).toMatchObject({ date: '2026-11-03', time: '07:00' })
      expect(parse('Call at 5pm')).toMatchObject({ date: '2026-11-03', time: '17:00' })
      expect(parse('Call at 11pm', { now: at(23, 30) })).toMatchObject({
        date: '2026-11-03',
        time: '23:00'
      })
    })

    it('keeps a date without inventing a time', () => {
      expect(parse('Buy milk today')).toMatchObject({ date: '2026-11-02', time: null })
      expect(parse('call mom tonight')).toMatchObject({ date: '2026-11-02', time: null })
    })

    it('handles relative and named dates', () => {
      expect(parse('Dentist next friday 3pm')).toMatchObject({
        title: 'Dentist',
        date: '2026-11-13',
        time: '15:00'
      })
      expect(parse('in 3 days buy milk')).toMatchObject({ title: 'buy milk', date: '2026-11-05' })
      expect(parse('review in 2 hours')).toMatchObject({ date: '2026-11-02', time: '20:30' })
      expect(parse('Meeting nov 20').date).toBe('2026-11-20')
    })

    it('treats a weekday as the next one, not today', () => {
      expect(parse('Plan trip mon').date).toBe('2026-11-09')
    })

    it('drops the small word in front of a date from the title', () => {
      const result = parse('Report by friday')
      expect(result.title).toBe('Report')
      expect(result.tokens).toEqual([{ kind: 'when', start: 7, end: 16, text: 'by friday' }])
    })

    it('understands "the 5th", rolling to next month once it has passed', () => {
      expect(parse('Pay rent on the 5th')).toMatchObject({ title: 'Pay rent', date: '2026-11-05' })
      expect(parse('Pay rent on the 1st').date).toBe('2026-12-01')
      expect(parse('Backup on the 31st').date).toBe('2026-12-31')
    })

    it('reads slash dates the way the region writes them', () => {
      expect(parse('Meeting 05/11', { dayFirst: true }).date).toBe('2026-11-05')
      expect(parse('Meeting 05/11', { dayFirst: false }).date).toBe('2027-05-11')
    })

    it('still reads month names correctly when dates are day-first', () => {
      expect(parse('Meeting nov 20', { dayFirst: true }).date).toBe('2026-11-20')
    })

    it('reports a past date rather than hiding it', () => {
      expect(parse('yesterday call').date).toBe('2026-11-01')
    })
  })

  describe('words that only look like dates', () => {
    it.each(['Sun cream', 'Buy sat nav', 'March on', 'Now fix it', 'Ask if we may proceed'])(
      '%s',
      (text) => {
        expect(parse(text)).toMatchObject({ title: text, date: null, time: null })
      }
    )

    it('still reads a short weekday written as a date', () => {
      expect(parse('Market on sat')).toMatchObject({ title: 'Market', date: '2026-11-07' })
    })

    it('leaves quoted text alone', () => {
      expect(parse('Watch "Tomorrow Never Dies" friday')).toMatchObject({
        title: 'Watch Tomorrow Never Dies',
        date: '2026-11-06'
      })
    })
  })

  describe('priority', () => {
    it.each([
      ['Fix bug p1', 'high'],
      ['Fix bug !!!', 'high'],
      ['Fix bug !high', 'high'],
      ['Fix bug !!', 'medium'],
      ['Fix bug !med', 'medium'],
      ['Fix bug p3', 'low'],
      ['Fix bug !low', 'low']
    ])('%s', (text, priority) => {
      expect(parse(text)).toMatchObject({ title: 'Fix bug', priority })
    })

    it('ignores an exclamation mark that is part of a sentence', () => {
      expect(parse('Call mom!')).toMatchObject({ title: 'Call mom!', priority: null })
    })
  })

  describe('category', () => {
    it('takes a #tag as the category', () => {
      expect(parse('Send invoice #work tomorrow')).toMatchObject({
        title: 'Send invoice',
        category: 'work',
        date: '2026-11-03'
      })
    })

    it('leaves numbers like issue references in the title', () => {
      expect(parse('Fix bug #42 tomorrow')).toMatchObject({
        title: 'Fix bug #42',
        category: null
      })
    })
  })

  describe('repeats', () => {
    it.each([
      ['Run daily', { kind: 'daily' }],
      ['Run every day', { kind: 'daily' }],
      ['Review weekly', { kind: 'weekly' }],
      ['Standup every weekday', { kind: 'custom', weekdays: [1, 2, 3, 4, 5] }],
      ['Clean every weekend', { kind: 'custom', weekdays: [0, 6] }],
      ['Gym every monday', { kind: 'custom', weekdays: [1] }],
      ['Water plants every mon, wed and fri', { kind: 'custom', weekdays: [1, 3, 5] }],
      ['Yoga every tues & thursday', { kind: 'custom', weekdays: [2, 4] }]
    ])('%s', (text, recurrence) => {
      const result = parse(text)
      expect(result.recurrence).toEqual(recurrence)
      expect(result.title).not.toMatch(/every|daily|weekly/i)
    })

    it('combines a repeat with a time, starting today if the time is still ahead', () => {
      expect(parse('Gym every monday at 7am', { now: MORNING })).toMatchObject({
        title: 'Gym',
        recurrence: { kind: 'custom', weekdays: [1] },
        date: '2026-11-02',
        time: '07:00'
      })
    })
  })

  it('reads everything at once, in any order', () => {
    expect(parse('!high #work Send report every friday 9am')).toMatchObject({
      title: 'Send report',
      priority: 'high',
      category: 'work',
      recurrence: { kind: 'custom', weekdays: [5] },
      time: '09:00'
    })
  })

  it('gives an empty title when there is only a date', () => {
    expect(parse('tomorrow 5pm').title).toBe('')
  })

  it('puts dismissed parts back into the title', () => {
    const result = parse('Call Ali tomorrow p1', { ignore: new Set(['when']) })
    expect(result).toMatchObject({ title: 'Call Ali tomorrow', date: null, priority: 'high' })
  })

  it('reports where each part was found', () => {
    const text = 'Call Ali tomorrow at 5pm #work p1'
    expect(parse(text).tokens.map((token) => [token.kind, token.text])).toEqual([
      ['when', 'tomorrow at 5pm'],
      ['category', '#work'],
      ['priority', 'p1']
    ])
  })
})

describe('date order', () => {
  it('knows which regions write the day first', () => {
    expect(prefersDayFirst('en-US')).toBe(false)
    expect(prefersDayFirst('en-GB')).toBe(true)
    expect(prefersDayFirst('en-PK')).toBe(true)
    expect(prefersDayFirst('de-DE')).toBe(true)
  })

  it('accepts the locale forms operating systems actually report', () => {
    // macOS: English UI with a Pakistani region.
    expect(normalizeLocale('en-US@rg=pkzzzz')).toBe('en-PK')
    expect(prefersDayFirst('en-US@rg=pkzzzz')).toBe(true)
    expect(normalizeLocale('en_GB')).toBe('en-GB')
    expect(normalizeLocale('de-DE')).toBe('de-DE')
    expect(normalizeLocale('not a locale!')).toBe('en-US')
  })
})

describe('dictated text', () => {
  it('reads priority said in words, and drops the full stop', () => {
    expect(parse('Call Ali tomorrow at 5 p.m., high priority.')).toMatchObject({
      title: 'Call Ali',
      priority: 'high',
      date: '2026-11-03',
      time: '17:00'
    })
    expect(parse('Water the plants priority low')).toMatchObject({
      title: 'Water the plants',
      priority: 'low'
    })
  })

  it('keeps an exclamation or question mark', () => {
    expect(parse('Is the report done by friday?')).toMatchObject({
      title: 'Is the report done?',
      date: '2026-11-06'
    })
    expect(parse('Ship it!').title).toBe('Ship it!')
  })
})
