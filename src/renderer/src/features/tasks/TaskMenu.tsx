// One menu definition, rendered as a right-click menu or a "…" dropdown.
import {
  ArrowRight,
  CalendarDays,
  CalendarX2,
  Check,
  Circle,
  Flag,
  PanelRightOpen,
  Pencil,
  Star,
  Sunrise,
  Tag,
  Trash2
} from 'lucide-react'
import { addDays, nextMonday } from '@shared/dates'
import type { Task } from '@shared/ipc'
import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger
} from '@renderer/components/ui/context-menu'
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from '@renderer/components/ui/dropdown-menu'
import { dayLabel } from '@renderer/lib/format'
import { useApp } from '@renderer/stores/app'
import { useUi } from '@renderer/stores/ui'
import { taskActions } from './actions'

const PARTS = {
  context: {
    Item: ContextMenuItem,
    Separator: ContextMenuSeparator,
    Shortcut: ContextMenuShortcut,
    Sub: ContextMenuSub,
    SubTrigger: ContextMenuSubTrigger,
    SubContent: ContextMenuSubContent
  },
  dropdown: {
    Item: DropdownMenuItem,
    Separator: DropdownMenuSeparator,
    Shortcut: DropdownMenuShortcut,
    Sub: DropdownMenuSub,
    SubTrigger: DropdownMenuSubTrigger,
    SubContent: DropdownMenuSubContent
  }
} as const

const PRIORITIES = [
  { value: 'high', label: 'High', key: '1', className: 'text-priority-high' },
  { value: 'medium', label: 'Medium', key: '2', className: 'text-priority-medium' },
  { value: 'low', label: 'Low', key: '3', className: 'text-priority-low' }
] as const

export function TaskMenuItems({
  task,
  today,
  kind
}: {
  task: Task
  today: string
  kind: keyof typeof PARTS
}): React.JSX.Element {
  const { Item, Separator, Shortcut, Sub, SubTrigger, SubContent } = PARTS[kind]
  const categories = useApp((state) => state.categories)
  const ui = useUi.getState
  const done = task.status === 'done'
  const repeats = task.seriesId !== null
  const tomorrow = addDays(today, 1)
  const nextWeek = nextMonday(today)

  return (
    <>
      <Item onSelect={() => void taskActions.toggle(task)}>
        {done ? <Circle /> : <Check />}
        {done ? 'Mark as not done' : 'Complete'}
        <Shortcut>X</Shortcut>
      </Item>
      <Item onSelect={() => ui().openDetail(task.id)}>
        <PanelRightOpen />
        Open details
        <Shortcut>↵</Shortcut>
      </Item>
      <Item onSelect={() => ui().set({ renamingId: task.id, selectedId: task.id })}>
        <Pencil />
        Rename
        <Shortcut>F2</Shortcut>
      </Item>
      <Separator />

      <Sub>
        <SubTrigger disabled={done}>
          <CalendarDays />
          {done ? 'Reopen to reschedule' : 'Reschedule'}
        </SubTrigger>
        <SubContent>
          {task.date !== today && (
            <Item onSelect={() => void taskActions.schedule(task, today)}>
              <Star className="text-today" />
              Today
            </Item>
          )}
          {task.date !== tomorrow && (
            <Item onSelect={() => void taskActions.schedule(task, tomorrow)}>
              <Sunrise />
              Tomorrow
            </Item>
          )}
          {/* On a Sunday next week starts tomorrow; don't offer the same day twice. */}
          {task.date !== nextWeek && nextWeek !== tomorrow && (
            <Item onSelect={() => void taskActions.schedule(task, nextWeek)}>
              <ArrowRight />
              Next week
              <Shortcut>{dayLabel(nextWeek, today)}</Shortcut>
            </Item>
          )}
          <Item onSelect={() => ui().set({ rescheduling: [task.id] })}>
            <CalendarDays />
            Pick date…
            <Shortcut>D</Shortcut>
          </Item>
          {!repeats && task.date && (
            <Item onSelect={() => void taskActions.schedule(task, null)}>
              <CalendarX2 />
              Remove date
            </Item>
          )}
        </SubContent>
      </Sub>

      <Sub>
        <SubTrigger>
          <Flag />
          Priority
        </SubTrigger>
        <SubContent>
          {PRIORITIES.map((priority) => (
            <Item
              key={priority.value}
              onSelect={() => void taskActions.setPriority(task, priority.value)}
            >
              <Flag className={priority.className} />
              {priority.label}
              {task.priority === priority.value ? <Check className="ml-auto" /> : null}
              <Shortcut>{priority.key}</Shortcut>
            </Item>
          ))}
        </SubContent>
      </Sub>

      <Sub>
        <SubTrigger>
          <Tag />
          Category
        </SubTrigger>
        <SubContent>
          <Item onSelect={() => void taskActions.setCategory(task, null)}>
            <span className="border-muted-foreground size-2 rounded-full border" />
            None
            {task.categoryId === null ? <Check className="ml-auto" /> : null}
          </Item>
          {categories.map((category) => (
            <Item
              key={category.id}
              onSelect={() => void taskActions.setCategory(task, category.id)}
            >
              <span className="size-2 rounded-full" style={{ background: category.color }} />
              {category.name}
              {task.categoryId === category.id ? <Check className="ml-auto" /> : null}
            </Item>
          ))}
          <Separator />
          <Item onSelect={() => ui().set({ categoryDialog: {} })}>New category…</Item>
        </SubContent>
      </Sub>

      <Separator />
      {repeats ? (
        <Sub>
          <SubTrigger className="text-destructive">
            <Trash2 />
            Delete
          </SubTrigger>
          <SubContent>
            <Item variant="destructive" onSelect={() => void taskActions.remove(task, 'this')}>
              This occurrence
              <Shortcut>Del</Shortcut>
            </Item>
            <Item variant="destructive" onSelect={() => void taskActions.remove(task, 'following')}>
              This and all later ones
            </Item>
          </SubContent>
        </Sub>
      ) : (
        <Item variant="destructive" onSelect={() => void taskActions.remove(task)}>
          <Trash2 />
          Delete
          <Shortcut>Del</Shortcut>
        </Item>
      )}
    </>
  )
}
