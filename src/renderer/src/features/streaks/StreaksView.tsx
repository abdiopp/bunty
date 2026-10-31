import { Flame, Repeat2, Trophy } from 'lucide-react'
import type { SeriesStreak } from '@shared/ipc'
import { dayLabel, monthShort, weekdayShort } from '@renderer/lib/format'
import { cn } from '@renderer/lib/utils'
import { useApp } from '@renderer/stores/app'
import { describeRepeat } from '../quick-add/describe-repeat'
import { heatmapGrid, type HeatCell } from './heatmap-grid'
import { useHeatmap, useStreakSummary } from './use-streaks'

const LEVEL_CLASS: Record<number, string> = {
  [-1]: 'bg-overdue/30',
  0: 'bg-muted',
  1: 'bg-success/30',
  2: 'bg-success/50',
  3: 'bg-success/75',
  4: 'bg-success'
}

function Stat({
  icon,
  label,
  value,
  unit
}: {
  icon: React.ReactNode
  label: string
  value: number | string
  unit?: string
}): React.JSX.Element {
  return (
    <div className="bg-card rounded-xl border p-4">
      <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium [&_svg]:size-3.5">
        {icon}
        {label}
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="text-3xl font-semibold tracking-tight tabular-nums">{value}</span>
        {unit && <span className="text-muted-foreground text-sm">{unit}</span>}
      </div>
    </div>
  )
}

export function StreaksView({ today }: { today: string }): React.JSX.Element {
  const summary = useStreakSummary()
  const heatmap = useHeatmap()
  const days = (n: number): string => (n === 1 ? 'day' : 'days')

  return (
    <div className="mx-auto max-w-[920px] px-10 pt-2 pb-16">
      <h1 className="mb-6 flex items-center gap-2.5 text-[26px] font-semibold tracking-tight">
        <Flame className="size-6 fill-orange-500 text-orange-500" />
        Streaks
      </h1>

      <div className="grid grid-cols-3 gap-3">
        <Stat
          icon={<Flame className="text-orange-500" />}
          label="Current streak"
          value={summary?.current ?? '–'}
          unit={summary ? days(summary.current) : undefined}
        />
        <Stat
          icon={<Trophy className="text-today" />}
          label="Longest streak"
          value={summary?.longest ?? '–'}
          unit={summary ? days(summary.longest) : undefined}
        />
        <Stat
          icon={<span className="bg-success size-2.5 rounded-full" />}
          label="Today"
          value={summary ? `${summary.today.done}/${summary.today.due}` : '–'}
          unit="done"
        />
      </div>

      <section className="bg-card mt-4 rounded-xl border p-5" aria-label="Last 12 months">
        <h2 className="mb-4 text-sm font-semibold">Last 12 months</h2>
        {heatmap && <Heatmap days={heatmap} today={today} />}
        <p className="text-muted-foreground mt-4 text-xs leading-relaxed">
          A day counts when everything due that day was done. Days with nothing due don’t break a
          streak, and moving a missed task later doesn’t repair the day it was missed.
        </p>
      </section>

      <section className="bg-card mt-4 rounded-xl border" aria-label="Habits">
        <h2 className="px-5 pt-5 pb-1 text-sm font-semibold">Habits</h2>
        <p className="text-muted-foreground px-5 pb-3 text-xs">
          Every repeating task keeps its own streak.
        </p>
        {summary && summary.series.length === 0 && (
          <p className="text-muted-foreground border-t px-5 py-6 text-center text-sm">
            Make a task repeat (“Gym every mon, wed and fri”) and its streak shows up here.
          </p>
        )}
        <ul>
          {summary?.series.map((series) => (
            <HabitRow key={series.seriesId} series={series} today={today} />
          ))}
        </ul>
      </section>
    </div>
  )
}

function HabitRow({ series, today }: { series: SeriesStreak; today: string }): React.JSX.Element {
  const category = useApp((state) => state.categories.find((c) => c.id === series.categoryId))
  return (
    <li
      aria-label={series.title}
      className={cn('flex items-center gap-4 border-t px-5 py-3', !series.active && 'opacity-60')}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 truncate text-sm font-medium">
          {category && (
            <span className="size-2 shrink-0 rounded-full" style={{ background: category.color }} />
          )}
          {series.title}
        </div>
        <div className="text-muted-foreground flex items-center gap-1 text-xs">
          <Repeat2 className="size-3" />
          {series.active ? describeRepeat(series.recurrence, today) : 'Stopped'}
        </div>
      </div>
      <div className="flex gap-1" aria-label="Recent occurrences">
        {series.recent.map((outcome, index) => (
          <span
            key={index}
            title={outcome}
            className={cn(
              'size-2.5 rounded-full',
              outcome === 'done' && 'bg-success',
              outcome === 'missed' && 'bg-overdue/40',
              outcome === 'pending' && 'border-muted-foreground/40 border'
            )}
          />
        ))}
      </div>
      <div className="w-24 text-right">
        <div className="flex items-center justify-end gap-1 text-sm font-semibold tabular-nums">
          {series.current > 0 && <Flame className="size-3.5 fill-orange-500 text-orange-500" />}
          {series.current}
        </div>
        <div className="text-muted-foreground text-[11px] tabular-nums">best {series.longest}</div>
      </div>
    </li>
  )
}

function Heatmap({
  days,
  today
}: {
  days: Parameters<typeof heatmapGrid>[0]
  today: string
}): React.JSX.Element {
  const weekStart = useApp((state) => state.settings.weekStart)
  const columns = heatmapGrid(days, today, weekStart)
  // A label where each month starts, unless the next one starts too soon for both to fit.
  const starts = columns.flatMap((week, index) =>
    index === 0 || week[0].date.slice(5, 7) !== columns[index - 1][0].date.slice(5, 7)
      ? [index]
      : []
  )
  const labelled = new Set(
    starts.filter((start, i) => (starts[i + 1] ?? columns.length) - start >= 3)
  )

  const describe = (cell: HeatCell): string => {
    const when = dayLabel(cell.date, today)
    if (cell.due === 0) return `${when}: nothing due`
    return `${when}: ${cell.done} of ${cell.due} done`
  }

  return (
    <div className="overflow-x-auto">
      <div className="inline-grid grid-cols-[auto_1fr] gap-x-2">
        <div />
        <div className="text-muted-foreground flex gap-[3px] pb-1 text-[10px]">
          {columns.map((week, index) => (
            <span key={week[0].date} className="w-[11px] overflow-visible whitespace-nowrap">
              {labelled.has(index) ? monthShort(week[0].date) : ''}
            </span>
          ))}
        </div>
        <div className="text-muted-foreground grid grid-rows-7 gap-[3px] text-[10px] leading-[11px]">
          {columns[0].map((cell, row) => (
            <span key={cell.date}>{row % 2 === 0 ? weekdayShort(cell.date) : ''}</span>
          ))}
        </div>
        <div role="grid" aria-label="Days completed" className="flex gap-[3px]">
          {columns.map((week) => (
            <div key={week[0].date} className="grid grid-rows-7 gap-[3px]">
              {week.map((cell) => (
                <span
                  key={cell.date}
                  role="gridcell"
                  title={cell.future ? undefined : describe(cell)}
                  aria-label={cell.future ? undefined : describe(cell)}
                  className={cn(
                    'size-[11px] rounded-[3px]',
                    cell.future ? 'bg-transparent' : LEVEL_CLASS[cell.level],
                    cell.date === today && 'ring-foreground/40 ring-1 ring-offset-1'
                  )}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="text-muted-foreground mt-3 flex items-center justify-end gap-1.5 text-[11px]">
        Less
        {[0, 1, 2, 3, 4].map((value) => (
          <span key={value} className={cn('size-[11px] rounded-[3px]', LEVEL_CLASS[value])} />
        ))}
        More
      </div>
    </div>
  )
}
