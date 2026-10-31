import type { Category } from '@shared/ipc'

/** Colors for new categories, picked in order so neighbours look different. */
export const CATEGORY_COLORS = [
  '#5b6cf0',
  '#e5484d',
  '#f5a524',
  '#30a46c',
  '#0ea5e9',
  '#a855f7',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#71717a'
]

export function nextCategoryColor(categories: Category[]): string {
  const used = new Set(categories.map((category) => category.color.toLowerCase()))
  return (
    CATEGORY_COLORS.find((color) => !used.has(color)) ??
    CATEGORY_COLORS[categories.length % CATEGORY_COLORS.length]
  )
}

/** "#side-project" matches "Side project": case, spaces and dashes don't matter. */
export function findCategory(categories: Category[], typed: string): Category | undefined {
  const key = (name: string): string => name.toLowerCase().replace(/[\s_-]+/g, '')
  return categories.find((category) => key(category.name) === key(typed))
}
