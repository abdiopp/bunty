import { useCallback, useState } from 'react'

/** The width charts should draw at, tracked as the window resizes. */
export function useChartWidth(): [
  (node: HTMLDivElement | null) => (() => void) | undefined,
  number
] {
  const [width, setWidth] = useState(0)
  const ref = useCallback((node: HTMLDivElement | null) => {
    if (!node) return undefined
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return [ref, width]
}
