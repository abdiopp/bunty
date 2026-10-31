import { ArrowRight, CalendarX2, Star, Sunrise } from 'lucide-react'
import { addDays, fromLocalDate, nextMonday, toLocalDate } from '@shared/dates'
import { Calendar } from '@renderer/components/ui/calendar'
import { Kbd } from '@renderer/components/ui/kbd'
import { dayLabel } from '@renderer/lib/format'
import { cn } from '@renderer/lib/utils'
import { useApp } from '@renderer/stores/app'

/** Quick picks plus a calendar. Past days can't be chosen. */
export function DateChoices({
  value,
  today,
  allowNone,
  onPick
}: {
  value: string | null
  today: string
  allowNone: boolean
  onPick: (date: string | null) => void
}): React.JSX.Element {
  const weekStart = useApp((state) => state.settings.weekStart)
  const nextWeek = nextMonday(today)
  // On a Sunday next week starts tomorrow; don't offer the same day twice.
  const choices = [
    { key: 't', label: 'Today', date: today, icon: <Star className="text-today" /> },
    { key: 'm', label: 'Tomorrow', date: addDays(today, 1), icon: <Sunrise /> },
    {
      key: 'w',
      label: `Next week · ${dayLabel(nextWeek, today)}`,
      date: nextWeek,
      icon: <ArrowRight />
    }
  ].filter((choice, index, all) => all.findIndex((other) => other.date === choice.date) === index)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col">
        {choices.map((choice) => (
          <button
            key={choice.key}
            type="button"
            onClick={() => onPick(choice.date)}
            className={cn(
              'hover:bg-accent flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm [&_svg]:size-4',
              value === choice.date && 'bg-accent font-medium'
            )}
          >
            {choice.icon}
            <span className="flex-1">{choice.label}</span>
            <Kbd>{choice.key.toUpperCase()}</Kbd>
          </button>
        ))}
        {allowNone && (
          <button
            type="button"
            onClick={() => onPick(null)}
            className="hover:bg-accent text-muted-foreground flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm [&_svg]:size-4"
          >
            <CalendarX2 />
            <span className="flex-1">No date</span>
            <Kbd>N</Kbd>
          </button>
        )}
      </div>
      <div className="border-border border-t pt-1">
        <Calendar
          mode="single"
          weekStartsOn={weekStart === 'monday' ? 1 : 0}
          selected={value ? fromLocalDate(value) : undefined}
          defaultMonth={fromLocalDate(value && value >= today ? value : today)}
          disabled={{ before: fromLocalDate(today) }}
          onSelect={(day) => day && onPick(toLocalDate(day))}
          className="p-0 [--cell-size:--spacing(8)]"
        />
      </div>
    </div>
  )
}
