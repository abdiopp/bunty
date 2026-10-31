import { Plus, Search } from 'lucide-react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from '@renderer/components/ui/context-menu'
import { Kbd } from '@renderer/components/ui/kbd'
import { cn } from '@renderer/lib/utils'
import { useApp } from '@renderer/stores/app'
import { sameView, useUi, type View } from '@renderer/stores/ui'
import { INSIGHTS, modKey, NAV, SETTINGS_NAV } from './nav'

function NavItem({
  view,
  label,
  icon,
  badge,
  count
}: {
  view: View
  label: string
  icon: React.ReactNode
  badge?: number
  count?: number
}): React.JSX.Element {
  const active = useUi((state) => sameView(state.view, view))
  return (
    <button
      onClick={() => useUi.getState().setView(view)}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-sm transition-colors [&_svg]:size-4 [&_svg]:shrink-0',
        active ? 'bg-sidebar-accent font-medium' : 'hover:bg-sidebar-accent/60'
      )}
    >
      {icon}
      <span className="flex-1 truncate">{label}</span>
      {badge ? (
        <span className="bg-overdue rounded-full px-1.5 text-[11px] leading-[18px] font-semibold text-white tabular-nums">
          {badge}
        </span>
      ) : null}
      {count ? <span className="text-muted-foreground text-xs tabular-nums">{count}</span> : null}
    </button>
  )
}

export function Sidebar(): React.JSX.Element {
  const counts = useApp((state) => state.counts)
  const categories = useApp((state) => state.categories)
  const platform = useApp((state) => state.info?.platform)

  return (
    <nav
      aria-label="Sidebar"
      className="bg-sidebar border-sidebar-border flex w-[232px] shrink-0 flex-col border-r"
    >
      {/* Leaves room for the macOS window buttons and gives the window something to drag by. */}
      <div className="drag h-11 shrink-0" />

      <div className="space-y-0.5 px-3">
        {NAV.map((entry) => (
          <NavItem
            key={entry.label}
            {...entry}
            badge={entry.view.kind === 'today' ? counts.overdue : undefined}
            count={
              entry.view.kind === 'today'
                ? counts.today
                : entry.view.kind === 'inbox'
                  ? counts.inbox
                  : undefined
            }
          />
        ))}
      </div>

      <div className="mt-6 min-h-0 flex-1 overflow-y-auto px-3">
        <div className="text-muted-foreground mb-1 flex h-6 items-center justify-between px-2 text-xs font-medium">
          Categories
          <button
            aria-label="New category"
            onClick={() => useUi.getState().set({ categoryDialog: {} })}
            className="hover:bg-sidebar-accent hover:text-foreground grid size-5 place-items-center rounded"
          >
            <Plus className="size-3.5" />
          </button>
        </div>
        {categories.length === 0 && (
          <p className="text-muted-foreground/80 px-2 py-1 text-xs leading-relaxed">
            Type <span className="text-foreground font-medium">#work</span> in a new task to make
            one.
          </p>
        )}
        <div className="space-y-0.5">
          {categories.map((category) => (
            <ContextMenu key={category.id}>
              <ContextMenuTrigger asChild>
                <div>
                  <NavItem
                    view={{ kind: 'category', id: category.id }}
                    label={category.name}
                    icon={
                      <span
                        className="m-1 size-2 rounded-full"
                        style={{ background: category.color }}
                      />
                    }
                  />
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem
                  onSelect={() => useUi.getState().set({ categoryDialog: { id: category.id } })}
                >
                  Edit…
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          ))}
        </div>
      </div>

      <div className="space-y-0.5 px-3 pt-2">
        {INSIGHTS.map((entry) => (
          <NavItem key={entry.label} {...entry} />
        ))}
      </div>

      <div className="space-y-0.5 px-3 pt-2 pb-3">
        <button
          onClick={() => useUi.getState().set({ paletteOpen: true })}
          className="text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-sm [&_svg]:size-4"
        >
          <Search />
          <span className="flex-1 text-left">Search</span>
          <Kbd>{modKey(platform)} K</Kbd>
        </button>
        <NavItem {...SETTINGS_NAV} />
      </div>
    </nav>
  )
}
