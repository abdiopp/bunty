import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from 'react'
import { AlertCircle, CalendarDays, Flag, Repeat2, Tag, X } from 'lucide-react'
import type { Category, Task } from '@shared/ipc'
import type { Token } from '@shared/quick-add'
import { dayLabel, timeLabel } from '@renderer/lib/format'
import { cn } from '@renderer/lib/utils'
import { useApp } from '@renderer/stores/app'
import { describeRepeat } from './describe-repeat'
import type { QuickAddController } from './use-quick-add'

const TOKEN_TINT: Record<Token['kind'], string> = {
  when: 'bg-primary/15',
  recurrence: 'bg-primary/15',
  priority: 'bg-priority-high/15',
  category: 'bg-success/18'
}

interface Props {
  controller: QuickAddController
  today: string
  placeholder: string
  /** Bigger text, for the popup. */
  large?: boolean
  onSubmitted?: (task: Task) => void
  onEscape?: () => void
  className?: string
}

export interface QuickAddInputHandle {
  focus: () => void
}

/**
 * A plain input with a highlight layer behind it: recognised words get a tint, so you can see
 * what will become the date or category while you type. The chips below say how each was read.
 */
export const QuickAddInput = forwardRef<QuickAddInputHandle, Props>(function QuickAddInput(
  { controller, today, placeholder, large, onSubmitted, onEscape, className },
  ref
) {
  const input = useRef<HTMLInputElement>(null)
  const backdrop = useRef<HTMLDivElement>(null)
  const { draft } = controller
  useImperativeHandle(ref, () => ({ focus: () => input.current?.focus() }))

  // The input scrolls sideways once the text is long; the highlights have to follow.
  const syncScroll = (): void => {
    if (backdrop.current && input.current) backdrop.current.scrollLeft = input.current.scrollLeft
  }
  useLayoutEffect(syncScroll, [draft.text])

  const text = cn(large ? 'text-lg' : 'text-sm', 'px-0 py-0 tracking-normal')

  return (
    <div className={cn('flex flex-col', className)}>
      <div className="relative min-w-0">
        <div
          ref={backdrop}
          aria-hidden
          className={cn(
            text,
            'pointer-events-none absolute inset-0 overflow-hidden whitespace-pre text-transparent'
          )}
        >
          <Highlights text={draft.text} tokens={draft.parsed.tokens} />
        </div>
        <input
          ref={input}
          aria-label="New task"
          placeholder={placeholder}
          value={draft.text}
          spellCheck={false}
          onChange={(event) => controller.setText(event.currentTarget.value)}
          onScroll={syncScroll}
          onSelect={syncScroll}
          onKeyDown={async (event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              const task = await controller.submit()
              if (task) onSubmitted?.(task)
            } else if (event.key === 'Escape') {
              event.preventDefault()
              if (draft.text) controller.reset()
              else onEscape?.()
            }
          }}
          className={cn(
            text,
            'placeholder:text-muted-foreground/70 relative w-full bg-transparent outline-none'
          )}
        />
      </div>
      <Chips controller={controller} today={today} />
    </div>
  )
})

function Highlights({ text, tokens }: { text: string; tokens: Token[] }): React.JSX.Element {
  const parts: React.ReactNode[] = []
  let at = 0
  for (const token of tokens) {
    parts.push(text.slice(at, token.start))
    parts.push(
      <mark
        key={token.start}
        className={cn('rounded-[3px] text-transparent', TOKEN_TINT[token.kind])}
      >
        {text.slice(token.start, token.end)}
      </mark>
    )
    at = token.end
  }
  parts.push(text.slice(at))
  return <>{parts}</>
}

function Chips({
  controller,
  today
}: {
  controller: QuickAddController
  today: string
}): React.JSX.Element | null {
  const categories = useApp((state) => state.categories)
  const { draft, dismiss } = controller
  const { parsed } = draft
  const chips: React.ReactNode[] = []
  if (!draft.text.trim()) return null

  if (draft.date) {
    const past = draft.problem === 'past'
    chips.push(
      <Chip
        key="when"
        icon={past ? <AlertCircle /> : <CalendarDays />}
        tone={past ? 'danger' : 'default'}
        hint={draft.dateIsDefault ? 'from this view' : undefined}
        onDismiss={() => dismiss(draft.dateIsDefault ? 'defaultDate' : 'when')}
      >
        {dayLabel(draft.date, today)}
        {parsed.time && ` · ${timeLabel(parsed.time)}`}
        {past && ' has passed'}
      </Chip>
    )
  }
  if (parsed.recurrence) {
    chips.push(
      <Chip key="repeat" icon={<Repeat2 />} onDismiss={() => dismiss('recurrence')}>
        {describeRepeat(parsed.recurrence, draft.date ?? today)}
      </Chip>
    )
  }
  if (parsed.priority) {
    chips.push(
      <Chip
        key="priority"
        icon={<Flag className={`text-priority-${parsed.priority}`} />}
        onDismiss={() => dismiss('priority')}
      >
        {parsed.priority[0].toUpperCase() + parsed.priority.slice(1)} priority
      </Chip>
    )
  }
  if (draft.newCategory) {
    chips.push(
      <Chip key="category" icon={<Tag />} tone="new" onDismiss={() => dismiss('category')}>
        New category “{draft.newCategory}”
      </Chip>
    )
  } else if (draft.categoryId) {
    const category = categories.find((item: Category) => item.id === draft.categoryId)
    if (category) {
      chips.push(
        <Chip
          key="category"
          icon={<span className="size-2 rounded-full" style={{ background: category.color }} />}
          hint={draft.categoryIsDefault ? 'from this view' : undefined}
          onDismiss={() => dismiss(draft.categoryIsDefault ? 'defaultCategory' : 'category')}
        >
          {category.name}
        </Chip>
      )
    }
  }

  if (!chips.length) return null
  return (
    <div role="status" aria-label="Recognised" className="mt-2 flex flex-wrap gap-1.5">
      {chips}
    </div>
  )
}

function Chip({
  icon,
  children,
  tone = 'default',
  hint,
  onDismiss
}: {
  icon: React.ReactNode
  children: React.ReactNode
  tone?: 'default' | 'danger' | 'new'
  hint?: string
  onDismiss: () => void
}): React.JSX.Element {
  return (
    <span
      title={hint}
      className={cn(
        'animate-in fade-in-0 zoom-in-95 flex h-6 items-center gap-1.5 rounded-full border pr-1 pl-2 text-xs duration-150 [&_svg]:size-3.5',
        tone === 'danger' && 'border-overdue/40 text-overdue bg-overdue/5',
        tone === 'new' && 'border-dashed',
        tone === 'default' && 'bg-muted/60',
        hint && 'text-muted-foreground'
      )}
    >
      {icon}
      {children}
      <button
        type="button"
        aria-label="Don’t use this"
        tabIndex={-1}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onDismiss}
        className="hover:bg-foreground/10 grid size-4 place-items-center rounded-full [&_svg]:size-3"
      >
        <X />
      </button>
    </span>
  )
}
