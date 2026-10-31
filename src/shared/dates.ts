// Calendar dates are plain local "YYYY-MM-DD" strings and times are "HH:mm".
// They never go through UTC: `new Date('2026-11-01')` parses as UTC midnight, which is the
// previous day anywhere west of Greenwich, so everything here builds dates from local parts.

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function toLocalDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function parts(date: string): [number, number, number] {
  const m = DATE_RE.exec(date)
  if (!m) throw new RangeError(`Invalid local date: ${date}`)
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

/** Local noon on the date, so a daylight-saving jump can't push it onto a neighbouring day. */
export function fromLocalDate(date: string): Date {
  const [y, m, d] = parts(date)
  return new Date(y, m - 1, d, 12)
}

export function isLocalDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false
  return toLocalDate(fromLocalDate(value)) === value
}

export function isLocalTime(value: string): boolean {
  return TIME_RE.test(value)
}

export function addDays(date: string, days: number): string {
  const d = fromLocalDate(date)
  d.setDate(d.getDate() + days)
  return toLocalDate(d)
}

/** 0 = Sunday … 6 = Saturday, matching `Date.prototype.getDay`. */
export function weekdayOf(date: string): number {
  return fromLocalDate(date).getDay()
}

export function minDate(a: string, b: string): string {
  return a < b ? a : b
}

/** "09:30" → 570. */
export function minutesOfTime(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((fromLocalDate(to).getTime() - fromLocalDate(from).getTime()) / 86_400_000)
}

/** The Monday after `today`, which is what "next week" means in quick reschedule. */
export function nextMonday(today: string): string {
  return addDays(today, 7 - ((weekdayOf(today) + 6) % 7))
}

const FIRST_DAY: Record<'monday' | 'sunday', number> = { monday: 1, sunday: 0 }

export function startOfWeek(date: string, weekStart: 'monday' | 'sunday'): string {
  return addDays(date, -((weekdayOf(date) - FIRST_DAY[weekStart] + 7) % 7))
}

export function startOfMonth(date: string): string {
  return `${date.slice(0, 8)}01`
}

/** Same day-of-month, clamped: 31 January plus a month is 28 (or 29) February. */
export function addMonths(date: string, months: number): string {
  const [year, month, day] = date.split('-').map(Number)
  const target = new Date(year, month - 1 + months, 1, 12)
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0, 12).getDate()
  target.setDate(Math.min(day, lastDay))
  return toLocalDate(target)
}

/** The last day of the month `date` is in. */
export function endOfMonth(date: string): string {
  return addDays(startOfMonth(addMonths(startOfMonth(date), 1)), -1)
}
