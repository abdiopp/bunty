// Turns "Call Ali tomorrow at 5pm #work !high" into a task. Pure, so the quick-add bar, the
// global popup and (later) voice input all read text the same way.
import * as chrono from 'chrono-node'
import { addDays, toLocalDate } from './dates'
import type { Priority, Recurrence } from './schemas'

export type TokenKind = 'when' | 'priority' | 'category' | 'recurrence'

export interface Token {
  kind: TokenKind
  start: number
  end: number
  text: string
}

export interface QuickAdd {
  title: string
  date: string | null
  time: string | null
  priority: Priority | null
  /** The category name as typed, without the '#'. */
  category: string | null
  recurrence: Recurrence | null
  /** Where each recognised piece sits in the input, for highlighting. */
  tokens: Token[]
}

export interface QuickAddOptions {
  now: Date
  /** Read 05/11 as 5 November rather than May 11. */
  dayFirst?: boolean
  /** Kinds the user has dismissed: their words stay in the title. */
  ignore?: ReadonlySet<TokenKind>
}

const DAY = String.raw`(?:sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?)s?`
const DAY_INDEX: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }

const RECURRENCES: [RegExp, (match: RegExpExecArray) => Recurrence][] = [
  [/\bevery\s+week\s?days?\b/i, () => ({ kind: 'custom', weekdays: [1, 2, 3, 4, 5] })],
  [/\bevery\s+weekends?\b/i, () => ({ kind: 'custom', weekdays: [0, 6] })],
  [/\b(?:every\s?day|daily)\b/i, () => ({ kind: 'daily' })],
  [/\b(?:every\s+week|weekly)\b/i, () => ({ kind: 'weekly' })],
  [
    new RegExp(String.raw`\bevery\s+${DAY}(?:\s*(?:,|and|&)\s*${DAY})*\b`, 'i'),
    (match) => {
      const days = match[0].match(new RegExp(DAY, 'gi'))!
      const weekdays = [...new Set(days.map((day) => DAY_INDEX[day.slice(0, 3).toLowerCase()]))]
      return { kind: 'custom', weekdays: weekdays.sort() }
    }
  ]
]

// Tokens stand alone, so "Call mom!" keeps its exclamation mark.
const PRIORITY = /(?<=^|\s)(!!!|!!|!(?:high|h|medium|med|m|low|l)|p[123])(?=\s|$)/gi
const PRIORITY_OF: Record<string, Priority> = {
  '!!!': 'high',
  '!high': 'high',
  '!h': 'high',
  p1: 'high',
  '!!': 'medium',
  '!medium': 'medium',
  '!med': 'medium',
  '!m': 'medium',
  p2: 'medium',
  '!low': 'low',
  '!l': 'low',
  p3: 'low'
}

// Said or written in words, as voice input produces: "call Ali tomorrow, high priority".
const PRIORITY_WORDS =
  /(?<=^|[\s,])(?:(high|medium|low) priority|priority (high|medium|low))(?=[\s,.]|$)/i

// Must start with a letter, so "Fix bug #42" stays as written.
const CATEGORY = /(?<=^|\s)#(\p{L}[\p{L}\p{N}_-]*)/u

// Small words that belong with a date: "Report by friday" should leave "Report".
const CONNECTOR = /(?:^|\s)(by|on|at|due|for|from|starting|until|till|before)\s+$/i
const QUOTED = /"([^"]*)"|“([^”]*)”/g
const SLASH_DATE = /^\d{1,2}[/.]\d{1,2}(?:[/.]\d{2,4})?$/

/** chrono doesn't understand "the 5th", so this adds it: the next date with that day. */
function withOrdinalDays(base: chrono.Chrono): chrono.Chrono {
  const parser = base.clone()
  parser.parsers.push({
    pattern: () => /\bthe\s+(\d{1,2})(?:st|nd|rd|th)\b/i,
    extract: (context, match) => {
      const day = Number(match[1])
      if (day < 1 || day > 31) return null
      const ref = context.reference.instant
      for (let offset = 0; offset < 13; offset++) {
        const candidate = new Date(ref.getFullYear(), ref.getMonth() + offset, day, 12)
        const fits = candidate.getDate() === day
        const notPast = offset > 0 || day >= ref.getDate()
        if (fits && notPast) {
          return { day, month: candidate.getMonth() + 1, year: candidate.getFullYear() }
        }
      }
      return null
    }
  })
  return parser
}

const monthFirst = withOrdinalDays(chrono.casual)
const dayFirstParser = withOrdinalDays(chrono.en.GB)

function blank(text: string, start: number, end: number): string {
  return text.slice(0, start) + ' '.repeat(end - start) + text.slice(end)
}

const pad = (n: number): string => String(n).padStart(2, '0')

/** Words chrono reads as dates that are usually just words. */
function isFalseDate(result: chrono.ParsedResult, connector: boolean): boolean {
  const word = result.text.trim().toLowerCase()
  if (word === 'now') return true
  // "March on", "Plan for May": a month with no day is too vague to schedule.
  if (result.start.isCertain('month') && !result.start.isCertain('day')) return true
  // "Sun cream", "sat nav", unless written as a date: "on sat".
  return (word === 'sun' || word === 'sat') && !connector
}

function resolveWhen(
  result: chrono.ParsedResult,
  now: Date
): { date: string; time: string | null } {
  const start = result.start
  let time: string | null = null
  let hour = start.get('hour') ?? 0
  const minute = start.get('minute') ?? 0

  if (start.isCertain('hour')) {
    // Without am/pm, 1-6 almost always means afternoon ("call at 5") and 7-11 morning.
    if (!start.isCertain('meridiem') && hour >= 1 && hour <= 6) hour += 12
    time = `${pad(hour)}:${pad(minute)}`
  }

  const today = toLocalDate(now)
  const hasDay = start.isCertain('day') || start.isCertain('weekday')
  if (hasDay) {
    return { date: toLocalDate(start.date()), time }
  }
  // Only a time: today if it's still ahead, otherwise tomorrow.
  const nowTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`
  return { date: time !== null && time <= nowTime ? addDays(today, 1) : today, time }
}

export function parseQuickAdd(text: string, options: QuickAddOptions): QuickAdd {
  const ignore = options.ignore ?? new Set<TokenKind>()
  const tokens: Token[] = []
  const take = (kind: TokenKind, start: number, end: number): void => {
    tokens.push({ kind, start, end, text: text.slice(start, end) })
    masked = blank(masked, start, end)
  }

  // Quoted text is never parsed, so "Watch "Tomorrow" friday" keeps the word.
  let masked = text.replace(QUOTED, (quoted) => ' '.repeat(quoted.length))

  let recurrence: Recurrence | null = null
  if (!ignore.has('recurrence')) {
    for (const [pattern, build] of RECURRENCES) {
      const match = pattern.exec(masked)
      if (match) {
        recurrence = build(match)
        take('recurrence', match.index, match.index + match[0].length)
        break
      }
    }
  }

  let priority: Priority | null = null
  if (!ignore.has('priority')) {
    for (const match of [...masked.matchAll(PRIORITY)]) {
      priority = PRIORITY_OF[match[0].toLowerCase()]
      take('priority', match.index, match.index + match[0].length)
    }
  }

  if (!ignore.has('priority')) {
    const match = PRIORITY_WORDS.exec(masked)
    if (match) {
      priority = (match[1] ?? match[2]).toLowerCase() as Priority
      take('priority', match.index, match.index + match[0].length)
    }
  }

  let category: string | null = null
  if (!ignore.has('category')) {
    const match = CATEGORY.exec(masked)
    if (match) {
      category = match[1]
      take('category', match.index, match.index + match[0].length)
    }
  }

  let date: string | null = null
  let time: string | null = null
  if (!ignore.has('when')) {
    const results = monthFirst.parse(masked, options.now, { forwardDate: true })
    for (let result of results) {
      const connector = CONNECTOR.exec(masked.slice(0, result.index))
      if (isFalseDate(result, connector !== null)) continue

      if (options.dayFirst && SLASH_DATE.test(result.text)) {
        const reread = dayFirstParser.parse(result.text, options.now, { forwardDate: true })[0]
        if (reread) result = Object.assign(reread, { index: result.index })
      }

      ;({ date, time } = resolveWhen(result, options.now))
      const start = connector ? result.index - connector[0].trimStart().length : result.index
      take('when', start, result.index + result.text.length)
      break
    }
  }

  tokens.sort((a, b) => a.start - b.start)
  let title = text
  for (const token of [...tokens].reverse()) {
    title = title.slice(0, token.start) + ' ' + title.slice(token.end)
  }
  title = title
    .replace(QUOTED, (_quoted, straight, curly) => straight ?? curly)
    .replace(/\s+/g, ' ')
    // Taking a date out of "done by friday?" mustn't leave "done ?".
    .replace(/ ([?!.,;:])/g, '$1')
    // A trailing full stop comes from dictation; "!" and "?" are kept as written.
    .replace(/^[\s,;:-]+|[\s,;:.-]+$/g, '')

  return { title, date, time, priority, category, recurrence, tokens }
}

/**
 * Turns what the OS reports into a tag Intl accepts. macOS reports an English UI with a
 * Pakistani region as the ICU form `en-US@rg=pkzzzz`, which Intl rejects; that becomes `en-PK`.
 */
export function normalizeLocale(raw: string): string {
  const [base, keywords = ''] = raw.replace(/_/g, '-').split('@')
  const region = /(?:^|;)rg=([a-z]{2})/i.exec(keywords)?.[1]
  const candidates = [region ? `${base.split('-')[0]}-${region.toUpperCase()}` : base, base]
  for (const candidate of candidates) {
    try {
      return Intl.getCanonicalLocales(candidate)[0]
    } catch {
      // Try the next, simpler form.
    }
  }
  return 'en-US'
}

/** True when the region formats dates day-first, as in most of the world outside the US. */
export function prefersDayFirst(locale: string): boolean {
  const parts = new Intl.DateTimeFormat(normalizeLocale(locale)).formatToParts(
    new Date(2026, 10, 20)
  )
  const order = parts.filter((part) => part.type === 'day' || part.type === 'month')
  return order[0]?.type === 'day'
}
