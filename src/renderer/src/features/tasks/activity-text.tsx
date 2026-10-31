import { CalendarClock, Check, CirclePlus, CircleX, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import type { ActivityEntry } from '@shared/ipc'
import { dayLabel, inSentence, timeLabel } from '@renderer/lib/format'

export const ACTIVITY_ICON: Record<ActivityEntry['action'], React.ReactNode> = {
  created: <CirclePlus />,
  completed: <Check />,
  reopened: <RotateCcw />,
  missed: <CircleX />,
  edited: <Pencil />,
  rescheduled: <CalendarClock />,
  deleted: <Trash2 />,
  restored: <RotateCcw />
}

const FIELD_NAMES: Record<string, string> = {
  title: 'title',
  notes: 'notes',
  priority: 'priority',
  categoryId: 'category',
  time: 'time',
  date: 'date',
  recurrence: 'repeat'
}

export function describeActivity(entry: ActivityEntry, today: string): string {
  switch (entry.action) {
    case 'created':
      return entry.toDate ? `Created for ${inSentence(dayLabel(entry.toDate, today))}` : 'Created'
    case 'completed':
      return 'Completed'
    case 'reopened':
      return 'Marked as not done'
    case 'missed':
      return 'Missed'
    case 'rescheduled':
      return `Moved from ${inSentence(dayLabel(entry.fromDate!, today))} to ${inSentence(dayLabel(entry.toDate!, today))}`
    case 'deleted':
      return 'Deleted'
    case 'restored':
      return 'Restored'
    case 'edited': {
      const changes = entry.changes ?? {}
      if (changes.time) {
        const [, to] = changes.time as [string | null, string | null]
        return to ? `Time set to ${timeLabel(to)}` : 'Time removed'
      }
      if (changes.date) {
        const [, to] = changes.date as [string | null, string | null]
        return to ? `Scheduled for ${inSentence(dayLabel(to, today))}` : 'Date removed'
      }
      const fields = Object.keys(changes).map((key) => FIELD_NAMES[key] ?? key)
      return fields.length ? `Changed ${fields.join(', ')}` : 'Edited'
    }
  }
}
