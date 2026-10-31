// The IPC contract. Adding a channel here forces a compile error until it has both a route in
// src/main/ipc/routes.ts and a method on the bridge in src/preload/index.ts.
import type {
  ActivityAction,
  ActivityQuery,
  NewCategory,
  NewTask,
  Priority,
  Recurrence,
  RemoveTask,
  ReportQuery,
  RescheduleOverdue,
  RescheduleTask,
  Settings,
  PageSettingsPatch,
  TaskQuery,
  TaskStatus,
  UpdateCategory,
  UpdateTask
} from './schemas'

export interface Task {
  id: string
  title: string
  notes: string
  /** Local YYYY-MM-DD, or null while unscheduled. */
  date: string | null
  /** Local HH:mm. */
  time: string | null
  priority: Priority
  categoryId: string | null
  status: TaskStatus
  recurrence: Recurrence
  seriesId: string | null
  /** The slot in the series this task fills. Unlike `date`, it survives a reschedule. */
  occurrenceDate: string | null
  /** The first date this task was ever given. */
  originalDate: string | null
  rescheduleCount: number
  createdAt: string
  updatedAt: string
  completedAt: string | null
  missedAt: string | null
}

export interface Category {
  id: string
  name: string
  color: string
  createdAt: string
}

export interface ActivityEntry {
  id: number
  taskId: string | null
  taskTitle: string
  action: ActivityAction
  fromDate: string | null
  toDate: string | null
  changes: Record<string, [unknown, unknown]> | null
  createdAt: string
}

export interface TaskCounts {
  /** Open tasks due today. */
  today: number
  /** Tasks due today that are already done. */
  doneToday: number
  /** Open tasks whose date has passed. */
  overdue: number
  /** Open tasks with no date. */
  inbox: number
}

export interface SeriesStreak {
  seriesId: string
  title: string
  categoryId: string | null
  recurrence: Recurrence
  /** False once the series has been stopped. */
  active: boolean
  current: number
  longest: number
  /** The latest occurrences, oldest first. */
  recent: ('done' | 'missed' | 'pending')[]
}

export interface StreakSummary {
  /** Days in a row with everything due done; days with nothing due are skipped. */
  current: number
  longest: number
  today: { due: number; done: number }
  series: SeriesStreak[]
}

export interface HeatmapDay {
  date: string
  due: number
  done: number
}

export interface DayTotals {
  date: string
  due: number
  done: number
  missed: number
}

export interface Report {
  from: string
  to: string
  totals: {
    /** Due in the period up to today. */
    due: number
    done: number
    missed: number
    /** done / due, or null when nothing was due. */
    rate: number | null
    /** Tasks finished in the period, whatever their date. */
    completed: number
    rescheduled: number
    created: number
  }
  /** Every day of the period; days after today are zero. */
  days: DayTotals[]
  /** Completions by weekday, in week order starting from the week-start setting. */
  byWeekday: { weekday: number; completed: number }[]
  categories: { id: string | null; name: string; color: string | null; due: number; done: number }[]
  mostRescheduled: { taskId: string | null; title: string; moves: number }[]
}

export interface VoiceStatus {
  provider: 'off' | 'openai' | 'local'
  ready: boolean
  /** Whether an OpenAI key is saved; the key itself never leaves the main process. */
  hasKey: boolean
  /** What to fix before it can be used. */
  problem?: string
}

export interface AppInfo {
  version: string
  platform: NodeJS.Platform
  /** The region's format locale, e.g. en-PK, which can differ from the display language. */
  locale: string
  /** Read 05/11 as 5 November. */
  dayFirst: boolean
  quickAddShortcut: { accelerator: string; registered: boolean }
}

export interface Contract {
  'tasks:list': { req: TaskQuery; res: Task[] }
  'tasks:get': { req: string; res: Task }
  'tasks:create': { req: NewTask; res: Task }
  'tasks:update': { req: UpdateTask; res: Task }
  'tasks:complete': { req: string; res: Task }
  'tasks:reopen': { req: string; res: Task }
  'tasks:reschedule': { req: RescheduleTask; res: Task }
  'tasks:rescheduleOverdue': { req: RescheduleOverdue; res: Task[] }
  'tasks:remove': { req: RemoveTask; res: void }
  'tasks:restore': { req: string; res: Task }
  'categories:list': { req: void; res: Category[] }
  'categories:create': { req: NewCategory; res: Category }
  'categories:update': { req: UpdateCategory; res: Category }
  'categories:remove': { req: string; res: void }
  'activity:list': { req: ActivityQuery; res: ActivityEntry[] }
  'tasks:counts': { req: void; res: TaskCounts }
  'settings:get': { req: void; res: Settings }
  'settings:update': { req: PageSettingsPatch; res: Settings }
  'app:info': { req: void; res: AppInfo }
  'quickAdd:close': { req: void; res: void }
  'quickAdd:resize': { req: number; res: void }
  /** Opens the global quick-add popup, from the widget or tray. */
  'quickAdd:open': { req: void; res: void }
  /** The widget's own resize grip; transparent windows can't use native resize borders. */
  'widget:resize': { req: { width: number; height: number }; res: void }
  /** Brings the main window forward with a task's details open. */
  'app:openTask': { req: string; res: void }
  'app:show': { req: void; res: void }
  'streaks:summary': { req: void; res: StreakSummary }
  'streaks:heatmap': { req: void; res: HeatmapDay[] }
  'voice:status': { req: void; res: VoiceStatus }
  /** Saves (encrypted) or, with null, forgets the OpenAI key. */
  'voice:setApiKey': { req: string | null; res: VoiceStatus }
  /** 16 kHz mono WAV in, words out. */
  'voice:transcribe': { req: Uint8Array; res: { text: string } }
  /** Lets the user pick whisper.cpp's program or model file; returns the path, or null. */
  'voice:browse': { req: 'program' | 'model'; res: string | null }
  'reports:summary': { req: ReportQuery; res: Report }
  /** Asks where to save, then writes the file; null if cancelled. */
  'reports:exportCsv': { req: ReportQuery; res: string | null }
  'reports:exportPdf': { req: ReportQuery; res: string | null }
  /** Shows a file Bunty just exported in Explorer. Other paths are refused. */
  'app:reveal': { req: string; res: void }
  /** Saves everything (but secrets) to a JSON file; the path, or null if cancelled. */
  'backup:export': { req: void; res: string | null }
  /** Picks a backup, confirms, then replaces all data; null if cancelled. */
  'backup:import': { req: void; res: { tasks: number } | null }
}

export type Channel = keyof Contract

export type ErrorCode =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'PAST_DATE'
  | 'TASK_CLOSED'
  | 'DATE_REQUIRED'
  | 'NOT_RECURRING'
  | 'NAME_TAKEN'
  | 'HOTKEY_TAKEN'
  | 'VOICE_SETUP'
  | 'VOICE_FAILED'
  | 'SECURE_STORAGE'
  | 'BACKUP_INVALID'
  | 'FORBIDDEN'
  | 'INTERNAL'

/**
 * What a failed `window.api` call rejects with. It's a plain object rather than an Error
 * because contextBridge strips custom properties from Errors, which would lose `code`.
 */
export interface ApiFailure {
  code: ErrorCode
  message: string
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiFailure }

export interface Events {
  'tasks:changed': { ids: string[] }
  'categories:changed': void
  'settings:changed': Settings
  /** Sent to the quick-add popup each time it opens, so it can start fresh. */
  'quickAdd:opened': void
  /** Sent to the main window to show a task, e.g. after clicking it in the widget. */
  'app:showTask': string
  /** A new day began and the previous ones were closed. */
  'day:rolledOver': { date: string }
}

export type EventName = keyof Events

export const EVENT_NAMES = [
  'tasks:changed',
  'categories:changed',
  'settings:changed',
  'quickAdd:opened',
  'app:showTask',
  'day:rolledOver'
] as const satisfies EventName[]

type Call<C extends Channel> = Contract[C]['req'] extends void
  ? () => Promise<Contract[C]['res']>
  : (req: Contract[C]['req']) => Promise<Contract[C]['res']>

/** `window.api`, as seen by the renderer. */
export interface Api {
  tasks: {
    list: Call<'tasks:list'>
    get: Call<'tasks:get'>
    create: Call<'tasks:create'>
    update: Call<'tasks:update'>
    complete: Call<'tasks:complete'>
    reopen: Call<'tasks:reopen'>
    reschedule: Call<'tasks:reschedule'>
    rescheduleOverdue: Call<'tasks:rescheduleOverdue'>
    remove: Call<'tasks:remove'>
    restore: Call<'tasks:restore'>
    counts: Call<'tasks:counts'>
  }
  categories: {
    list: Call<'categories:list'>
    create: Call<'categories:create'>
    update: Call<'categories:update'>
    remove: Call<'categories:remove'>
  }
  activity: {
    list: Call<'activity:list'>
  }
  settings: {
    get: Call<'settings:get'>
    update: Call<'settings:update'>
  }
  app: {
    info: Call<'app:info'>
    openTask: Call<'app:openTask'>
    show: Call<'app:show'>
    reveal: Call<'app:reveal'>
  }
  quickAdd: {
    close: Call<'quickAdd:close'>
    /** Fits the popup window to its content height in pixels. */
    resize: Call<'quickAdd:resize'>
    open: Call<'quickAdd:open'>
  }
  widget: {
    resize: Call<'widget:resize'>
  }
  streaks: {
    summary: Call<'streaks:summary'>
    heatmap: Call<'streaks:heatmap'>
  }
  backup: {
    export: Call<'backup:export'>
    import: Call<'backup:import'>
  }
  reports: {
    summary: Call<'reports:summary'>
    exportCsv: Call<'reports:exportCsv'>
    exportPdf: Call<'reports:exportPdf'>
  }
  voice: {
    status: Call<'voice:status'>
    setApiKey: Call<'voice:setApiKey'>
    transcribe: Call<'voice:transcribe'>
    browse: Call<'voice:browse'>
  }
  /** Subscribes to a main-process event and returns the unsubscribe function. */
  on<E extends EventName>(event: E, listener: (payload: Events[E]) => void): () => void
}
