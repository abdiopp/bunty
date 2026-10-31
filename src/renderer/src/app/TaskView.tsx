import { CalendarDays, CircleCheck, Inbox, PartyPopper, Star } from 'lucide-react'
import { Kbd } from '@renderer/components/ui/kbd'
import { useViewTasks } from '@renderer/hooks/use-view-tasks'
import { longDate } from '@renderer/lib/format'
import { useApp } from '@renderer/stores/app'
import type { View } from '@renderer/stores/ui'
import { QuickAddBar } from '../features/quick-add/QuickAddBar'
import { StreakBadge } from '../features/streaks/StreakBadge'
import { TaskList } from '../features/tasks/TaskList'
import { NAV } from './nav'

function Progress({ done, total }: { done: number; total: number }): React.JSX.Element | null {
  if (total === 0) return null
  const fraction = done / total
  const radius = 8
  const circumference = 2 * Math.PI * radius
  return (
    <div
      className="text-muted-foreground flex items-center gap-2 text-xs tabular-nums"
      aria-label={`${done} of ${total} done today`}
    >
      <svg viewBox="0 0 20 20" className="size-5 -rotate-90">
        <circle
          cx="10"
          cy="10"
          r={radius}
          fill="none"
          strokeWidth="2.5"
          className="stroke-border"
        />
        <circle
          cx="10"
          cy="10"
          r={radius}
          fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          className="stroke-success transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      {done} of {total} done
    </div>
  )
}

const EMPTY: Record<string, { icon: React.ReactNode; title: string; hint: string }> = {
  today: { icon: <PartyPopper />, title: 'Nothing due today', hint: 'Enjoy it, or add something.' },
  upcoming: {
    icon: <CalendarDays />,
    title: 'Nothing scheduled',
    hint: 'Tasks with a date in the next 30 days show up here.'
  },
  inbox: { icon: <Inbox />, title: 'Inbox is empty', hint: 'Tasks without a date land here.' },
  logbook: {
    icon: <CircleCheck />,
    title: 'Nothing completed yet',
    hint: 'Finished tasks are kept here.'
  },
  category: {
    icon: <Star />,
    title: 'No open tasks here',
    hint: 'Add one below, or tag a task with this category.'
  }
}

export function TaskView({ view, today }: { view: View; today: string }): React.JSX.Element {
  const { tasks, loaded } = useViewTasks(view, today)
  const counts = useApp((state) => state.counts)
  const categories = useApp((state) => state.categories)
  const category = view.kind === 'category' ? categories.find((c) => c.id === view.id) : undefined
  const nav = NAV.find((entry) => entry.view.kind === view.kind)

  const title = category?.name ?? nav?.label ?? ''
  const icon = category ? (
    <span className="m-1.5 size-3.5 rounded-full" style={{ background: category.color }} />
  ) : (
    nav?.icon
  )
  const empty = EMPTY[view.kind]

  return (
    <div className="mx-auto max-w-[760px] px-10 pt-2 pb-24">
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2.5 text-[26px] font-semibold tracking-tight [&_svg]:size-6">
            {icon}
            {title}
          </h1>
          {view.kind === 'today' && (
            <p className="text-muted-foreground mt-1 text-sm">{longDate(today)}</p>
          )}
        </div>
        {view.kind === 'today' && (
          <div className="flex items-center gap-3">
            <StreakBadge />
            <Progress done={counts.doneToday} total={counts.today + counts.doneToday} />
          </div>
        )}
      </header>

      {view.kind !== 'logbook' && (
        <div className="mb-6">
          <QuickAddBar view={view} today={today} />
        </div>
      )}

      {loaded && tasks.length === 0 ? (
        <div className="text-muted-foreground flex flex-col items-center py-20 text-center">
          <div className="bg-muted mb-4 grid size-12 place-items-center rounded-full [&_svg]:size-5">
            {empty.icon}
          </div>
          <p className="text-foreground font-medium">{empty.title}</p>
          <p className="mt-1 text-sm">{empty.hint}</p>
          {view.kind !== 'logbook' && (
            <p className="mt-4 flex items-center gap-1.5 text-xs">
              Press <Kbd>N</Kbd> to add a task
            </p>
          )}
        </div>
      ) : (
        <TaskList view={view} tasks={tasks} today={today} />
      )}
    </div>
  )
}
