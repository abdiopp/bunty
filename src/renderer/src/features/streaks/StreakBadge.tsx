import { Flame } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import { useStreakSummary } from './use-streaks'

/** The current daily streak, shown only once there is one. */
export function StreakBadge({ compact = false }: { compact?: boolean }): React.JSX.Element | null {
  const summary = useStreakSummary()
  if (!summary || summary.current === 0) return null
  const label = `${summary.current}-day streak (best ${summary.longest})`
  return (
    <span
      title={label}
      aria-label={label}
      className={cn(
        'flex items-center gap-1 rounded-full bg-orange-500/12 font-semibold text-orange-600 tabular-nums dark:text-orange-400',
        compact ? 'px-1.5 py-px text-[11px]' : 'px-2 py-0.5 text-xs'
      )}
    >
      <Flame className={cn('fill-current', compact ? 'size-3' : 'size-3.5')} />
      {summary.current}
    </span>
  )
}
