import { describe, expect, it } from 'vitest'
import { heatmapGrid, level, WEEKS } from '@renderer/features/streaks/heatmap-grid'

describe('heatmap', () => {
  it('shades by the share of tasks done, and marks days where none were', () => {
    expect(level(0, 0)).toBe(0)
    expect(level(3, 0)).toBe(-1)
    expect(level(4, 1)).toBe(1)
    expect(level(4, 2)).toBe(2)
    expect(level(4, 3)).toBe(3)
    expect(level(4, 4)).toBe(4)
  })

  it('lays out 53 weeks ending with this one, days down each column, future days blank', () => {
    // Wednesday 4 November 2026, weeks starting Monday.
    const grid = heatmapGrid([{ date: '2026-11-04', due: 2, done: 2 }], '2026-11-04', 'monday')
    expect(grid).toHaveLength(WEEKS)
    const thisWeek = grid.at(-1)!
    expect(thisWeek.map((cell) => cell.date)).toEqual([
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
      '2026-11-08'
    ])
    expect(thisWeek[2]).toMatchObject({ level: 4, future: false })
    expect(thisWeek[3].future).toBe(true)
    expect(grid[0][0].date).toBe('2025-11-03')
  })

  it('starts each column on Sunday when the week does', () => {
    const grid = heatmapGrid([], '2026-11-04', 'sunday')
    expect(grid.at(-1)![0].date).toBe('2026-11-01')
  })
})
