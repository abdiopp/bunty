# Bunty: architecture

A private, local-first task manager for the Windows desktop, built with Electron, React and SQLite. All data stays on the machine. The only network call in the whole app is the optional OpenAI Whisper request for voice input.

All nine phases of the brief are built. `README.md` covers running, testing and building.

## 1. Stack

| Concern | Choice | Notes |
| --- | --- | --- |
| Shell | Electron 45 | Sandboxed, context-isolated pages; hardened with fuses when packaged |
| Build | electron-vite 6, Vite 8 | One config for main, preload and renderer |
| UI | React 19, TypeScript 5.9, Tailwind 4, shadcn/ui (`radix-nova` style) | Radix underneath, for keyboard and focus handling |
| State | Zustand 5 | The database stays the source of truth |
| Storage | SQLite via better-sqlite3 13 | Node-API prebuilds, so no compile step per Electron version |
| Validation | zod 4 | **Added to your list**: checks every IPC request in main |
| Natural language | chrono-node 2 | Plus Bunty's own rules for repeats, priority and #categories |
| Drag and drop | @dnd-kit/core 6 | Stable for two years; the newer `@dnd-kit/react` is still 0.x |
| Charts | Recharts 3 | Colours checked with a colour-blindness validator, light and dark |
| Voice | OpenAI Whisper API, or whisper.cpp | Audio is recorded as 16 kHz WAV, which both read without ffmpeg |
| Motion, type, icons | auto-animate, Inter (bundled), lucide | Inter ships with the app, so it looks the same everywhere and offline |
| Packaging | electron-builder 26 | NSIS installer for Windows x64 |
| Tests | Vitest 5, Playwright 1.64 | Unit tests run on Electron's own Node; end-to-end tests drive the built app |

TypeScript stays on 5.9 rather than 7 because the official electron-vite template and its tooling are still on 5.9.

shadcn's newest style imports class merging from a package called `cn`, which was published two days before this was built as a 0.x release. Bunty uses the long-standing `clsx` + `tailwind-merge` pair instead, in `lib/utils.ts`. The variant CSS the components need is copied into `styles/shadcn.css` rather than installing the whole shadcn CLI as a dependency.

Only `better-sqlite3`, `zod` and `chrono-node` are runtime dependencies: everything the pages use is bundled by Vite, so it isn't shipped twice in the installer.

## 2. Folder structure

```text
bunty/
├─ electron.vite.config.ts        build config for all three processes
├─ electron-builder.yml           Windows installer, fuses, what ships
├─ .github/workflows/windows.yml  tests and builds on a real Windows machine
├─ build/                         installer icon (icon.ico, icon.png)
├─ resources/                     app, tray and notification icons, shipped beside the app
├─ docs/ARCHITECTURE.md
├─ src/
│  ├─ shared/                     imported by every process, no Node or DOM APIs
│  │  ├─ dates.ts                 local-date and week/month helpers
│  │  ├─ ipc.ts                   the IPC contract: channels, events, types, Api
│  │  ├─ quick-add.ts             natural-language parser, shared by every way of adding
│  │  └─ schemas.ts               zod schemas, and the types inferred from them
│  ├─ main/                       Node side: owns the database and all business rules
│  │  ├─ index.ts                 composition root: services, routes, shell, scheduler
│  │  ├─ shell.ts                 windows, tray, close-to-tray, hotkey, notifications, login item
│  │  ├─ tray.ts                  the tray icon and its menu
│  │  ├─ scheduler.ts             midnight rollover, reminders, end-of-day summary
│  │  ├─ secrets.ts               the OpenAI key, encrypted with the OS keystore
│  │  ├─ backup-files.ts          backup and restore dialogs
│  │  ├─ exported-files.ts        files the app wrote, which a page may reveal in Explorer
│  │  ├─ security.ts              sender checks, navigation and permission lockdown
│  │  ├─ clock.ts, errors.ts, recurrence.ts
│  │  ├─ db/                      connection, migrations, task and activity SQL
│  │  ├─ services/
│  │  │  ├─ task-service.ts       task rules: status, reschedule, recurrence
│  │  │  ├─ category-service.ts, settings-service.ts
│  │  │  ├─ rollover.ts           closes finished days, writes the day ledger
│  │  │  ├─ streak-service.ts     daily and per-habit streaks, heatmap
│  │  │  ├─ reminders.ts          due reminders and the daily summary
│  │  │  ├─ voice-service.ts      OpenAI Whisper or whisper.cpp
│  │  │  ├─ report-service.ts     report figures
│  │  │  └─ backup-service.ts     JSON export, validated restore
│  │  ├─ reports/                 CSV and PDF export
│  │  ├─ ipc/                     dispatch (validate, run, wrap), routes, broadcast
│  │  └─ windows/                 main window, quick-add popup, widget, resource paths
│  ├─ preload/                    the typed bridge, exposed as window.api
│  └─ renderer/
│     ├─ index.html               strict Content-Security-Policy
│     └─ src/
│        ├─ main.tsx              one page; #quick-add and #widget render those windows
│        ├─ main.css              design tokens, light and dark
│        ├─ App.tsx               the shell: sidebar, title bar, view, detail panel
│        ├─ app/                  sidebar, command palette, settings, keyboard map
│        ├─ features/
│        │  ├─ tasks/             list, row, menus, detail panel, date picker
│        │  ├─ quick-add/         input with highlighting, in-app bar, popup
│        │  ├─ calendar/          month grid, time grid, side panel, drag and drop
│        │  ├─ widget/            the desktop widget
│        │  ├─ streaks/           streaks view, heatmap, badges
│        │  ├─ voice/             recording, WAV encoding, mic button, confirmation card
│        │  ├─ reports/           overview charts, history feed
│        │  └─ categories/
│        ├─ components/           shadcn components (generated, then owned), error boundary
│        ├─ stores/, hooks/, lib/ app data and UI state, loading, formatting, hotkeys
│        └─ styles/shadcn.css     variants the ui/ components rely on
└─ tests/
   ├─ unit/                       services, parser, migrations, reports, backup, against real SQLite
   ├─ e2e/                        drives the built app: tasks, calendar, voice, widget, system
   └─ fixtures/                   a stand-in whisper.cpp for the voice tests
```

## 3. Database schema

The database is `bunty.sqlite` in Electron's `userData` folder, opened in WAL mode with foreign keys on. Tables are `STRICT`, so SQLite enforces column types.

**Dates.** `date` is a local `YYYY-MM-DD` string and `time` a local `HH:mm` string. A task due on the 3rd stays due on the 3rd whatever the clock or timezone does. Only `*_at` timestamps are UTC.

```sql
CREATE TABLE categories (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  color      TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE task_series (                 -- template for a recurring task
  id                   TEXT PRIMARY KEY,
  title                TEXT NOT NULL,
  notes                TEXT NOT NULL DEFAULT '',
  time                 TEXT,
  priority             TEXT NOT NULL DEFAULT 'medium',  -- low | medium | high
  category_id          TEXT REFERENCES categories(id) ON DELETE SET NULL,
  recurrence           TEXT NOT NULL,      -- daily | weekly | custom
  weekdays             INTEGER NOT NULL,   -- bitmask, Sunday = 1 … Saturday = 64
  start_date           TEXT NOT NULL,
  end_date             TEXT,
  materialized_through TEXT NOT NULL,      -- occurrences exist up to this date
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL
) STRICT;

CREATE TABLE tasks (
  id               TEXT PRIMARY KEY,
  title            TEXT NOT NULL,
  notes            TEXT NOT NULL DEFAULT '',
  date             TEXT,                 -- NULL = unscheduled
  time             TEXT,
  priority         TEXT NOT NULL DEFAULT 'medium',  -- low | medium | high
  category_id      TEXT REFERENCES categories(id) ON DELETE SET NULL,
  status           TEXT NOT NULL DEFAULT 'pending', -- pending | done | missed | rescheduled
  series_id        TEXT REFERENCES task_series(id),
  occurrence_date  TEXT,                 -- the series slot; survives a reschedule
  original_date    TEXT,                 -- first date ever assigned
  reschedule_count INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  completed_at     TEXT,
  missed_at        TEXT,                 -- never cleared once set
  reminded_at      TEXT,                 -- stops a reminder firing twice
  deleted_at       TEXT                  -- soft delete
) STRICT;
-- Unique index on (series_id, occurrence_date), plus indexes on date and status.

CREATE TABLE activity_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id    TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  task_title TEXT NOT NULL,              -- snapshot
  action     TEXT NOT NULL,              -- created | completed | reopened | missed |
                                         -- edited | rescheduled | deleted | restored
  from_date  TEXT,                       -- reschedules
  to_date    TEXT,
  changes    TEXT,                       -- JSON: {"field": [before, after]}
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE day_ledger (                -- one row per finished day, written once
  date         TEXT PRIMARY KEY,
  due_count    INTEGER NOT NULL,
  done_count   INTEGER NOT NULL,
  missed_count INTEGER NOT NULL,
  closed_at    TEXT NOT NULL
) STRICT;

CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,              -- JSON
  updated_at TEXT NOT NULL
) STRICT;
```

### Your task model, mapped

| Your field | Where it lives |
| --- | --- |
| id, title, notes, date, time, priority, status | `tasks` |
| category/tag | `tasks.category_id` → `categories`, which also holds the calendar color |
| recurrence | `task_series`, shown on each task as `Task.recurrence` |
| created_at, completed_at, original_date | `tasks` |

### Migrations

Files are numbered `0001_initial.sql`, `0002_…` with no gaps, and are bundled into the app. The current version is stored in `PRAGMA user_version`. On launch:

1. Pending migrations each run in their own transaction, so a failure leaves the database at the last good version.
2. An existing database is snapshotted first to `bunty.sqlite.v<N>.bak`.
3. A database from a newer app version is refused, rather than risk damaging it.
4. If the database can't be opened, the app shows an error and stops rather than opening a window that can't save.

## 4. Behaviour decisions

These are the rules where your brief left room for interpretation.

- **Recurring tasks are real rows.** Each occurrence is a row in `tasks`, generated 30 days ahead by default and up to a year ahead as the calendar pages forward. Streaks, reschedules and history then work the same way as for one-off tasks. Generation only ever moves forward, so a deleted occurrence doesn't come back.
- **`rescheduled` means "open, but moved".** Open tasks are `pending` or `rescheduled`. When a rescheduled task's new date passes, it becomes `missed` like any other.
- **Overdue means `missed`.** After the midnight rollover, every open task with a past date is `missed`. Those are the overdue tasks the widget shows and bulk-reschedule moves.
- **No scheduling into the past.** Creating or moving a task onto a past date is refused.
- **A date with no time is fine, a time with no date is not.** Tasks can have no date at all. Giving one its first date is an edit, not a reschedule.
- **Moving within the same day is an edit.** Changing only the time doesn't count as a reschedule, so it won't inflate "most rescheduled".
- **Done tasks can't be moved.** Reopen first. Title and notes can still be edited.
- **Deleting is soft.** Deleted tasks are hidden but kept, so the history stays intact and undo works.
- **Days with nothing due don't affect the streak.** They neither extend nor break it. Otherwise a day off would cost you your streak.
- **The past can't be rewritten.** Each finished day is recorded once in `day_ledger`, and `missed_at` is never cleared. Finishing or moving a missed task later clears it from your list, but the day stays broken. Without this, bulk-rescheduling overdue tasks would quietly repair your streak. A per-task streak counts an occurrence only if it is `done` and was never missed.
- **Editing a series.** An edit changes one occurrence by default. The `following` scope changes this and later open occurrences, and leaves finished ones alone.

### Quick add

- **What it reads.** Dates and times ("tomorrow at 5pm", "next friday", "in 3 days", "on the 5th", "20/11"), repeats ("daily", "every weekday", "every mon, wed and fri"), priority (`!high`, `!!`, `p1`) and `#category`. A `#tag` that matches no category creates one on save. Matching ignores case and spaces, so `#side-project` finds "Side project".
- **Hours without am/pm.** 1 to 6 mean the afternoon ("call at 5"), 7 to 11 the morning ("gym at 7"). A time that has already passed today means tomorrow.
- **Your region decides slash dates.** `05/11` is 5 November in a day-first region like Pakistan, and May 11 in the US. The region comes from the OS, not the display language.
- **Words that aren't dates stay words.** "Sun cream", "sat nav", "March on" and "now" are left alone. Text in quotes is never parsed, and any recognised part can be dismissed from the preview, which puts its words back in the title.
- **Defaults depend on where you add.** In Today a task is due today, in a category it gets that category, and the global popup uses neither, so it lands in Inbox.
- **No monthly repeats.** Your task model has daily, weekly and custom days only, so "every month" stays in the title.

### The interface

- **Ticked tasks pause before moving.** A completed task stays in place for 0.7 s before moving to Completed, whether ticked by mouse, keyboard or the detail panel.
- **"Next week" means next Monday.** On a Sunday that's tomorrow, so the option is hidden to avoid offering the same day twice.
- **Undo is offered for single deletes.** Deleting "this and later" occurrences of a series can't be undone from the toast.
- **Notes save when you leave the field.** Saving on every keystroke would fill the history with edits.
- **Rendering errors don't blank the window.** An error boundary offers a reload; your data lives in the main process and isn't lost.

### Calendar

- **Three views.** Month, week and day. The calendar reopens in the view you last used.
- **Selecting a day.** Click a day, or use the arrow keys, to see its tasks in the side panel and add to it. Past days are read-only.
- **Dropping on a day keeps the time.** In week and day views, dropping on an hour sets the time from the task's top edge, snapped to 15 minutes. Dropping in the all-day row clears the time.
- **The No date list.** It sits under the side panel. Dragging from it gives a task its first date, and dragging a one-off task onto it removes the date. Repeating tasks can't lose their date.
- **What can't be dragged.** Past days don't accept drops, and finished tasks can't be dragged. Both are things the service refuses anyway, so the calendar doesn't offer them.
- **Drops show immediately.** A dropped task appears in its new place straight away and stays there until the database confirms, so it never flickers back.
- **Every entry is half an hour tall.** Tasks have a time but no duration, so overlapping ones sit side by side in lanes.
- **Colors.** By category or by priority, switched from the toolbar or Settings. Overdue entries get a dashed red outline and finished ones fade.
- **Week start.** Monday by default, changeable in Settings. The date picker follows it too.
- **How far ahead.** Repeating tasks are generated up to a year ahead, so the calendar shows them that far.

### Desktop widget

- **What it shows.** Today's open and overdue tasks, tickable in place. Clicking a title opens the task in the main window.
- **Where it sits.** Out of the taskbar, below other windows unless "Always on top" is on, and where you left it. If that spot is no longer on any screen, it returns to the top-right corner.
- **Transparency and size.** The window is transparent and only its card is painted, at the opacity you choose. Windows can't resize transparent windows from their edges, so the widget has its own resize grip, hidden when the position is locked.
- **Placement.** Electron can't pin a window into the desktop layer itself, so the widget is an ordinary window that stays out of the way.
- **Closing it** (Alt+F4) is the same as switching it off, so the tray and Settings stay in step.

### The midnight rollover and streaks

- **When days close.** At local midnight, on launch, on waking from sleep and every half minute, every finished day since the last run is closed. Open tasks become `missed` with a log entry, and the day's totals go into the ledger once. Days the PC was off are caught up, up to 400 days back.
- **Daily streak.** Consecutive days where everything due was done. Today counts as soon as it's all done, and never breaks a streak while it's in progress.
- **Per-habit streaks.** Each repeating task's streak counts occurrences done on time. A missed occurrence finished later still counts as missed.
- **Heatmap.** The last year, coloured by the share of each day's tasks that were done.

### Reminders and notifications

- **Reminders.** A timed task gets one notification, a set number of minutes before (10 by default). Moving the task re-arms it. A reminder more than an hour late, because Bunty was closed, is skipped rather than announced.
- **End-of-day summary.** Once a day after the chosen time (21:00 by default), if any of today's tasks are still open.
- **Clicking a notification** opens the task, or the app. Bunty holds on to each one until it's clicked or dismissed, since one that's been garbage-collected ignores clicks from the Action Center.

### Voice input

- **Recording.** In the page, up to two minutes. It's converted to 16 kHz mono WAV there, so neither OpenAI nor whisper.cpp needs ffmpeg.
- **Transcription.** In the main process: OpenAI's `whisper-1` with your key, or whisper.cpp run as a local program on a temporary file that's deleted afterwards. The program and model are set only through Bunty's own file picker, never by a page.
- **Confirmation.** The words are read with the quick-add parser, plus spoken priority ("high priority"), and shown as an editable card. It uses native date and time inputs, whose pickers open as OS popups and so aren't clipped by the small quick-add window.

### Reports

- **Periods.** Day, week or month. Finished days come from the ledger, today is live, and days ahead count as nothing yet.
- **Figures.** Completion rate (done of due), completed and missed by day, completions by weekday, by category, and the most rescheduled tasks. The totals are fixed as each day closes; the category breakdown shows tasks where they are now, so a missed task moved to a later day counts there.
- **History.** Every recorded action, filterable by kind.
- **Exports.** CSV of the period's tasks, and a PDF of the report. CSV cells that look like formulas are prefixed so spreadsheets keep them as text.

### Tray, startup and backup

- **The tray** opens Bunty, opens quick add, shows or hides the widget, and quits. Closing the window keeps Bunty in the tray, which you can turn off. The first time, a notification says so.
- **Launch at startup** starts Bunty in the tray, with the widget if it's on.
- **Backups** are JSON files of every table except encrypted secrets. A restore is checked first (format, schema version, known columns, readable settings), confirmed, preceded by a safety copy of the database, and applied in one transaction that rolls back if anything doesn't fit.

## 5. Security model

| Layer | Measure |
| --- | --- |
| Renderer | `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, strict CSP |
| Bridge | Each `window.api` method is listed by hand. No raw `ipcRenderer` is exposed, and events are allow-listed |
| IPC | Every request is checked for sender (top frame of our own page) and validated with zod. Unknown fields are rejected |
| Errors | Expected failures carry a code and a safe message. Unexpected ones are logged in main and shown only as a generic message |
| Navigation | Windows can't navigate away or open others. `https` links go to the default browser |
| Permissions | Everything is refused except the microphone, audio only, for our own pages |
| SQL | Values are always bound parameters. Column names come only from typed code, or are checked against the table's real columns (restore) |
| OpenAI key | Encrypted with Electron `safeStorage` (Windows DPAPI). Never sent to a page, never exported, used only from main |
| Programs it runs | Only whisper.cpp, and only a path chosen in main's own file picker. `settings.update` from a page refuses those two fields |
| Exports | CSV cells that start like formulas are made inert. The PDF is rendered from escaped HTML in a window with scripts off. Only files the app just wrote can be revealed in Explorer |
| Packaged app | Fuses turn off `ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS` and the inspector, and check app.asar's integrity. The default menu, with its reload and DevTools shortcuts, is removed |
| Possible next step | Pages load from `file://`, which keeps Electron's extra `file://` privileges switched on. Serving them from a custom `app://` protocol would let that fuse be turned off too |

## 6. IPC contract

`src/shared/ipc.ts` is the single definition. Adding a channel there causes a compile error until it has a route in main and a method on the bridge.

Every call goes through the same path: `window.api.x()` → preload → sender check → zod validation → handler → `{ ok, data }` or `{ ok: false, error }`. Failures reject with a plain `{ code, message }` object, because `contextBridge` strips custom properties from `Error`.

### Calls

| `window.api` method | Request | Returns |
| --- | --- | --- |
| `tasks.list` | `{ from?, to?, statuses?, categoryId?, unscheduled?, search?, orderBy?, limit? }` | `Task[]` |
| `tasks.get`, `tasks.complete`, `tasks.reopen`, `tasks.restore` | `id` | `Task` |
| `tasks.create` | `{ title, notes?, date?, time?, priority?, categoryId?, recurrence? }` | `Task` |
| `tasks.update` | `{ id, patch, scope? }` | `Task` |
| `tasks.reschedule` | `{ id, date, time? }` | `Task` |
| `tasks.rescheduleOverdue` | `{ date, ids? }` | `Task[]` |
| `tasks.remove` | `{ id, scope? }` | nothing |
| `tasks.counts` | nothing | `{ today, doneToday, overdue, inbox }` |
| `categories.list` / `create` / `update` / `remove` | nothing / `{ name, color }` / `{ id, patch }` / `id` | `Category[]` / `Category` / `Category` / nothing |
| `activity.list` | `{ taskId?, actions?, before?, limit? }` | `ActivityEntry[]` |
| `settings.get` / `settings.update` | nothing / any subset of `Settings` except the whisper.cpp paths | `Settings` |
| `streaks.summary` | nothing | `{ current, longest, today, series[] }` |
| `streaks.heatmap` | nothing | `{ date, due, done }[]` |
| `reports.summary` | `{ period, anchor }` | `Report` |
| `reports.exportCsv`, `reports.exportPdf` | `{ period, anchor }` | path, or null if cancelled |
| `voice.status` | nothing | `{ provider, ready, hasKey, problem? }` |
| `voice.setApiKey` | key, or null to remove | status |
| `voice.transcribe` | WAV bytes (up to 25 MB) | `{ text }` |
| `voice.browse` | `'program'` or `'model'` | path, or null. Main saves the choice itself |
| `backup.export` / `backup.import` | nothing | path / `{ tasks }`, or null if cancelled |
| `app.info` | nothing | `{ version, platform, locale, dayFirst, quickAddShortcut }` |
| `app.openTask`, `app.show`, `app.reveal` | id / nothing / exported path | nothing |
| `quickAdd.open`, `quickAdd.close`, `quickAdd.resize` | nothing / nothing / height | nothing |
| `widget.resize` | `{ width, height }` | nothing |

`recurrence` is `{ kind: 'none' | 'daily' | 'weekly' }` or `{ kind: 'custom', weekdays: number[] }`, with 0 = Sunday. `scope` is `'this'` (the default) or `'following'`.

### Events (main to all windows)

| Event | Payload | Meaning |
| --- | --- | --- |
| `tasks:changed` | `{ ids }` | Sent after a change commits. Every window reloads, which keeps the main window, widget and popup in step |
| `categories:changed` | nothing | Categories changed |
| `settings:changed` | `Settings` | A setting changed; the theme itself is applied in main |
| `day:rolledOver` | `{ date }` | A new day began and the previous ones were closed |
| `quickAdd:opened` | nothing | Sent only to the popup when the hotkey opens it, so it starts fresh |
| `app:showTask` | id | Sent to the main window to open a task, from the widget or a notification |

Subscribe with `const stop = window.api.on('tasks:changed', handler)`.

### Error codes

`VALIDATION`, `NOT_FOUND`, `PAST_DATE`, `TASK_CLOSED`, `DATE_REQUIRED`, `NOT_RECURRING`, `NAME_TAKEN`, `HOTKEY_TAKEN`, `VOICE_SETUP`, `VOICE_FAILED`, `SECURE_STORAGE`, `BACKUP_INVALID`, `FORBIDDEN`, `INTERNAL`.

## 7. Build order

| # | Phase | Status |
| --- | --- | --- |
| 1 | DB + task CRUD | Done |
| 2 | Main UI + quick add | Done |
| 3 | Calendar | Done |
| 4 | Desktop widget | Done |
| 5 | Streaks + scheduler | Done |
| 6 | Voice input | Done |
| 7 | Reports | Done |
| 8 | Tray, notifications, startup | Done |
| 9 | Packaging | Done |

## 8. Developing on a Mac for Windows

Everything was built and tested on a Mac. The Windows installer is built from the Mac too: better-sqlite3 ships a prebuilt `win32-x64` binary, and electron-builder makes NSIS installers without Wine.

Some things only behave for real on Windows: the tray, toast notifications, launch at startup, the native title-bar buttons, how the widget and popup take focus, and the installer itself. `.github/workflows/windows.yml` runs the whole test suite on a Windows machine and attaches the installer, which is the way to check them.

Installing needs no Python or C++ compiler. When installing from a lockfile, npm tries to run `node-gyp` for better-sqlite3 even though it has a prebuilt binary, and that fails on a machine with no build tools. The project's `.npmrc` sets `ignore-scripts=true` to prevent this. Because install scripts are off, `npm run dev` and `npm start` fetch Electron themselves on first run.

The installer isn't code-signed, so Windows SmartScreen warns on first run until it is.

## 9. Keyboard shortcuts

| Keys | Action |
| --- | --- |
| Ctrl+Shift+Space | Quick add from any app (change it in Settings) |
| Ctrl+K, or / | Search tasks, lists and commands |
| N | New task |
| Ctrl+1 to 7, Ctrl+, | Today, Upcoming, Calendar, Inbox, Completed, Streaks, Reports, Settings |
| ↑ ↓ or J K | Move through tasks |
| Enter | Open details |
| X or Space | Complete or reopen |
| F2 or E | Rename |
| D | Reschedule; then T today, M tomorrow, W next week, N no date |
| 1, 2, 3 | Priority high, medium, low |
| Delete | Delete, with undo |
| Esc | Close details, then deselect |
| ? | Show all shortcuts |

In the calendar:

| Keys | Action |
| --- | --- |
| ← → | Previous or next day |
| ↑ ↓ | Same day last or next week |
| [ ] | Previous or next month, week or day |
| T | Today |
| M, W, D | Month, week or day view |
| Enter | Open the selected day |
