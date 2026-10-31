import { addDays, nextMonday } from '@shared/dates'

/** The single-letter shortcuts the quick buttons answer to while this is open. */
export const DATE_KEYS = { t: 'today', m: 'tomorrow', w: 'nextWeek', n: 'none' } as const

export function quickDate(
  key: (typeof DATE_KEYS)[keyof typeof DATE_KEYS],
  today: string
): string | null {
  switch (key) {
    case 'today':
      return today
    case 'tomorrow':
      return addDays(today, 1)
    case 'nextWeek':
      return nextMonday(today)
    case 'none':
      return null
  }
}
