// Runtime validation for everything crossing the IPC boundary. Types are inferred from these
// schemas, so the renderer and main process can't drift apart. Import this file with
// `import type` from the preload: the sandboxed preload can't load zod at runtime.
import { z } from 'zod'
import { isLocalDate, isLocalTime } from './dates'

export const LocalDate = z.string().refine(isLocalDate, 'Expected a real YYYY-MM-DD date')
export const LocalTime = z.string().refine(isLocalTime, 'Expected an HH:mm time')
export const Id = z.uuid()

export const Priority = z.enum(['low', 'medium', 'high'])
export type Priority = z.infer<typeof Priority>

export const TaskStatus = z.enum(['pending', 'done', 'missed', 'rescheduled'])
export type TaskStatus = z.infer<typeof TaskStatus>

const Weekday = z.number().int().min(0).max(6)

export const Recurrence = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('none') }),
  z.strictObject({ kind: z.literal('daily') }),
  // Repeats on the weekday of the task's date.
  z.strictObject({ kind: z.literal('weekly') }),
  z.strictObject({ kind: z.literal('custom'), weekdays: z.array(Weekday).min(1).max(7) })
])
export type Recurrence = z.infer<typeof Recurrence>

const Title = z.string().trim().min(1, 'Title is required').max(500)
const Notes = z.string().max(20_000)

export const NewTask = z.strictObject({
  title: Title,
  notes: Notes.optional(),
  date: LocalDate.nullable().optional(),
  time: LocalTime.nullable().optional(),
  priority: Priority.optional(),
  categoryId: Id.nullable().optional(),
  recurrence: Recurrence.optional()
})
export type NewTask = z.infer<typeof NewTask>

export const TaskPatch = z
  .strictObject({
    title: Title,
    notes: Notes,
    date: LocalDate.nullable(),
    time: LocalTime.nullable(),
    priority: Priority,
    categoryId: Id.nullable(),
    recurrence: Recurrence
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, 'Nothing to update')
export type TaskPatch = z.infer<typeof TaskPatch>

/** `this` touches one occurrence; `following` also changes the series from it onward. */
export const SeriesScope = z.enum(['this', 'following'])
export type SeriesScope = z.infer<typeof SeriesScope>

export const TaskQuery = z.strictObject({
  from: LocalDate.optional(),
  to: LocalDate.optional(),
  statuses: z.array(TaskStatus).optional(),
  categoryId: Id.optional(),
  unscheduled: z.boolean().optional(),
  search: z.string().trim().max(200).optional(),
  /** `schedule` (the default) sorts by date and time; `completed` puts the latest finished first. */
  orderBy: z.enum(['schedule', 'completed']).optional(),
  limit: z.number().int().min(1).max(1000).optional()
})
export type TaskQuery = z.infer<typeof TaskQuery>

export const UpdateTask = z.strictObject({
  id: Id,
  patch: TaskPatch,
  scope: SeriesScope.optional()
})
export type UpdateTask = z.infer<typeof UpdateTask>

export const RescheduleTask = z.strictObject({
  id: Id,
  date: LocalDate,
  time: LocalTime.nullable().optional()
})
export type RescheduleTask = z.infer<typeof RescheduleTask>

export const RescheduleOverdue = z.strictObject({
  date: LocalDate,
  // Omit to move every overdue task.
  ids: z.array(Id).optional()
})
export type RescheduleOverdue = z.infer<typeof RescheduleOverdue>

export const RemoveTask = z.strictObject({ id: Id, scope: SeriesScope.optional() })
export type RemoveTask = z.infer<typeof RemoveTask>

const Color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Expected a #rrggbb color')
const CategoryName = z.string().trim().min(1, 'Name is required').max(60)

export const NewCategory = z.strictObject({ name: CategoryName, color: Color })
export type NewCategory = z.infer<typeof NewCategory>

export const UpdateCategory = z.strictObject({
  id: Id,
  patch: z
    .strictObject({ name: CategoryName, color: Color })
    .partial()
    .refine((patch) => Object.keys(patch).length > 0, 'Nothing to update')
})
export type UpdateCategory = z.infer<typeof UpdateCategory>

export const ActivityAction = z.enum([
  'created',
  'completed',
  'reopened',
  'missed',
  'edited',
  'rescheduled',
  'deleted',
  'restored'
])
export type ActivityAction = z.infer<typeof ActivityAction>

export const ActivityQuery = z.strictObject({
  taskId: Id.optional(),
  actions: z.array(ActivityAction).optional(),
  // Pagination: pass the smallest `id` already seen to get the next, older page.
  before: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(500).optional()
})
export type ActivityQuery = z.infer<typeof ActivityQuery>

export const Theme = z.enum(['system', 'light', 'dark'])
export type Theme = z.infer<typeof Theme>

export const WeekStart = z.enum(['monday', 'sunday'])
export type WeekStart = z.infer<typeof WeekStart>

export const CalendarMode = z.enum(['month', 'week', 'day'])
export type CalendarMode = z.infer<typeof CalendarMode>

export const Bounds = z.strictObject({
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int().min(220).max(1600),
  height: z.number().int().min(160).max(1600)
})
export type Bounds = z.infer<typeof Bounds>

export const VoiceProvider = z.enum(['off', 'openai', 'local'])
export type VoiceProvider = z.infer<typeof VoiceProvider>

export const Settings = z.strictObject({
  theme: Theme,
  weekStart: WeekStart,
  /** What a calendar entry's color means. */
  calendarColorBy: z.enum(['category', 'priority']),
  /** The calendar opens the way you last left it. */
  calendarMode: CalendarMode,

  widgetVisible: z.boolean(),
  widgetAlwaysOnTop: z.boolean(),
  widgetLocked: z.boolean(),
  /** How opaque the widget's background is; text always stays solid. */
  widgetOpacity: z.number().min(0.3).max(1),
  /** Where the widget was left. Kept by the main process as it's moved or resized. */
  widgetBounds: Bounds.nullable(),

  launchAtStartup: z.boolean(),
  /** Closing the main window keeps Bunty running in the tray. */
  closeToTray: z.boolean(),
  /** An Electron accelerator, e.g. "CommandOrControl+Shift+Space". */
  quickAddHotkey: z.string().trim().min(1).max(60),

  /** Minutes before a timed task to remind you; null turns reminders off. */
  reminderMinutes: z.number().int().min(0).max(1440).nullable(),
  /** When to say how many of today's tasks are still open; null turns it off. */
  dailySummaryTime: LocalTime.nullable(),

  voiceProvider: VoiceProvider,
  /** ISO 639-1, e.g. "en" or "ur"; empty lets the model detect it. */
  voiceLanguage: z.string().trim().max(8),
  /** whisper.cpp's command-line program and model, for offline transcription. */
  whisperPath: z.string().max(1000),
  whisperModel: z.string().max(1000)
})
export type Settings = z.infer<typeof Settings>

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  weekStart: 'monday',
  calendarColorBy: 'category',
  calendarMode: 'month',

  widgetVisible: false,
  widgetAlwaysOnTop: false,
  widgetLocked: false,
  widgetOpacity: 0.92,
  widgetBounds: null,

  launchAtStartup: false,
  closeToTray: true,
  quickAddHotkey: 'CommandOrControl+Shift+Space',

  reminderMinutes: 10,
  dailySummaryTime: '21:00',

  voiceProvider: 'openai',
  voiceLanguage: '',
  whisperPath: '',
  whisperModel: ''
}

export const SettingsPatch = Settings.partial().refine(
  (patch) => Object.keys(patch).length > 0,
  'Nothing to update'
)
export type SettingsPatch = z.infer<typeof SettingsPatch>

/**
 * What a page may change: everything but the whisper.cpp program and model, which Bunty runs.
 * Only main's own file picker sets those, so a compromised page can't pick a program to run.
 */
export const PageSettingsPatch = Settings.omit({ whisperPath: true, whisperModel: true })
  .partial()
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, 'Nothing to update')
export type PageSettingsPatch = z.infer<typeof PageSettingsPatch>

/** The quick-add popup asks to fit its content. */
export const PopupHeight = z.number().int().min(40).max(800)

export const ReportPeriod = z.enum(['day', 'week', 'month'])
export type ReportPeriod = z.infer<typeof ReportPeriod>

export const ReportQuery = z.strictObject({ period: ReportPeriod, anchor: LocalDate })
export type ReportQuery = z.infer<typeof ReportQuery>
