import { useEffect, useState } from 'react'
import { CircleAlert, CircleCheck, Monitor, Moon, Sun } from 'lucide-react'
import { toast } from 'sonner'
import type { ApiFailure, VoiceStatus } from '@shared/ipc'
import type { PageSettingsPatch, Theme, VoiceProvider } from '@shared/schemas'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Kbd, KbdGroup } from '@renderer/components/ui/kbd'
import { Switch } from '@renderer/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@renderer/components/ui/toggle-group'
import { acceleratorFor } from '@renderer/lib/hotkey'
import { cn } from '@renderer/lib/utils'
import { useApp } from '@renderer/stores/app'
import { attempt } from '../features/tasks/actions'
import { modKey, quickAddKeys } from './nav'

function Row({
  label,
  hint,
  children,
  htmlFor
}: {
  label: string
  hint?: React.ReactNode
  children: React.ReactNode
  htmlFor?: string
}) {
  return (
    <div className="flex items-center justify-between gap-6 px-4 py-3.5">
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="block text-sm font-medium">
          {label}
        </label>
        {hint && <div className="text-muted-foreground mt-0.5 text-xs">{hint}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2" aria-label={title}>
      <h2 className="text-muted-foreground px-1 text-xs font-medium">{title}</h2>
      <div className="bg-card divide-border divide-y rounded-xl border">{children}</div>
    </section>
  )
}

const save = (patch: PageSettingsPatch): Promise<unknown> =>
  attempt(() => window.api.settings.update(patch))

const selectClass =
  'bg-background border-input focus-visible:border-ring focus-visible:ring-ring/40 h-8 rounded-md border px-2 text-sm outline-none focus-visible:ring-2'

export function SettingsView(): React.JSX.Element {
  const settings = useApp((state) => state.settings)
  const info = useApp((state) => state.info)

  return (
    <div className="mx-auto max-w-[680px] px-10 pt-2 pb-16">
      <h1 className="mb-8 text-[26px] font-semibold tracking-tight">Settings</h1>
      <div className="space-y-8">
        <Group title="Appearance">
          <Row label="Theme" hint="Every Bunty window follows this.">
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={settings.theme}
              aria-label="Theme"
              onValueChange={(value) => value && void save({ theme: value as Theme })}
            >
              <ToggleGroupItem value="system" className="gap-1.5 px-3">
                <Monitor /> System
              </ToggleGroupItem>
              <ToggleGroupItem value="light" className="gap-1.5 px-3">
                <Sun /> Light
              </ToggleGroupItem>
              <ToggleGroupItem value="dark" className="gap-1.5 px-3">
                <Moon /> Dark
              </ToggleGroupItem>
            </ToggleGroup>
          </Row>
        </Group>

        <Group title="Calendar">
          <Row label="Week starts on">
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={settings.weekStart}
              aria-label="Week starts on"
              onValueChange={(value) =>
                value && void save({ weekStart: value as PageSettingsPatch['weekStart'] })
              }
            >
              <ToggleGroupItem value="monday" className="px-3">
                Monday
              </ToggleGroupItem>
              <ToggleGroupItem value="sunday" className="px-3">
                Sunday
              </ToggleGroupItem>
            </ToggleGroup>
          </Row>
          <Row label="Color tasks by" hint="Also switchable from the calendar itself.">
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={settings.calendarColorBy}
              aria-label="Color tasks by"
              onValueChange={(value) =>
                value &&
                void save({ calendarColorBy: value as PageSettingsPatch['calendarColorBy'] })
              }
            >
              <ToggleGroupItem value="category" className="px-3">
                Category
              </ToggleGroupItem>
              <ToggleGroupItem value="priority" className="px-3">
                Priority
              </ToggleGroupItem>
            </ToggleGroup>
          </Row>
        </Group>

        <Group title="Quick add">
          <HotkeyRow />
        </Group>

        <VoiceGroup />

        <Group title="Notifications">
          <Row label="Task reminders" hint="For tasks with a time." htmlFor="reminders">
            <select
              id="reminders"
              className={selectClass}
              value={settings.reminderMinutes === null ? 'off' : String(settings.reminderMinutes)}
              onChange={(event) => {
                const value = event.currentTarget.value
                void save({ reminderMinutes: value === 'off' ? null : Number(value) })
              }}
            >
              <option value="off">Off</option>
              <option value="0">At the time</option>
              {[5, 10, 15, 30, 60].map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes === 60 ? '1 hour before' : `${minutes} minutes before`}
                </option>
              ))}
            </select>
          </Row>
          <Row label="End-of-day summary" hint="How many of today’s tasks are still open.">
            {settings.dailySummaryTime !== null && (
              <input
                type="time"
                aria-label="Summary time"
                value={settings.dailySummaryTime}
                onChange={(event) =>
                  event.currentTarget.value &&
                  void save({ dailySummaryTime: event.currentTarget.value })
                }
                className={cn(selectClass, 'tabular-nums')}
              />
            )}
            <Switch
              aria-label="End-of-day summary"
              checked={settings.dailySummaryTime !== null}
              onCheckedChange={(on) => void save({ dailySummaryTime: on ? '21:00' : null })}
            />
          </Row>
        </Group>

        <Group title="Desktop widget">
          <Row label="Show widget" hint="Today’s tasks on your desktop, out of the taskbar.">
            <Switch
              aria-label="Show widget"
              checked={settings.widgetVisible}
              onCheckedChange={(on) => void save({ widgetVisible: on })}
            />
          </Row>
          <Row label="Always on top">
            <Switch
              aria-label="Always on top"
              checked={settings.widgetAlwaysOnTop}
              onCheckedChange={(on) => void save({ widgetAlwaysOnTop: on })}
            />
          </Row>
          <Row label="Lock position" hint="Stops it being moved or resized by accident.">
            <Switch
              aria-label="Lock position"
              checked={settings.widgetLocked}
              onCheckedChange={(on) => void save({ widgetLocked: on })}
            />
          </Row>
          <Row label="Background" htmlFor="widget-opacity">
            <input
              id="widget-opacity"
              type="range"
              min={30}
              max={100}
              step={5}
              value={Math.round(settings.widgetOpacity * 100)}
              onChange={(event) =>
                void save({ widgetOpacity: Number(event.currentTarget.value) / 100 })
              }
              className="w-36 accent-[var(--primary)]"
            />
            <span className="text-muted-foreground w-9 text-right text-xs tabular-nums">
              {Math.round(settings.widgetOpacity * 100)}%
            </span>
          </Row>
        </Group>

        <Group title="System">
          <Row
            label="Open Bunty when Windows starts"
            hint="It starts quietly in the tray, with the widget if it’s on. Installed app only."
          >
            <Switch
              aria-label="Open Bunty when Windows starts"
              checked={settings.launchAtStartup}
              onCheckedChange={(on) => void save({ launchAtStartup: on })}
            />
          </Row>
          <Row
            label="Keep running when closed"
            hint="Closing the window leaves Bunty in the tray, so reminders keep coming."
          >
            <Switch
              aria-label="Keep running when closed"
              checked={settings.closeToTray}
              onCheckedChange={(on) => void save({ closeToTray: on })}
            />
          </Row>
        </Group>

        <DataGroup />

        <Group title="About">
          <Row label="Bunty" hint="Your tasks are stored only on this computer.">
            <span className="text-muted-foreground text-sm tabular-nums">
              {info ? `v${info.version}` : ''}
            </span>
          </Row>
        </Group>
      </div>
    </div>
  )
}

function HotkeyRow(): React.JSX.Element {
  const info = useApp((state) => state.info)
  const accelerator = useApp((state) => state.settings.quickAddHotkey)
  const [recording, setRecording] = useState(false)
  const registered = info?.quickAddShortcut.registered ?? true

  return (
    <Row
      label="Shortcut from any app"
      hint={
        recording
          ? 'Press the new shortcut, with Ctrl, Alt or Win. Esc cancels.'
          : !registered
            ? 'Another app is using this shortcut. Pick a different one.'
            : 'Opens a small window to add a task without switching apps.'
      }
    >
      {recording ? (
        <button
          autoFocus
          onBlur={() => setRecording(false)}
          onKeyDown={async (event) => {
            event.preventDefault()
            event.stopPropagation()
            if (event.key === 'Escape') {
              setRecording(false)
              return
            }
            const next = acceleratorFor(event, info?.platform)
            if (!next) return
            setRecording(false)
            try {
              await window.api.settings.update({ quickAddHotkey: next })
              // Whether it registered lives in app info, so read that again.
              useApp.setState({ info: await window.api.app.info() })
              toast.success('Shortcut changed')
            } catch (err) {
              toast.error((err as ApiFailure).message)
            }
          }}
          className="border-primary/60 bg-primary/8 text-primary h-8 animate-pulse rounded-md border border-dashed px-3 text-xs font-medium"
        >
          Press keys…
        </button>
      ) : (
        <>
          <KbdGroup className={cn(!registered && 'opacity-50')}>
            {quickAddKeys(accelerator, modKey(info?.platform)).map((key) => (
              <Kbd key={key}>{key}</Kbd>
            ))}
          </KbdGroup>
          <Button variant="outline" size="sm" onClick={() => setRecording(true)}>
            Change
          </Button>
        </>
      )}
    </Row>
  )
}

const LANGUAGES = [
  ['', 'Detect automatically'],
  ['en', 'English'],
  ['ur', 'Urdu'],
  ['hi', 'Hindi'],
  ['ar', 'Arabic'],
  ['es', 'Spanish'],
  ['fr', 'French'],
  ['de', 'German']
] as const

function VoiceGroup(): React.JSX.Element {
  const settings = useApp((state) => state.settings)
  const [status, setStatus] = useState<VoiceStatus | null>(null)
  const [key, setKey] = useState('')

  // Readiness depends on files and the saved key, so it's asked for rather than worked out here.
  useEffect(() => {
    let current = true
    window.api.voice
      .status()
      .then((next) => current && setStatus(next))
      .catch(() => {})
    return () => {
      current = false
    }
  }, [settings.voiceProvider, settings.whisperPath, settings.whisperModel])

  // Bunty saves the chosen file itself: a page can't name a program for it to run.
  const browse = (kind: 'program' | 'model'): Promise<unknown> =>
    attempt(() => window.api.voice.browse(kind))

  const fileName = (path: string): string => path.split(/[\\/]/).pop() ?? path

  return (
    <Group title="Voice input">
      <Row label="Transcribe with">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={settings.voiceProvider}
          aria-label="Transcribe with"
          onValueChange={(value) => value && void save({ voiceProvider: value as VoiceProvider })}
        >
          <ToggleGroupItem value="openai" className="px-3">
            OpenAI
          </ToggleGroupItem>
          <ToggleGroupItem value="local" className="px-3">
            On this PC
          </ToggleGroupItem>
          <ToggleGroupItem value="off" className="px-3">
            Off
          </ToggleGroupItem>
        </ToggleGroup>
      </Row>

      {settings.voiceProvider === 'openai' && (
        <Row
          label="OpenAI API key"
          hint={
            status?.hasKey
              ? 'Saved, encrypted by Windows. Recordings are sent to OpenAI to be transcribed.'
              : 'From platform.openai.com. Recordings are sent to OpenAI to be transcribed.'
          }
          htmlFor="openai-key"
        >
          {status?.hasKey ? (
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                const next = await attempt(() => window.api.voice.setApiKey(null))
                if (next) setStatus(next)
              }}
            >
              Remove key
            </Button>
          ) : (
            <form
              className="flex items-center gap-2"
              onSubmit={async (event) => {
                event.preventDefault()
                const next = await attempt(() => window.api.voice.setApiKey(key))
                if (next) {
                  setStatus(next)
                  setKey('')
                  toast.success('Key saved')
                }
              }}
            >
              <Input
                id="openai-key"
                type="password"
                autoComplete="off"
                placeholder="sk-…"
                value={key}
                onChange={(event) => setKey(event.currentTarget.value)}
                className="h-8 w-52"
              />
              <Button type="submit" size="sm" disabled={!key.trim()}>
                Save
              </Button>
            </form>
          )}
        </Row>
      )}

      {settings.voiceProvider === 'local' && (
        <>
          <Row
            label="whisper.cpp program"
            hint={
              settings.whisperPath
                ? fileName(settings.whisperPath)
                : 'whisper-cli.exe from a whisper.cpp release.'
            }
          >
            <Button variant="outline" size="sm" onClick={() => void browse('program')}>
              Choose…
            </Button>
          </Row>
          <Row
            label="Model"
            hint={
              settings.whisperModel
                ? fileName(settings.whisperModel)
                : 'For example ggml-base.en.bin.'
            }
          >
            <Button variant="outline" size="sm" onClick={() => void browse('model')}>
              Choose…
            </Button>
          </Row>
        </>
      )}

      {settings.voiceProvider !== 'off' && (
        <>
          <Row label="Language" htmlFor="voice-language">
            <select
              id="voice-language"
              className={selectClass}
              value={settings.voiceLanguage}
              onChange={(event) => void save({ voiceLanguage: event.currentTarget.value })}
            >
              {LANGUAGES.map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </Row>
          {status && (
            <div
              role="status"
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-xs',
                status.ready ? 'text-success' : 'text-muted-foreground'
              )}
            >
              {status.ready ? (
                <CircleCheck className="size-3.5" />
              ) : (
                <CircleAlert className="size-3.5" />
              )}
              {status.ready ? 'Ready. Click the mic in any add box.' : status.problem}
            </div>
          )}
        </>
      )}
    </Group>
  )
}

function DataGroup(): React.JSX.Element {
  return (
    <Group title="Data">
      <Row label="Back up" hint="Everything except your API key, as one JSON file.">
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            const path = await attempt(() => window.api.backup.export())
            if (path) {
              toast.success('Backup saved', {
                description: path,
                action: { label: 'Show in folder', onClick: () => void window.api.app.reveal(path) }
              })
            }
          }}
        >
          Back up…
        </Button>
      </Row>
      <Row
        label="Restore"
        hint="Replaces everything with a backup. Your current data is kept as a copy first."
      >
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            const result = await attempt(() => window.api.backup.import())
            if (result) toast.success(`Restored ${result.tasks} tasks`)
          }}
        >
          Restore…
        </Button>
      </Row>
    </Group>
  )
}
