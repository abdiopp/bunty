import { useEffect, useState } from 'react'
import { Circle } from 'lucide-react'
import type { ActivityEntry } from '@shared/ipc'
import type { ActivityAction } from '@shared/schemas'
import { Button } from '@renderer/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@renderer/components/ui/toggle-group'
import { clockTime, dayLabel, longDate } from '@renderer/lib/format'
import { useUi } from '@renderer/stores/ui'
import { ACTIVITY_ICON, describeActivity } from '../tasks/activity-text'

const PAGE = 60

const FILTERS: { value: ActivityAction | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'created', label: 'Created' },
  { value: 'completed', label: 'Completed' },
  { value: 'missed', label: 'Missed' },
  { value: 'rescheduled', label: 'Rescheduled' },
  { value: 'edited', label: 'Edited' },
  { value: 'deleted', label: 'Deleted' }
]

function localDay(iso: string): string {
  const value = new Date(iso)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
}

/** Every recorded action, newest first, filterable by kind. */
export function ActivityFeed({ today }: { today: string }): React.JSX.Element {
  const [filter, setFilter] = useState<ActivityAction | 'all'>('all')
  return (
    <div>
      <ToggleGroup
        type="single"
        size="sm"
        variant="outline"
        value={filter}
        aria-label="Show"
        onValueChange={(value) => value && setFilter(value as typeof filter)}
        className="mb-4 flex-wrap"
      >
        {FILTERS.map((option) => (
          <ToggleGroupItem key={option.value} value={option.value} className="px-3">
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {/* A new filter starts a fresh list. */}
      <FeedList key={filter} filter={filter} today={today} />
    </div>
  )
}

function FeedList({ filter, today }: { filter: ActivityAction | 'all'; today: string }) {
  const [entries, setEntries] = useState<ActivityEntry[]>([])
  const [loaded, setLoaded] = useState(false)
  const [more, setMore] = useState(false)
  const actions = filter === 'all' ? undefined : [filter]

  const page = async (before?: number): Promise<ActivityEntry[]> => {
    const next = await window.api.activity.list({ actions, before, limit: PAGE })
    setMore(next.length === PAGE)
    return next
  }

  useEffect(() => {
    let current = true
    const refresh = (): void =>
      void page().then((first) => {
        if (!current) return
        setEntries(first)
        setLoaded(true)
      })
    refresh()
    const stop = window.api.on('tasks:changed', refresh)
    return () => {
      current = false
      stop()
    }
    // The list is keyed by the filter, so `page` only changes with a remount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loaded && entries.length === 0) {
    return <p className="text-muted-foreground py-10 text-center text-sm">Nothing here yet.</p>
  }

  const days = new Map<string, ActivityEntry[]>()
  for (const entry of entries) {
    const day = localDay(entry.createdAt)
    days.set(day, [...(days.get(day) ?? []), entry])
  }

  return (
    <div className="space-y-6">
      {[...days].map(([day, list]) => (
        <section key={day} aria-label={dayLabel(day, today)}>
          <h3 className="border-border mb-1 border-b pb-1.5 text-sm font-semibold">
            {dayLabel(day, today)}
            {dayLabel(day, today) !== longDate(day) && (
              <span className="text-muted-foreground ml-2 text-xs font-normal">
                {longDate(day)}
              </span>
            )}
          </h3>
          <ul>
            {list.map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 py-1.5 text-sm">
                <span className="text-muted-foreground grid size-6 shrink-0 place-items-center rounded-full border [&_svg]:size-3.5">
                  {ACTIVITY_ICON[entry.action] ?? <Circle />}
                </span>
                <button
                  disabled={!entry.taskId}
                  onClick={() => entry.taskId && useUi.getState().openDetail(entry.taskId)}
                  className="min-w-0 flex-1 truncate text-left font-medium hover:underline disabled:no-underline"
                >
                  {entry.taskTitle}
                </button>
                <span className="text-muted-foreground hidden shrink-0 text-xs sm:inline">
                  {describeActivity(entry, today)}
                </span>
                <span className="text-muted-foreground w-16 shrink-0 text-right text-xs tabular-nums">
                  {clockTime(entry.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {more && (
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            void page(entries.at(-1)?.id).then((next) =>
              setEntries((current) => [...current, ...next])
            )
          }
        >
          Show older
        </Button>
      )}
    </div>
  )
}
