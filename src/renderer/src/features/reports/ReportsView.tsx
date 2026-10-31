import { useEffect, useState } from 'react'
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  History,
  Sheet
} from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts'
import { toast } from 'sonner'
import { addDays, addMonths } from '@shared/dates'
import type { Report } from '@shared/ipc'
import type { ReportPeriod, ReportQuery } from '@shared/schemas'
import { Button } from '@renderer/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { ToggleGroup, ToggleGroupItem } from '@renderer/components/ui/toggle-group'
import { dayLabel, longDate, monthTitle, rangeTitle, weekdayShort } from '@renderer/lib/format'
import { cn } from '@renderer/lib/utils'
import { useUi } from '@renderer/stores/ui'
import { attempt } from '../tasks/actions'
import { ActivityFeed } from './ActivityFeed'
import { useChartWidth } from './use-chart-width'

function useReport(query: ReportQuery): Report | null {
  const [state, setState] = useState<{ key: string; report: Report } | null>(null)
  const key = JSON.stringify(query)
  useEffect(() => {
    let current = true
    const load = (): void =>
      void window.api.reports
        .summary(JSON.parse(key) as ReportQuery)
        .then((report) => current && setState({ key, report }))
        .catch((err) => console.error('Report failed to load:', JSON.stringify(err)))
    load()
    const stops = [window.api.on('tasks:changed', load), window.api.on('day:rolledOver', load)]
    return () => {
      current = false
      stops.forEach((stop) => stop())
    }
  }, [key])
  return state?.key === key ? state.report : null
}

function shift(query: ReportQuery, step: number): string {
  if (query.period === 'month') return addMonths(query.anchor, step)
  return addDays(query.anchor, step * (query.period === 'week' ? 7 : 1))
}

export function ReportsView({ today }: { today: string }): React.JSX.Element {
  const [tab, setTab] = useState<'overview' | 'history'>('overview')
  const [query, setQuery] = useState<ReportQuery>({ period: 'week', anchor: today })
  const report = useReport(query)

  const title =
    query.period === 'month'
      ? monthTitle(query.anchor)
      : query.period === 'week' && report
        ? rangeTitle(report.from, report.to)
        : longDate(query.anchor)

  const exportAs = async (kind: 'csv' | 'pdf'): Promise<void> => {
    const path = await attempt(() =>
      kind === 'csv' ? window.api.reports.exportCsv(query) : window.api.reports.exportPdf(query)
    )
    if (!path) return
    toast.success(`Saved ${kind === 'csv' ? 'the CSV' : 'the PDF'}`, {
      description: path,
      action: { label: 'Show in folder', onClick: () => void window.api.app.reveal(path) }
    })
  }

  return (
    <div className="mx-auto max-w-[920px] px-10 pt-2 pb-16">
      <header className="mb-5 flex items-center gap-4">
        <h1 className="flex items-center gap-2.5 text-[26px] font-semibold tracking-tight">
          <BarChart3 className="size-6 text-violet-500" />
          Reports
        </h1>
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={tab}
          aria-label="Report section"
          onValueChange={(value) => value && setTab(value as typeof tab)}
          className="ml-auto"
        >
          <ToggleGroupItem value="overview" className="px-3">
            Overview
          </ToggleGroupItem>
          <ToggleGroupItem value="history" className="gap-1.5 px-3">
            <History />
            History
          </ToggleGroupItem>
        </ToggleGroup>
      </header>

      {tab === 'history' ? (
        <ActivityFeed today={today} />
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <ToggleGroup
              type="single"
              size="sm"
              variant="outline"
              value={query.period}
              aria-label="Period"
              onValueChange={(value) =>
                value && setQuery({ ...query, period: value as ReportPeriod })
              }
            >
              <ToggleGroupItem value="day" className="px-3">
                Day
              </ToggleGroupItem>
              <ToggleGroupItem value="week" className="px-3">
                Week
              </ToggleGroupItem>
              <ToggleGroupItem value="month" className="px-3">
                Month
              </ToggleGroupItem>
            </ToggleGroup>
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Previous period"
                onClick={() => setQuery({ ...query, anchor: shift(query, -1) })}
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Next period"
                onClick={() => setQuery({ ...query, anchor: shift(query, 1) })}
              >
                <ChevronRight />
              </Button>
            </div>
            <h2 className="text-base font-semibold">{title}</h2>
            {query.anchor !== today && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setQuery({ ...query, anchor: today })}
              >
                Back to now
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="ml-auto">
                  <Download />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => void exportAs('csv')}>
                  <Sheet />
                  Tasks as CSV
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void exportAs('pdf')}>
                  <FileText />
                  Report as PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {report && <Overview report={report} query={query} today={today} />}
        </>
      )}
    </div>
  )
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="bg-card rounded-xl border p-4">
      <div className="text-muted-foreground text-xs font-medium">{label}</div>
      <div className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      {note && <div className="text-muted-foreground mt-0.5 text-xs">{note}</div>}
    </div>
  )
}

function Card({
  title,
  children,
  className
}: {
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section aria-label={title} className={cn('bg-card rounded-xl border p-5', className)}>
      <h3 className="mb-4 text-sm font-semibold">{title}</h3>
      {children}
    </section>
  )
}

function Overview({ report, query, today }: { report: Report; query: ReportQuery; today: string }) {
  const { totals } = report
  const rate = totals.rate === null ? '–' : `${Math.round(totals.rate * 100)}%`
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        <Tile
          label="Completion rate"
          value={rate}
          note={totals.due ? `of ${totals.due} due` : 'nothing due yet'}
        />
        <Tile
          label="Completed"
          value={String(totals.done)}
          note={`${totals.completed} finished in all`}
        />
        <Tile label="Missed" value={String(totals.missed)} />
        <Tile
          label="Rescheduled"
          value={String(totals.rescheduled)}
          note={`${totals.created} created`}
        />
      </div>

      {query.period !== 'day' && (
        <Card title="Completed and missed by day">
          <DailyChart report={report} today={today} />
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Card title="Completions by day of the week">
          <WeekdayChart report={report} />
        </Card>
        <Card title="By category">
          <Categories report={report} />
        </Card>
      </div>

      <Card title="Most rescheduled">
        {report.mostRescheduled.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nothing was moved in this period.</p>
        ) : (
          <ol className="divide-border divide-y">
            {report.mostRescheduled.map((task) => (
              <li key={task.taskId ?? task.title} className="flex items-center gap-3 py-2 text-sm">
                <button
                  disabled={!task.taskId}
                  onClick={() => task.taskId && useUi.getState().openDetail(task.taskId)}
                  className="min-w-0 flex-1 truncate text-left hover:underline disabled:no-underline"
                >
                  {task.title}
                </button>
                <span className="text-muted-foreground tabular-nums">moved {task.moves}×</span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  )
}

function ChartTooltip({
  active,
  payload,
  label,
  render
}: {
  active?: boolean
  payload?: { payload: Record<string, number | string> }[]
  label?: string
  render: (row: Record<string, number | string>, label: string) => React.ReactNode
}): React.JSX.Element | null {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-popover text-popover-foreground rounded-lg border px-3 py-2 text-xs shadow-md">
      {render(payload[0].payload, label ?? '')}
    </div>
  )
}

function Legend({ items }: { items: { label: string; className: string }[] }) {
  return (
    <div className="text-muted-foreground mb-3 flex gap-4 text-xs">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5">
          <span className={cn('size-2.5 rounded-[3px]', item.className)} />
          {item.label}
        </span>
      ))}
    </div>
  )
}

function DailyChart({ report, today }: { report: Report; today: string }): React.JSX.Element {
  const [ref, width] = useChartWidth()
  const data = report.days.map((day) => ({ ...day, future: day.date > today }))
  const month = report.days.length > 7
  return (
    <div ref={ref}>
      <Legend
        items={[
          { label: 'Completed', className: 'bg-chart-done' },
          { label: 'Missed', className: 'bg-chart-missed' }
        ]}
      />
      {width > 0 && (
        <BarChart
          width={width}
          height={200}
          data={data}
          margin={{ top: 4, right: 0, bottom: 0, left: -18 }}
        >
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            interval={month ? 3 : 0}
            tickFormatter={(date: string) =>
              month ? String(Number(date.slice(8))) : weekdayShort(date)
            }
            tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
          />
          <YAxis
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
          />
          <Tooltip
            cursor={{ fill: 'var(--accent)' }}
            content={
              <ChartTooltip
                render={(row, date) => (
                  <>
                    <div className="mb-1 font-medium">{dayLabel(date, today)}</div>
                    {row.future ? (
                      <div className="text-muted-foreground">Still ahead</div>
                    ) : (
                      <>
                        <div>Completed {row.done}</div>
                        <div>Missed {row.missed}</div>
                        <div className="text-muted-foreground">{row.due} due</div>
                      </>
                    )}
                  </>
                )}
              />
            }
          />
          {/* The surface-colored stroke leaves a 2px gap between the stacked segments. */}
          <Bar
            dataKey="done"
            stackId="day"
            fill="var(--chart-done)"
            stroke="var(--card)"
            strokeWidth={2}
            maxBarSize={24}
            isAnimationActive={false}
          />
          <Bar
            dataKey="missed"
            stackId="day"
            fill="var(--chart-missed)"
            stroke="var(--card)"
            strokeWidth={2}
            radius={[4, 4, 0, 0]}
            maxBarSize={24}
            isAnimationActive={false}
          />
        </BarChart>
      )}
    </div>
  )
}

function WeekdayChart({ report }: { report: Report }): React.JSX.Element {
  const [ref, width] = useChartWidth()
  // 2026-11-01 is a Sunday, so weekday n is 1 November plus n days.
  const name = (weekday: number): string => weekdayShort(addDays('2026-11-01', weekday))
  const data = report.byWeekday.map((day) => ({ ...day, name: name(day.weekday) }))
  return (
    <div ref={ref}>
      {width > 0 && (
        <BarChart
          width={width}
          height={180}
          data={data}
          margin={{ top: 4, right: 0, bottom: 0, left: -18 }}
        >
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="name"
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
          />
          <YAxis
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
          />
          <Tooltip
            cursor={{ fill: 'var(--accent)' }}
            content={
              <ChartTooltip
                render={(row) => (
                  <div>
                    {row.name}: {row.completed} completed
                  </div>
                )}
              />
            }
          />
          <Bar
            dataKey="completed"
            fill="var(--chart-done)"
            radius={[4, 4, 0, 0]}
            maxBarSize={24}
            isAnimationActive={false}
          />
        </BarChart>
      )}
    </div>
  )
}

function Categories({ report }: { report: Report }): React.JSX.Element {
  // Unlike the totals, which are fixed when each day closes, this reflects where tasks are now:
  // a missed task moved to a later day counts there.
  if (report.categories.length === 0) {
    return <p className="text-muted-foreground text-sm">No tasks are dated in this period.</p>
  }
  const most = Math.max(...report.categories.map((category) => category.due))
  return (
    <>
      <ul className="space-y-2.5">
        {report.categories.map((category) => (
          <li key={category.id ?? 'none'} className="text-sm">
            <div className="mb-1 flex items-center gap-2">
              <span
                className="size-2 rounded-full"
                style={{ background: category.color ?? 'var(--muted-foreground)' }}
              />
              <span className="min-w-0 flex-1 truncate">{category.name}</span>
              <span className="text-muted-foreground text-xs tabular-nums">
                {category.done} of {category.due} done
              </span>
            </div>
            <div
              className="bg-muted h-1.5 overflow-hidden rounded-full"
              title={`${category.done} of ${category.due} done`}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(category.due / most) * 100}%`,
                  background: `linear-gradient(to right, ${category.color ?? 'var(--muted-foreground)'} ${(category.done / category.due) * 100}%, color-mix(in oklch, ${category.color ?? 'var(--muted-foreground)'} 30%, transparent) 0)`
                }}
              />
            </div>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground mt-4 text-xs">
        Tasks dated in this period, as they are now.
      </p>
    </>
  )
}
