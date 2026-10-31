import { addDays, daysBetween, fromLocalDate } from '@shared/dates'

// The region's format locale (e.g. en-PK), set once the app info arrives. Windows often runs an
// en-US display language with a day-first region, and dates should follow the region.
let locale: string | undefined

export function setFormatLocale(next: string): void {
  locale = next
  formats.clear()
}

const formats = new Map<string, Intl.DateTimeFormat>()

function format(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(options)
  let formatter = formats.get(key)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, options)
    formats.set(key, formatter)
  }
  return formatter
}

/** "Today", "Tomorrow", "Friday" (this coming one), or "Fri 30 Oct", with the year if needed. */
export function dayLabel(date: string, today: string): string {
  if (date === today) return 'Today'
  if (date === addDays(today, 1)) return 'Tomorrow'
  if (date === addDays(today, -1)) return 'Yesterday'
  const distance = daysBetween(today, date)
  const value = fromLocalDate(date)
  // Only the coming week gets bare weekday names; "Friday" for last Friday reads as the next one.
  if (distance > 0 && distance < 7) return format({ weekday: 'long' }).format(value)
  const sameYear = date.slice(0, 4) === today.slice(0, 4)
  return format({
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' })
  }).format(value)
}

/** A day label for mid-sentence use: "today" loses its capital, "Tuesday" keeps it. */
export function inSentence(label: string): string {
  return label.replace(/^(Today|Tomorrow|Yesterday)\b/, (word) => word.toLowerCase())
}

/** "7am", "9:30am", or "09:30" where the region uses a 24-hour clock: for tight spaces. */
export function shortTimeLabel(time: string): string {
  const [hours, minutes] = time.split(':').map(Number)
  const value = new Date(2026, 0, 1, hours, minutes)
  if (!format({ hour: 'numeric' }).resolvedOptions().hour12) {
    return format({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(value)
  }
  const options: Intl.DateTimeFormatOptions =
    minutes === 0 ? { hour: 'numeric' } : { hour: 'numeric', minute: '2-digit' }
  return format(options).format(value).replace(/\s/g, '').toLowerCase()
}

/** "Monday, 2 November". */
export function longDate(date: string): string {
  return format({ weekday: 'long', day: 'numeric', month: 'long' }).format(fromLocalDate(date))
}

/** "November 2026". */
export function monthTitle(date: string): string {
  return format({ month: 'long', year: 'numeric' }).format(fromLocalDate(date))
}

/** "2 – 8 Nov 2026", the way the region writes a range. */
export function rangeTitle(from: string, to: string): string {
  return format({ day: 'numeric', month: 'short', year: 'numeric' }).formatRange(
    fromLocalDate(from),
    fromLocalDate(to)
  )
}

/** "Nov". */
export function monthShort(date: string): string {
  return format({ month: 'short' }).format(fromLocalDate(date))
}

/** "Mon". */
export function weekdayShort(date: string): string {
  return format({ weekday: 'short' }).format(fromLocalDate(date))
}

/** "7 am" or "07", for the time grid's gutter. */
export function hourLabel(hour: number): string {
  return format({ hour: 'numeric' }).format(new Date(2026, 0, 1, hour))
}

/** "5:00 PM" or "17:00", as the region writes it. */
export function timeLabel(time: string): string {
  const [hours, minutes] = time.split(':').map(Number)
  return format({ hour: 'numeric', minute: '2-digit' }).format(new Date(2026, 0, 1, hours, minutes))
}

/** The clock time of a timestamp, as the region writes it. */
export function clockTime(iso: string): string {
  return format({ hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
}

/** "just now", "5 min ago", "3 h ago", then the day. */
export function relativeTime(iso: string, now: Date, today: string): string {
  const then = new Date(iso)
  const minutes = Math.round((now.getTime() - then.getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  if (minutes < 60 * 12) return `${Math.round(minutes / 60)} h ago`
  const day = dayLabel(localDate(then), today)
  return `${day}, ${clockTime(iso)}`
}

function localDate(value: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
}
