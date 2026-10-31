import { useCallback, useEffect, useRef, useState } from 'react'
import type { Task } from '@shared/ipc'
import { OPEN } from '../tasks/sections'

interface Loaded {
  key: string
  ranged: Task[]
  undated: Task[]
}

/**
 * Everything dated within the visible range, plus open tasks with no date (which can be dragged
 * onto the calendar). Reloads whenever anything changes, in any window.
 */
export function useCalendarTasks(from: string, to: string) {
  const [state, setState] = useState<Loaded | null>(null)
  const key = `${from}:${to}`
  const loader = useRef<() => Promise<void>>(async () => {})

  useEffect(() => {
    let current = true
    const load = async (): Promise<void> => {
      const [ranged, undated] = await Promise.all([
        window.api.tasks.list({ from, to }),
        window.api.tasks.list({ unscheduled: true, statuses: OPEN })
      ])
      if (current) setState({ key, ranged, undated })
    }
    loader.current = load
    void load()
    const stops = [
      window.api.on('tasks:changed', () => void load()),
      window.api.on('categories:changed', () => void load())
    ]
    return () => {
      current = false
      stops.forEach((stop) => stop())
    }
  }, [key, from, to])

  const reload = useCallback(() => loader.current(), [])
  const fresh = state?.key === key
  return {
    ranged: fresh ? state.ranged : [],
    undated: state?.undated ?? [],
    loaded: fresh,
    /** Resolves once the screen reflects the database. */
    reload
  }
}

export interface Move {
  date: string | null
  /** Left out to keep the task's time. */
  time?: string | null
}

/**
 * Shows a dropped task in its new place straight away, and keeps it there until the reload that
 * follows the save has landed, so it never flickers back to where it came from.
 */
export function usePendingMoves(reload: () => Promise<void>) {
  const [moves, setMoves] = useState<ReadonlyMap<string, Move>>(new Map())

  const apply = useCallback(
    (task: Task): Task => {
      const move = moves.get(task.id)
      if (!move) return task
      return { ...task, date: move.date, time: move.time === undefined ? task.time : move.time }
    },
    [moves]
  )

  const run = useCallback(
    async (task: Task, move: Move, save: () => Promise<unknown>): Promise<void> => {
      setMoves((current) => new Map(current).set(task.id, move))
      await save()
      await reload()
      setMoves((current) => {
        const next = new Map(current)
        next.delete(task.id)
        return next
      })
    },
    [reload]
  )

  return { apply, run }
}
