import {
  BarChart3,
  CalendarDays,
  CalendarRange,
  CircleCheck,
  Flame,
  Inbox,
  Settings,
  Star
} from 'lucide-react'
import type { View } from '@renderer/stores/ui'

export interface NavEntry {
  view: View
  label: string
  icon: React.ReactNode
  /** Ctrl/⌘ + this key jumps here. */
  shortcut: string
}

export const NAV: NavEntry[] = [
  {
    view: { kind: 'today' },
    label: 'Today',
    icon: <Star className="fill-today text-today" />,
    shortcut: '1'
  },
  {
    view: { kind: 'upcoming' },
    label: 'Upcoming',
    icon: <CalendarDays className="text-overdue" />,
    shortcut: '2'
  },
  {
    view: { kind: 'calendar' },
    label: 'Calendar',
    icon: <CalendarRange className="text-primary" />,
    shortcut: '3'
  },
  {
    view: { kind: 'inbox' },
    label: 'Inbox',
    icon: <Inbox className="text-sky-500" />,
    shortcut: '4'
  },
  {
    view: { kind: 'logbook' },
    label: 'Completed',
    icon: <CircleCheck className="text-success" />,
    shortcut: '5'
  }
]

/** Looking back rather than at what's next; listed under the categories. */
export const INSIGHTS: NavEntry[] = [
  {
    view: { kind: 'streaks' },
    label: 'Streaks',
    icon: <Flame className="text-orange-500" />,
    shortcut: '6'
  },
  {
    view: { kind: 'reports' },
    label: 'Reports',
    icon: <BarChart3 className="text-violet-500" />,
    shortcut: '7'
  }
]

export const SETTINGS_NAV: NavEntry = {
  view: { kind: 'settings' },
  label: 'Settings',
  icon: <Settings className="text-muted-foreground" />,
  shortcut: ','
}

/** "Ctrl" on Windows, "⌘" on a Mac. */
export function modKey(platform: string | undefined): string {
  return platform === 'darwin' ? '⌘' : 'Ctrl'
}

/** "CommandOrControl+Shift+Space" → ["Ctrl", "Shift", "Space"]. */
export function quickAddKeys(accelerator: string | undefined, mod: string): string[] {
  if (!accelerator) return []
  return accelerator.split('+').map((part) => (part === 'CommandOrControl' ? mod : part))
}
