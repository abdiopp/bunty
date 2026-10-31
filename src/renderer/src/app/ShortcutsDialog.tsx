import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Kbd, KbdGroup } from '@renderer/components/ui/kbd'
import { useApp } from '@renderer/stores/app'
import { useUi } from '@renderer/stores/ui'
import { modKey, quickAddKeys } from './nav'

export function ShortcutsDialog(): React.JSX.Element {
  const open = useUi((state) => state.shortcutsOpen)
  const platform = useApp((state) => state.info?.platform)
  const quickAdd = useApp((state) => state.info?.quickAddShortcut.accelerator)
  const mod = modKey(platform)

  const groups: [string, [string[], string][]][] = [
    [
      'Anywhere',
      [
        [quickAddKeys(quickAdd, mod), 'Quick add from any app'],
        [[mod, 'K'], 'Search and commands'],
        [['N'], 'New task'],
        [[mod, '1–7'], 'Today, Upcoming, Calendar, Inbox, Completed, Streaks, Reports'],
        [[mod, ','], 'Settings'],
        [['?'], 'This list']
      ]
    ],
    [
      'Selected task',
      [
        [['↑', '↓'], 'Move up and down (or J, K)'],
        [['↵'], 'Open details'],
        [['X'], 'Complete or reopen (or Space)'],
        [['F2'], 'Rename (or E)'],
        [['D'], 'Reschedule'],
        [['1', '2', '3'], 'Priority high, medium, low'],
        [['Del'], 'Delete, with undo'],
        [['Esc'], 'Close details, then deselect']
      ]
    ],
    [
      'Calendar',
      [
        [['←', '→'], 'Previous or next day'],
        [['↑', '↓'], 'Same day last or next week'],
        [['[', ']'], 'Previous or next month, week or day'],
        [['T'], 'Go to today'],
        [['M', 'W', 'D'], 'Month, week or day view'],
        [['↵'], 'Open the selected day']
      ]
    ],
    [
      'In the date picker',
      [
        [['T'], 'Today'],
        [['M'], 'Tomorrow'],
        [['W'], 'Next week'],
        [['N'], 'No date']
      ]
    ]
  ]

  return (
    <Dialog open={open} onOpenChange={(next) => useUi.getState().set({ shortcutsOpen: next })}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Bunty is built to be used without the mouse.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 sm:grid-cols-2">
          {groups.map(([title, rows]) => (
            <section key={title} className={title === 'Anywhere' ? 'sm:col-span-2' : undefined}>
              <h3 className="text-muted-foreground mb-2 text-xs font-medium">{title}</h3>
              <dl className="space-y-1.5 text-sm">
                {rows.map(([keys, label]) => (
                  <div key={label} className="flex items-center justify-between gap-4">
                    <dt>{label}</dt>
                    <dd>
                      <KbdGroup>
                        {keys.map((key) => (
                          <Kbd key={key}>{key}</Kbd>
                        ))}
                      </KbdGroup>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
