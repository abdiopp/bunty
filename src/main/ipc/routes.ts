import { z } from 'zod'
import type { AppInfo } from '@shared/ipc'
import {
  ActivityQuery,
  Id,
  NewCategory,
  NewTask,
  PopupHeight,
  RemoveTask,
  RescheduleOverdue,
  ReportQuery,
  RescheduleTask,
  PageSettingsPatch,
  TaskQuery,
  UpdateCategory,
  UpdateTask
} from '@shared/schemas'
import type { ActivityRepo } from '../db/activity-repo'
import type { CategoryService } from '../services/category-service'
import type { SettingsService } from '../services/settings-service'
import type { ReportService } from '../services/report-service'
import type { StreakService } from '../services/streak-service'
import type { VoiceService } from '../services/voice-service'
import type { TaskService } from '../services/task-service'
import type { Routes } from './dispatch'

interface Services {
  tasks: TaskService
  categories: CategoryService
  activity: ActivityRepo
  settings: SettingsService
  streaks: StreakService
  backup: {
    exportFile(): Promise<string | null>
    importFile(): Promise<{ tasks: number } | null>
  }
  reports: Pick<ReportService, 'summary'> & {
    exportCsv(query: ReportQuery): Promise<string | null>
    exportPdf(query: ReportQuery): Promise<string | null>
  }
  voice: VoiceService & {
    setApiKey(key: string | null): ReturnType<VoiceService['status']>
    browse(kind: 'program' | 'model'): Promise<string | null>
  }
  /** Window and app-level actions, which live in main/shell.ts. */
  shell: {
    info(): AppInfo
    closeQuickAdd(): void
    resizeQuickAdd(height: number): void
    openQuickAdd(): void
    resizeWidget(size: { width: number; height: number }): void
    showTask(id: string): void
    showMain(): void
    reveal(path: string): void
  }
}

/** OpenAI caps uploads at 25 MB; a two-minute recording is about 4 MB. */
const Audio = z
  .custom<Uint8Array>((value) => value instanceof Uint8Array, 'Expected audio bytes')
  .refine(
    (bytes) => bytes.byteLength > 44 && bytes.byteLength <= 25 * 1024 * 1024,
    'Recording is empty or too long'
  )

const ApiKey = z
  .string()
  .trim()
  .min(20, "That doesn't look like an OpenAI API key")
  .max(300)
  .nullable()

const WidgetSize = z.strictObject({
  width: z.number().int().min(100).max(4000),
  height: z.number().int().min(100).max(4000)
})

export function createRoutes({
  tasks,
  categories,
  activity,
  settings,
  streaks,
  reports,
  backup,
  voice,
  shell
}: Services): Routes {
  return {
    'tasks:list': { input: TaskQuery, run: tasks.list },
    'tasks:get': { input: Id, run: tasks.get },
    'tasks:create': { input: NewTask, run: tasks.create },
    'tasks:update': { input: UpdateTask, run: tasks.update },
    'tasks:complete': { input: Id, run: tasks.complete },
    'tasks:reopen': { input: Id, run: tasks.reopen },
    'tasks:reschedule': { input: RescheduleTask, run: tasks.reschedule },
    'tasks:rescheduleOverdue': { input: RescheduleOverdue, run: tasks.rescheduleOverdue },
    'tasks:remove': { input: RemoveTask, run: tasks.remove },
    'tasks:restore': { input: Id, run: tasks.restore },
    'tasks:counts': { input: z.void(), run: tasks.counts },
    'categories:list': { input: z.void(), run: categories.list },
    'categories:create': { input: NewCategory, run: categories.create },
    'categories:update': { input: UpdateCategory, run: categories.update },
    'categories:remove': { input: Id, run: categories.remove },
    'activity:list': { input: ActivityQuery, run: activity.list },
    'settings:get': { input: z.void(), run: settings.get },
    'settings:update': { input: PageSettingsPatch, run: settings.update },
    'app:info': { input: z.void(), run: shell.info },
    'app:openTask': { input: Id, run: shell.showTask },
    'app:show': { input: z.void(), run: shell.showMain },
    'quickAdd:close': { input: z.void(), run: shell.closeQuickAdd },
    'quickAdd:resize': { input: PopupHeight, run: shell.resizeQuickAdd },
    'quickAdd:open': { input: z.void(), run: shell.openQuickAdd },
    'widget:resize': { input: WidgetSize, run: shell.resizeWidget },
    'streaks:summary': { input: z.void(), run: streaks.summary },
    'streaks:heatmap': { input: z.void(), run: streaks.heatmap },
    'voice:status': { input: z.void(), run: voice.status },
    'voice:setApiKey': { input: ApiKey, run: voice.setApiKey },
    'voice:transcribe': { input: Audio, run: voice.transcribe },
    'voice:browse': { input: z.enum(['program', 'model']), run: voice.browse },
    'reports:summary': { input: ReportQuery, run: reports.summary },
    'reports:exportCsv': { input: ReportQuery, run: reports.exportCsv },
    'reports:exportPdf': { input: ReportQuery, run: reports.exportPdf },
    'app:reveal': { input: z.string().min(1).max(4096), run: shell.reveal },
    'backup:export': { input: z.void(), run: backup.exportFile },
    'backup:import': { input: z.void(), run: backup.importFile }
  }
}
