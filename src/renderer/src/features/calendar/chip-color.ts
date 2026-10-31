import type { Category, Task } from '@shared/ipc'
import type { Settings } from '@shared/schemas'

/** The color an entry carries: its category's, or its priority's. */
export function chipColor(
  task: Task,
  colorBy: Settings['calendarColorBy'],
  categories: Category[]
): string | undefined {
  if (colorBy === 'priority') return `var(--priority-${task.priority})`
  return categories.find((category) => category.id === task.categoryId)?.color
}
