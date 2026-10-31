import type { Recurrence } from '@shared/schemas'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function describeRepeat(recurrence: Recurrence, anchor: string): string {
  switch (recurrence.kind) {
    case 'none':
      return 'Doesn’t repeat'
    case 'daily':
      return 'Every day'
    case 'weekly':
      return `Every ${DAY_NAMES[new Date(`${anchor}T12:00`).getDay()]}`
    case 'custom': {
      const days = recurrence.weekdays
      if (days.join() === '1,2,3,4,5') return 'Every weekday'
      if (days.join() === '0,6') return 'Every weekend'
      if (days.length === 1) return `Every ${DAY_NAMES[days[0]]}`
      return `Every ${days.map((day) => DAY_NAMES[day].slice(0, 3)).join(', ')}`
    }
  }
}
