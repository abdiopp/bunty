import { useEffect, useState } from 'react'
import { toLocalDate } from '@shared/dates'

/** Today's local date, updated at midnight and whenever the window regains focus. */
export function useToday(): string {
  const [today, setToday] = useState(() => toLocalDate(new Date()))

  useEffect(() => {
    const refresh = (): void => setToday(toLocalDate(new Date()))
    const now = new Date()
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1)
    const timer = setTimeout(refresh, midnight.getTime() - now.getTime())
    window.addEventListener('focus', refresh)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [today])

  return today
}
